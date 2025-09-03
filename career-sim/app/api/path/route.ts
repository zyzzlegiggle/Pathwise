import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import type { PathExplorerData, ResourceLite } from "@/types/server/path-explorer-data";
import { prisma } from "@/lib/db";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "target";
const norm = (s: string) => s.toLowerCase().replace(/[\s/_-]+/g, " ").trim();
const uniq = <T,>(a: T[]) => Array.from(new Set(a));


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
async function roleRequiredSkills(role: string, limit = 18): Promise<string[]> {
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

// fetch resources that target any of the gaps (Resource table may be empty)
// if empty, generate **placeholders** per gap
async function resourcesForGaps(
  gaps: string[],
  kind: "learn" | "project",
  limitPerSkill = 2,
): Promise<ResourceLite[]> {
  if (gaps.length === 0) return [];

  // Try DB first (JSON skill_targets or title LIKE)
  const results: ResourceLite[] = [];
  try {
    const orTitle = gaps.map(() => `LOWER(title) LIKE ?`).join(" OR ");
    const orJSON = gaps.map(() => `JSON_SEARCH(skill_targets, 'one', ?) IS NOT NULL`).join(" OR ");
    const likes = gaps.map((g) => `%${g.toLowerCase()}%`);
    const sql = `
      SELECT resource_id, title, provider, url, hours_estimate, cost, skill_targets
      FROM resources
      WHERE (${orTitle}) ${orJSON ? `OR (${orJSON})` : ""}
      LIMIT ?
    `;
    // @ts-ignore
    const rows = (await prisma.$queryRawUnsafe(sql, ...likes, ...gaps, gaps.length * limitPerSkill)) as Array<{
      resource_id: bigint; title: string | null; provider: string | null; url: string | null;
      hours_estimate: any | null; cost: any | null; skill_targets: any | null;
    }>;
    for (const r of rows) {
      results.push({
        id: String(r.resource_id),
        title: r.title ?? "Untitled",
        provider: r.provider ?? undefined,
        url: r.url ?? undefined,
        hours: r.hours_estimate ? Number(r.hours_estimate) : null,
        cost: r.cost ? Number(r.cost) : null,
        skills: Array.isArray(r.skill_targets) ? r.skill_targets : [],
        kind,
      });
    }
  } catch {
    // ignore and fall through to placeholders
  }

  if (results.length > 0) return results.slice(0, gaps.length * limitPerSkill);

  // Placeholders: 1 learn + 1 project per skill (or filtered by kind)
  const placeholders: ResourceLite[] = [];
  let i = 0;
  for (const skill of gaps) {
    if (kind === "learn") {
      placeholders.push({
        id: `ph-learn-${i++}`,
        title: `Intro to ${skill}`,
        provider: "Placeholder",
        url: "#",
        hours: 4,
        cost: 0,
        skills: [skill],
        kind: "learn",
      });
    } else {
      placeholders.push({
        id: `ph-proj-${i++}`,
        title: `Build a mini-project: ${skill} in practice`,
        provider: "Placeholder",
        url: "#",
        hours: 6,
        cost: 0,
        skills: [skill],
        kind: "project",
      });
    }
  }
  return placeholders;
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

    // 1) future roles
    const futureRoles = await llmFutureRoles(resume);
    if (futureRoles.length === 0) {
      const minimal: PathExplorerData = {
        targets: [
          { id: "associate-pm", label: "Associate PM", missingSkills: ["Backlog grooming", "PRD writing"] },
          { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
          { id: "ops-analyst", label: "Ops Analyst", missingSkills: ["Excel", "Process mapping"] },
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

    // 2) user skills
    let userSkills: string[] = [];
    if (uid != null) userSkills = await userSkillsFromDB(uid);
    if (userSkills.length === 0 && resume) userSkills = await skillsFromResumeFallback(resume);

    // 3) gaps per target
    const targets: PathExplorerData["targets"] = [];
    const gapCounter = new Map<string, number>();
    for (const role of futureRoles) {
      const reqSkills = await roleRequiredSkills(role, 16);
      const missing = diff(reqSkills, userSkills);
      missing.forEach((g) => gapCounter.set(g, (gapCounter.get(g) ?? 0) + 1));
      targets.push({ id: slug(role), label: role, missingSkills: missing.slice(0, 8) });
    }
    const topGaps = Array.from(gapCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g]) => g);

    // 4) resources for bridges (use union of top gaps)
    const foundational = await resourcesForGaps(topGaps, "learn", 1);
    const portfolio = await resourcesForGaps(topGaps, "project", 1);

    const data: PathExplorerData = {
      targets,
      bridges: [
        { id: "bridge-foundational", label: "Learn foundational skills", resources: foundational },
        { id: "bridge-portfolio", label: "Practice your skills", resources: portfolio },
      ],
      // clean & readable path, no percentages:
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
