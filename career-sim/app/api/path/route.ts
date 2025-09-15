import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import type { PathExplorerData, ResourceLite } from "@/types/path-explorer-data";
import { prisma } from "@/lib/db";
import { serpSearchUrls } from "@/lib/search-serpapi";
import { courseQuery, projectQuery } from "@/lib/query-builder";
import { fetchSnapshot } from "@/lib/fetch-page";
import { extractCourse, extractProject } from "@/lib/extract-course";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "target";
const norm = (s: string) => s.toLowerCase().replace(/[\s/_-]+/g, " ").trim();
const uniq = <T,>(a: T[]) => Array.from(new Set(a));



// Try DB first: vector search (if available), else keyword search.
// Returns up to `limit` canonical role titles.
async function dbFutureRoles(
  userId: bigint,
  limit = 3,
): Promise<string[]> {
  // Step 1: Fetch embedding from user_profile
  const sqlEmbedding = `
    SELECT resume_embedding
    FROM user_profile
    WHERE user_id = ?
    LIMIT 1
  `;
  // @ts-ignore
  const rows = await prisma.$queryRawUnsafe(sqlEmbedding, userId) as Array<{
    resume_embedding: any;
  }>;

  if (rows.length === 0 || !rows[0].resume_embedding) {
    return [];
  }

  // TiDB / MySQL VECTOR column: raw embedding object/array
  const v = rows[0].resume_embedding;

  // Step 2: Query job_role table by cosine distance
  const sqlRoles = `
    SELECT title
    FROM job_role
    ORDER BY VEC_COSINE_DISTANCE(embedding, ?) ASC
    LIMIT ?
  `;
  // @ts-ignore
  const roles = await prisma.$queryRawUnsafe(sqlRoles, v, limit) as Array<{ title: string }>;

  return roles.map(r => r.title);
}



async function llmFutureRoles(resume: string): Promise<string[]> {
  const config: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: { futureRole: { type: Type.ARRAY, items: { type: Type.STRING } } },
      required: ["futureRole"],
    },
  };

  const prompt = `You are given a text input containing information about a candidate’s background and you are required to predict its possible future jobs/role (max 3).
Return concise, canonical role titles only.

Resume:
${resume}`;

  const res = await structuredOutput(prompt, config);
  const parsed = JSON.parse(res) as { futureRole?: unknown[] };

  const roles: string[] = Array.isArray(parsed.futureRole)
    ? parsed.futureRole.filter((x): x is string => typeof x === "string")
    : [];

  return uniq(roles.map((r) => r.trim()).filter(Boolean)).slice(0, 3);
}

