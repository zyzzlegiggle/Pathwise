// app/api/week-plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import { clamp } from "@/lib/utils";
import { PathExplorerData, PathTarget, ResourceLite } from "@/types/path-explorer-data";
import { WeekItem, WeekPlanResponse } from "@/types/week-plan";

/** Make a simple, reasonable, deterministic fallback plan if LLM/DB are unavailable. */
function fallbackPlan(hours: number, topGaps: string[], bridges: PathExplorerData["bridges"] | undefined,

   courses: ResourceLite[] = [],     // NEW
  projects: ResourceLite[] = [] 
): WeekPlanResponse {
  const perWeek = clamp(Math.round(hours), 4, 20);
  const base: { title: string; tasks: string[] }[] = [
    { title: "Clarify goals, gather achievements", tasks: ["Define 1–2 target roles", "List 5–8 quantified wins", "Collect work samples/links"] },
    { title: "Refresh core skills, draft portfolio", tasks: ["Pick 2 core gaps to focus", "Outline portfolio structure", "Draft 1 case page"] },
    { title: "Create 1–2 work samples", tasks: ["Ship 1 ‘good enough’ demo", "Write short readme with metrics"] },
    { title: "Resume & profile revamp", tasks: ["STAR bullets", "ATS-friendly resume", "LinkedIn headline + about"] },
    { title: "Mock interviews & feedback", tasks: ["1 behavioral mock", "1 technical/case mock", "Incorporate feedback"] },
    { title: "Case practice / role-plays", tasks: ["Daily 30-min drills", "Record & review answers"] },
    { title: "Targeted learning module", tasks: ["Finish 1 course module", "Do end-of-module quiz"] },
    { title: "Networking: 5 warm reach-outs", tasks: ["Draft outreach template", "Schedule 2 chats"] },
    { title: "Applications & tailored notes", tasks: ["Apply to 6–10 roles", "Write 3 targeted notes"] },
    { title: "Portfolio polish & metrics", tasks: ["Add metrics & before/after", "Tighten copy, remove fluff"] },
    { title: "Interview loops & follow-ups", tasks: ["Thank-you notes", "Prepare take-homes"] },
    { title: "Offer prep & negotiation basics", tasks: ["Comp bands research", "Practice counters"] },
  ];


  const learnFromBridges = bridges?.find(b => b.id.includes("foundational"))?.resources ?? [];
  const projFromBridges  = bridges?.find(b => b.id.includes("portfolio"))?.resources ?? [];
// NEW: merge + de-dupe (id preferred)
  const byKey = (xs: ResourceLite[]) => {
    const map = new Map<string, ResourceLite>();
    for (const r of xs) map.set(r.id ?? `${r.title}|${r.provider ?? ""}`, r);
    return [...map.values()];
  };

  const learnPool = byKey([...learnFromBridges, ...courses]);
  const projPool  = byKey([...projFromBridges,  ...projects]);

  const weeks = base.map((b, i) => {
    const wk = i + 1;
    const focusSkills = topGaps.slice(i % Math.max(1, topGaps.length), (i % Math.max(1, topGaps.length)) + 2);

    // Weeks 1–4 → courses; 5–8 → projects; 9–12 → optional/none
    const bundle =
      wk <= 4 ? learnPool.slice(i, i + 2)
    : wk <= 8 ? projPool.slice(i, i + 2)
    : [];

    return {
      week: wk,
      title: b.title,
      focusSkills,
      tasks: b.tasks,
      targetHours: perWeek,
      resources: bundle.length ? bundle : undefined,
    };
  });

  return { role: "Associate PM", weeks };
}

/** Ask LLM to synthesize a personalized 12-week plan (uses Path Explorer + profile). */
async function llmWeekPlan(input: {
  hours: number;
  location: string;
  targets: PathTarget[];
  topGaps: string[];
  userSkills: string[];
  bridges: PathExplorerData["bridges"];
  courses: ResourceLite[];     
  projects: ResourceLite[];    
  resume?: string;
  years?: number | null;
  education?: string | null;
  role : string;
}): Promise<WeekPlanResponse> {
  const schema: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        weeks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              week: { type: Type.INTEGER },
              title: { type: Type.STRING },
              focusSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
              targetHours: { type: Type.INTEGER },
           
            },
            required: ["week", "title", "focusSkills", "tasks", "targetHours"],
          },
        },
      },
      required: ["weeks"],
    },
  };

    const courseDigest = input.courses.slice(0, 60).map(r =>
    `- [course] ${r.title}${r.provider ? ` (${r.provider})` : ""}${r.url ? ` → ${r.url}` : ""} | skills: ${r.skills?.join(", ") || "—"} | ~${r.hours ?? "?"}h`
  ).join("\n");

  const projectDigest = input.projects.slice(0, 60).map(r =>
    `- [project] ${r.title}${r.provider ? ` (${r.provider})` : ""}${r.url ? ` → ${r.url}` : ""} | skills: ${r.skills?.join(", ") || "—"} | ~${r.hours ?? "?"}h`
  ).join("\n");

  const bridgeDigest = input.bridges.map(b => {
    const rs = (b.resources ?? []).slice(0, 30).map(r =>
      `- [${r.kind}] ${r.title}${r.provider ? ` (${r.provider})` : ""}${r.url ? ` → ${r.url}` : ""} | skills: ${r.skills?.join(", ") || "—"} | ~${r.hours ?? "?"}h`);
    return `Bridge: ${b.label}\n${rs.join("\n")}`;
  }).join("\n\n");

  const prompt = `
Design a concise, doable 12-week plan...
[snip existing instructions]

Bridges & resources (prefer when relevant):
${bridgeDigest}

Additional foundational courses (prefer for "Foundation" weeks):
${courseDigest || "—"}

Additional portfolio projects (prefer for "Build/Launch" weeks):
${projectDigest || "—"}

Resume snippet (truncate to 1200 chars max):
${(input.resume ?? "").slice(0, 1200)}
`;

  const raw = await structuredOutput(prompt, schema);
  const parsed = JSON.parse(raw) as WeekPlanResponse;

  const perWeek = clamp(Math.round(input.hours), 4, 20);

