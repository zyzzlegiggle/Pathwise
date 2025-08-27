import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = BigInt(url.searchParams.get("userId") || "1");
  const jobId  = BigInt(url.searchParams.get("jobId")  || "1");
  const topKSkills = Number(url.searchParams.get("k") || "40"); // skills to consider from JD

  // 🔹 Synthetic placeholder response
  return NextResponse.json({
    cluster: { id: "123", name: "Software Engineering", sim: 0.87 },
    missing: ["GraphQL", "Docker", "AWS"],

    citations: [
      { skillId: "1", name: "JavaScript", start: 120, end: 130, snippet: "... strong JavaScript skills required ..." },
      { skillId: "3", name: "React", start: 300, end: 305, snippet: "... experience with React and modern frontend ..." },
    ],
  });
 

  // 0) load user skills and normalize to ontology nodes (by name/alias OR nearest neighbor)
  const userSkillsRaw = await prisma.userSkill.findMany({
    where: { user_id: userId },
    select: { skill_name: true },
  });
  const userSkillNames = userSkillsRaw.map((s) => s.skill_name.toLowerCase());

  console.log(userSkillsRaw)

  // try exact/alias match first
  const matchedByName = await prisma.skillNode.findMany({
    where: {
      OR: [
        { name: { in: userSkillNames, lte: "insensitive" } },
        { aliases: { path: "$[*]", array_contains: userSkillNames as any } },
      ],
    },
    select: { id: true, name: true },
  });

  const userNodeIds = new Set<string>(matchedByName.map((s) => s.id.toString()));

  console.log(userNodeIds)

  // fallback: embed-based nearest neighbors for unmapped names
  const unmapped = userSkillNames.filter(
    (n) => !matchedByName.some((m) => m.name.toLowerCase() === n)
  );
  if (unmapped.length) {
    for (const n of unmapped) {
      // SELECT top-1 node by cosine distance to the skill text
      const [row] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, 1 - VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR)) AS score
         FROM skill_node
         ORDER BY VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR)) ASC
         LIMIT 1`,
        JSON.stringify([/* optional precomputed — see embedText(n) below */]),
        JSON.stringify([/* same as above */])
      );
      // If you have embedText available server-side here, prefer:
      // const vec = await embedText(n);
      // const [row] = await prisma.$queryRawUnsafe<any[]>(`...`, JSON.stringify(vec), JSON.stringify(vec));
      if (row?.id) userNodeIds.add(String(row.id));
    }
  }

  // 1) fetch job embedding
   const [jrow] = await prisma.$queryRawUnsafe<any[]>(
     `SELECT embedding, description FROM job_texts WHERE job_id = ?`,
     jobId.toString()
   );
   if (!jrow?.embedding) return NextResponse.json({ missing: [], cluster: null, citations: [] });
   const jobDescRaw: string = jrow.description || "";
   const jobDesc = jobDescRaw.toLowerCase();
  // 2) extract skills mentioned in JD via embedding similarity (top-K)
  const jdSkills = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name,
            (1 - VEC_COSINE_DISTANCE(embedding, ?)) AS sim
     FROM skill_node
     ORDER BY sim DESC
     LIMIT ?`,
    jrow.embedding,
    String(topKSkills)
  );
  const mentionedIds = new Set<string>(jdSkills.filter((r: any) => r.sim >= coverageThreshold).map((r: any) => String(r.id)));

  // 3) pick the best role cluster by proximity of its centroid to the JD embedding
  const [bestCluster] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cluster_id, name,
            (1 - VEC_COSINE_DISTANCE(centroid, ?)) AS sim
     FROM role_cluster
     ORDER BY sim DESC
     LIMIT 1`,
    jrow.embedding
  );
  if (!bestCluster) return NextResponse.json({ missing: [], cluster: null });

  // 4) load required skills for the chosen cluster
  const reqSkill = await prisma.$queryRawUnsafe<any[]>(
    `SELECT rcs.skill_id, sn.name, rcs.weight
     FROM role_cluster_skill rcs
     JOIN skill_node sn ON sn.id = rcs.skill_id
     WHERE rcs.cluster_id = ?`,
    bestCluster.cluster_id.toString()
  );

  // 5) compute coverage and gaps
  //    - coverage: required skills that are also “mentioned” in JD (evidence they matter for this posting)
  //    - userHas: user skills (normalized) that match required skills or their ancestors
  // ancestor closure (1 level up for now)
  const ancestors = new Map<string, string | null>();
  const getParentId = async (sid: string) => {
    if (ancestors.has(sid)) return ancestors.get(sid);
    const r = await prisma.skillNode.findUnique({
      where: { id: BigInt(sid) },
      select: { parent_id: true },
    });
    const v = r?.parent_id ? String(r.parent_id) : null;
    ancestors.set(sid, v);
    return v;
  };

  const coverage: { skillId: string; name: string; required: number; mentioned: boolean; userHas: boolean }[] = [];
  const missing: string[] = [];
  const citations: { skillId: string; name: string; start: number; end: number; snippet: string }[] = [];

  for (const s of reqSkill) {
    const sid = String(s.skill_id);
    const mentioned = mentionedIds.has(sid);
    // userHas if exact skill id OR parent matches
    let userHas = userNodeIds.has(sid);
    if (!userHas) {
      const p = await getParentId(sid);
      if (p && userNodeIds.has(p)) userHas = true;
    }
     if (mentioned) {
   const span = await findSpanForSkill(BigInt(sid), s.name);
   if (span) {
     // persist
     await prisma.jobSkillEvidence.upsert({
       where: { job_id_skill_id_start_end: { job_id: jobId, skill_id: BigInt(sid), start: span.start, end: span.end } as any },
       create: { job_id: jobId, skill_id: BigInt(sid), start: span.start, end: span.end, snippet: span.snippet },
       update: { snippet: span.snippet },
     });
     citations.push({ skillId: sid, name: s.name, start: span.start, end: span.end, snippet: span.snippet });
   }
 }
    coverage.push({ skillId: sid, name: s.name, required: s.weight, mentioned, userHas });
    if (!userHas && mentioned) missing.push(s.name);
  }

  // sort missing by cluster weight (descending)
  coverage.sort((a, b) => b.required - a.required);

  return NextResponse.json({
    cluster: { id: String(bestCluster.cluster_id), name: bestCluster.name, sim: Number(bestCluster.sim?.toFixed(3) || 0) },
    missing,
    coverage, // useful for UI: show required/mentioned/userHas flags
    citations,
  });

   // helper to locate best substring span for a skill (name + aliases)
 async function findSpanForSkill(skillId: bigint, fallbackName: string) {
   // fetch aliases quickly
   const node = await prisma.skillNode.findUnique({
     where: { id: skillId },
     select: { name: true, aliases: true },
   });
   const cands = [node?.name || fallbackName, ...((node?.aliases as string[]) || [])]
     .filter(Boolean)
     .map((s) => String(s).toLowerCase());
   let best: { start: number; end: number } | null = null;
   for (const term of cands) {
     const idx = jobDesc.indexOf(term);
     if (idx >= 0) {
       const start = idx;
       const end = idx + term.length;
       if (!best || (end - start) > (best.end - best.start)) best = { start, end };
     }
   }
   if (!best) return null;
   // build windowed snippet (~80 chars around)
   const pad = 80;
   const s = Math.max(0, best.start - pad);
   const e = Math.min(jobDescRaw.length, best.end + pad);
   const snippet = jobDescRaw.slice(s, e).replace(/\s+/g, " ").trim();
   return { ...best, snippet };
 }
}