// very lightweight role→skills retrieval from SkillNode (name + aliases)
async function roleRequiredSkills(role: string, limit = 5): Promise<string[]> {
  const terms = uniq([role, ...role.toLowerCase().split(/\s+/).filter(Boolean)]);
  const like = terms.map(() => `LOWER(name) LIKE ?`).join(" OR ");
  const alias = terms.map(() => `JSON_SEARCH(aliases, 'one', ?) IS NOT NULL`).join(" OR ");
  const likes = terms.map((t) => `%${t.toLowerCase()}%`);
  const sql = `
    SELECT id, name, aliases
    FROM skill_node
    WHERE (${like}) ${alias ? `OR (${alias})` : ""}
    LIMIT ?
  `;
  // @ts-ignore
  const rows = (await prisma.$queryRawUnsafe(sql, ...likes, ...terms, limit)) as Array<{
    id: bigint; name: string; aliases: any | null;
  }>;
  // simple ranking by keyword overlap
  const score = (text: string) => {
    const s = norm(text).split(" "); const set = new Set(s);
    let hits = 0; for (const t of terms) if (t.split(" ").every((p) => set.has(p))) hits++;
    return hits;
  };
  return uniq(
    rows
      .map((r) => ({ name: r.name, s: score(`${r.name} ${(Array.isArray(r.aliases) ? r.aliases.join(" ") : "")}`) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((r) => r.name),
  );
}

async function userSkillsFromDB(userId: bigint): Promise<string[]> {
  const rows = await prisma.userSkill.findMany({
    where: { user_id: userId as any },
    select: { skill_name: true },
    take: 500,
  });
  return uniq(rows.map((r: any) => r.skill_name));
}

async function skillsFromResumeFallback(resume: string): Promise<string[]> {
  if (!resume?.trim()) return [];
  const cfg: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: { skills: { type: Type.ARRAY, items: { type: Type.STRING } } },
      required: ["skills"],
    },
  };
  const prompt = `Extract up to 5 canonical skills (tools, frameworks, methodologies) from the resume.
Resume:
${resume}`;
  try {
    const res = await structuredOutput(prompt, cfg);
    const parsed = JSON.parse(res) as { skills?: unknown[] };

    const skills: string[] = Array.isArray(parsed.skills)
      ? parsed.skills.filter((x): x is string => typeof x === "string")
      : [];

    return uniq(skills.map((s) => s.trim()).filter(Boolean)).slice(0, 25);
  } catch {
    return [];
  }
}

function diff(required: string[], have: string[]) {
  const set = new Set(have.map(norm));
  return required.filter((s) => !set.has(norm(s)));
}



const CONF_THRESHOLD_COURSE = 0.45;
const CONF_THRESHOLD_PROJECT = 0.40;

async function extractTopByConfidence<T extends ResourceLite>(
  urls: string[],
  extractor: (snap: any) => Promise<T>,
  minConf: number,
  limit: number
): Promise<T[]> {
  const seen = new Set<string>();
  const out: T[] = [];

  const normUrl = (u?: string) => (u ? u.replace(/[#?].*$/, "").replace(/\/$/, "") : "");

  // process in batches of 2 for quicker early wins
  const batchSize = 2;
  for (let i = 0; i < urls.length && out.length < limit; i += batchSize) {
    const slice = urls.slice(i, i + batchSize);
    const snaps = (await Promise.all(slice.map(fetchSnapshot))).filter(Boolean) as any[];
    const extracted = await Promise.all(snaps.map(extractor));

    for (const e of extracted) {
      const key = normUrl((e as any).url) || (e as any).title;
      if (!key || seen.has(key)) continue;
      if ((e as any)._confidence >= minConf) {
        seen.add(key);
        out.push(e);
        if (out.length >= limit) break; // early stop
      }
    }
  }
  return out;
}

// api/path route.ts
async function webCoursesFor(skill: string, limit = 2): Promise<ResourceLite[]> {
  const want = Math.max(2, Math.min(6, limit * 3)); // usually 3–6
  const urls = await serpSearchUrls(courseQuery(skill), want);
  return extractTopByConfidence(urls, (s) => extractCourse(s, skill), CONF_THRESHOLD_COURSE, limit);
}

async function webProjectsFor(skill: string, limit = 2): Promise<ResourceLite[]> {
  const want = Math.max(2, Math.min(6, limit * 3));
  const urls = await serpSearchUrls(projectQuery(skill), want);
  return extractTopByConfidence(urls, (s) => extractProject(s, skill), CONF_THRESHOLD_PROJECT, limit);
}


// api/path route.ts
const resourceCache = new Map<string, Promise<ResourceLite[]>>();

async function resourcesForGaps(
  gaps: string[],
  kind: "learn" | "project",
  limitPerSkill = 2
): Promise<ResourceLite[]> {
  if (gaps.length === 0) return [];
  const out: ResourceLite[] = [];
  for (const g of gaps) {
    const key = `${kind}:${g}:${limitPerSkill}`;
    const promise = resourceCache.get(key) ?? (kind === "learn"
      ? webCoursesFor(g, limitPerSkill)
      : webProjectsFor(g, limitPerSkill));
    resourceCache.set(key, promise);
    out.push(...await promise);
  }
  return out;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const profile = body?.profile ?? body?.userProfile ?? {};
    const resume: string = profile?.resume ?? "";
    const uid =
      profile?.user_id != null
        ? typeof profile.user_id === "string"
          ? BigInt(profile.user_id)
          : BigInt(profile.user_id)
        : null;

    if (!resume && !uid) {
      return NextResponse.json({ error: "Provide profile.user_id or profile.resume" }, { status: 400 });
    }

    // 1) user skills (used both for DB role ranking & gaps later)
    let userSkills: string[] = [];
    
    if (uid != null) userSkills = await userSkillsFromDB(uid);
    if (userSkills.length === 0 && resume) userSkills = await skillsFromResumeFallback(resume);

    // 2) FUTURE ROLES: Prefer DB job_role → fallback to LLM
    let futureRoles: string[] = []
    console.log(uid);
    if (uid !== null) {
        futureRoles = await dbFutureRoles(uid, 3);
        console.log(futureRoles);
      }
    if (futureRoles.length === 0) {
      futureRoles = await llmFutureRoles(resume);
    }

    if (futureRoles.length === 0) {
      // ... keep your minimal fallback payload
      const minimal: PathExplorerData = {
        targets: [
          { id: "associate-pm", label: "Associate PM", missingSkills: ["Backlog grooming", "PRD writing"] },
          { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
          { id: "ops-analyst", label: "Ops Analystic", missingSkills: ["Excel", "Process mapping"] },
        ],
        bridges: [
          { id: "bridge-foundational", label: "Learn foundational skills", resources: [] },
          { id: "bridge-portfolio", label: "Practice your skills", resources: [] },
        ],
        edges: [
          { source: "you", target: "bridge-foundational" },
          { source: "bridge-foundational", target: "bridge-portfolio" },
          { source: "bridge-portfolio", target: "associate-pm" },
          { source: "bridge-portfolio", target: "business-analyst" },
          { source: "bridge-portfolio", target: "ops-analyst" },
        ],
      };
      return NextResponse.json(minimal);
    }

    // 3) gaps per target (unchanged)
    const targets: PathExplorerData["targets"] = [];
    const gapCounter = new Map<string, number>();
    for (const role of futureRoles) {
      const reqSkills = await roleRequiredSkills(role, 5);
      const missing = diff(reqSkills, userSkills);
      missing.forEach((g) => gapCounter.set(g, (gapCounter.get(g) ?? 0) + 1));
      targets.push({ id: slug(role), label: role, missingSkills: missing.slice(0, 2) });
    }
    const topGaps = Array.from(gapCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // was 5
      .map(([g]) => g);

    // 4) resources for bridges (unchanged)
    const foundational = await resourcesForGaps(topGaps, "learn", 1);
    const portfolio = await resourcesForGaps(topGaps, "project", 1);

    const data: PathExplorerData = {
      targets,
      bridges: [
        { id: "bridge-foundational", label: "Learn foundational skills", resources: foundational },
        { id: "bridge-portfolio", label: "Practice your skills", resources: portfolio },
      ],
      edges: [
        { source: "you", target: "bridge-foundational" },
        { source: "bridge-foundational", target: "bridge-portfolio" },
        ...targets.map((t) => ({ source: "bridge-portfolio", target: t.id })),
      ],
      meta: { userSkills, topGaps },
    };

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Path API error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
