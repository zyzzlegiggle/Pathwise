import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = BigInt(url.searchParams.get("userId") || "1");
  const jobId  = BigInt(url.searchParams.get("jobId")  || "1");
  const topKSkills = Number(url.searchParams.get("k") || "40"); // skills to consider from JD
  const coverageThreshold = Number(url.searchParams.get("t") || "0.25"); // min sim to count as “mentioned”

  // 0) load user skills and normalize to ontology nodes (by name/alias OR nearest neighbor)
  const userSkillsRaw = await prisma.userSkill.findMany({
    where: { user_id: userId },
    select: { skill_name: true },
  });
  const userSkillNames = userSkillsRaw.map((s) => s.skill_name.toLowerCase());

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
  const [jemb] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT embedding FROM job_texts WHERE job_id = ?`,
    jobId.toString()
  );
  if (!jemb?.embedding) return NextResponse.json({ missing: [], cluster: null, coverage: [] });

  // 2) extract skills mentioned in JD via embedding similarity (top-K)
  const jdSkills = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name,
            (1 - VEC_COSINE_DISTANCE(embedding, ?)) AS sim
     FROM skill_node
     ORDER BY sim DESC
     LIMIT ?`,
    jemb.embedding,
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
    jemb.embedding
  );
  if (!bestCluster) return NextResponse.json({ missing: [], cluster: null, coverage: [] });

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

  for (const s of reqSkill) {
    const sid = String(s.skill_id);
    const mentioned = mentionedIds.has(sid);
    // userHas if exact skill id OR parent matches
    let userHas = userNodeIds.has(sid);
    if (!userHas) {
      const p = await getParentId(sid);
      if (p && userNodeIds.has(p)) userHas = true;
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
  });
}