let weeks: WeekItem[] = (parsed.weeks ?? [])
  .map((w, i) => ({
    week: typeof w.week === "number" ? w.week : i + 1,
    title: String(w.title || `Week ${i + 1}`),
    focusSkills: Array.isArray(w.focusSkills) ? w.focusSkills.slice(0, 3) : [],
    tasks: Array.isArray(w.tasks) ? w.tasks.slice(0, 6) : [],
    targetHours: clamp(Number(w.targetHours ?? perWeek), 4, 20),
    // IMPORTANT: drop any LLM-provided resources here
  }))
  .slice(0, 12);

// Fill any missing weeks from fallback titles/tasks, but still without resources
const fb = fallbackPlan(input.hours, input.topGaps, input.bridges, input.courses, input.projects).weeks;
while (weeks.length < 12) weeks.push({ ...fb[weeks.length], resources: undefined });

// NOW attach resources from courses/projects/bridges
const { learnPool, projPool } = buildResourcePools({
  bridges: input.bridges,
  courses: input.courses,
  projects: input.projects,
});

weeks = weeks.map(w => {
  const resources = pickResourcesForWeek(w.week, w.focusSkills ?? [], learnPool, projPool, 2);
  return resources.length ? { ...w, resources } : w; // only include when we have matches
});

return { role: input.role, weeks, echo: { usedLLM: true } };
}

function dedupeByIdOrKey<T extends { id?: string; title?: string; provider?: string }>(xs: T[]) {
  const m = new Map<string, T>();
  for (const r of xs) m.set(r.id ?? `${r.title}|${r.provider ?? ""}`, r);
  return [...m.values()];
}

function buildResourcePools({
  bridges, courses = [], projects = [],
}: {
  bridges?: PathExplorerData["bridges"];
  courses?: ResourceLite[];
  projects?: ResourceLite[];
}) {
  const learnFromBridges = bridges?.find(b => b.id.includes("foundational"))?.resources ?? [];
  const projFromBridges  = bridges?.find(b => b.id.includes("portfolio"))?.resources ?? [];
  return {
    learnPool: dedupeByIdOrKey<ResourceLite>([...learnFromBridges, ...courses]),
    projPool:  dedupeByIdOrKey<ResourceLite>([...projFromBridges,  ...projects]),
  };
}

function pickResourcesForWeek(
  weekNum: number,
  focusSkills: string[],
  learnPool: ResourceLite[],
  projPool: ResourceLite[],
  count = 2
): ResourceLite[] {
  const inFoundation = weekNum <= 4;
  const inBuild      = weekNum >= 5 && weekNum <= 8;
  const pool = inFoundation ? learnPool : inBuild ? projPool : [];
  if (!pool.length) return [];
  const norm = (s: string) => s.toLowerCase();
  const fset = new Set(focusSkills.map(norm));

  const scored = pool.map(r => ({
    r,
    score: (r.skills ?? []).map(norm).reduce((acc, s) => acc + (fset.has(s) ? 1 : 0), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, Math.min(count, 3))).map(s => s.r);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const hours = Number(body.hours ?? 10);
    const location = String(body.location ?? "Singapore");

    // Profile bits (optional)
    const profile = body.profile ?? body.userProfile ?? {};
    const resume: string | undefined = profile?.resume ?? undefined;
    const years: number | null = profile?.years_experience ?? null;
    const education: string | null = profile?.education ?? null;
    const preferredRole: string | undefined = body.preferredRole; 

    // Path Explorer bits (optional)
    const pathData: PathExplorerData | undefined = body.pathData;
    const targets = pathData?.targets ?? [];
    const bridges = pathData?.bridges ?? [];
    const topGaps = pathData?.meta?.topGaps ?? [];
    const userSkills = pathData?.meta?.userSkills ?? [];
    const courses   = pathData?.courses ?? [];
    const projects  = pathData?.projects ?? [];

    const role =
      preferredRole
      ?? targets[0]?.label
      ?? "Associate PM"; // safe default

    // phases to help the UI collapse
    const phases = [
      { label: "Foundation", start: 1, end: 4 },
      { label: "Build", start: 5, end: 8 },
      { label: "Launch", start: 9, end: 12 },
    ];

    // Try LLM; if anything goes wrong, fall back
    try {
      const llm = await llmWeekPlan({
        hours,
        location,
        targets,
        topGaps,
        userSkills,
        bridges,
        courses, 
    projects, 
        resume,
        years,
        education,
        role
      });
      return NextResponse.json({ phases, ...llm });
    } catch (e) {
      const fb = fallbackPlan(hours, topGaps, bridges);
      return NextResponse.json({ phases, ...fb, echo: { usedLLM: false } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// Optional: GET proxy to sane defaults so you can test quickly
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hours = Number(url.searchParams.get("hours") ?? "10");
  const location = url.searchParams.get("location") ?? "Singapore";
  return NextResponse.json(fallbackPlan(hours, [], []));
}
