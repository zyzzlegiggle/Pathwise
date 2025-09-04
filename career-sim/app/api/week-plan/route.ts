// app/api/week-plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import { clamp } from "@/lib/utils";
import { PathExplorerData, PathTarget, ResourceLite } from "@/types/path-explorer-data";
import { WeekItem, WeekPlanResponse } from "@/types/week-plan";

/** Make a simple, reasonable, deterministic fallback plan if LLM/DB are unavailable. */
function fallbackPlan(hours: number, topGaps: string[], bridges: PathExplorerData["bridges"] | undefined): WeekPlanResponse {
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

  // stitch resources roughly: early weeks bias “learn”, mid weeks “project”, later none/cleanup
  const learn = bridges?.find(b => b.id.includes("foundational"))?.resources ?? [];
  const proj  = bridges?.find(b => b.id.includes("portfolio"))?.resources ?? [];

  const weeks: WeekItem[] = base.map((b, i) => {
    const wk = i + 1;
    const focusSkills = topGaps.slice(i % Math.max(1, topGaps.length), (i % Math.max(1, topGaps.length)) + 2);
    const bundle: ResourceLite[] =
      wk <= 4 ? learn.slice(i, i + 2)
    : wk <= 8 ? proj.slice(i, i + 2)
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

  return {role: "Associate PM", weeks };
}

/** Ask LLM to synthesize a personalized 12-week plan (uses Path Explorer + profile). */
async function llmWeekPlan(input: {
  hours: number;
  location: string;
  targets: PathTarget[];
  topGaps: string[];
  userSkills: string[];
  bridges: PathExplorerData["bridges"];
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
              resources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    provider: { type: Type.STRING },
                    url: { type: Type.STRING },
                    hours: { type: Type.NUMBER },
                    cost: { type: Type.NUMBER },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    kind: { type: Type.STRING },
                  },
                  required: ["id", "title", "kind"],
                },
              },
            },
            required: ["week", "title", "focusSkills", "tasks", "targetHours"],
          },
        },
      },
      required: ["weeks"],
    },
  };

  // give the model your bridges/resources to “snap” to real content instead of inventing
  const bridgeDigest = input.bridges.map(b => {
    const rs = (b.resources ?? []).slice(0, 30).map(r =>
      `- [${r.kind}] ${r.title}${r.provider ? ` (${r.provider})` : ""}${r.url ? ` → ${r.url}` : ""} | skills: ${r.skills?.join(", ") || "—"} | ~${r.hours ?? "?"}h`);
    return `Bridge: ${b.label}\n${rs.join("\n")}`;
  }).join("\n\n");

  const prompt = `
Design a concise, *doable* 12-week plan to reach one of the target roles.
- Use ~${input.hours} hours per week (cap each week between 4 and 20).
- Prefer resources listed under “Bridges” (foundational = learn; portfolio = project). If none match, skip rather than inventing.
- Each week: short title, 2–6 tasks, 1–3 focusSkills (from topGaps or userSkills), targetHours integer.
- Ensure skills recur (spaced repetition), and projects produce tangible artifacts.
- Keep language crisp; no fluff.

Context
Location: ${input.location}
Years: ${input.years ?? "unknown"}, Education: ${input.education ?? "unknown"}
User skills: ${input.userSkills.join(", ") || "—"}
Top gap skills to emphasize: ${input.topGaps.join(", ") || "—"}
Target roles (pick the most plausible one implicitly): ${input.targets.map(t => t.label).join(", ")}

Bridges & resources (use when relevant; otherwise omit resources):
${bridgeDigest}

Resume snippet (truncate to 1200 chars max):
${(input.resume ?? "").slice(0, 1200)}
`;

  const raw = await structuredOutput(prompt, schema);
  const parsed = JSON.parse(raw) as WeekPlanResponse;

  // sanitize & clamp hours
  const perWeek = clamp(Math.round(input.hours), 4, 20);

    const weeks: WeekItem[] = (parsed.weeks ?? [])
    .map((w, i) => {
        const base = {
        week: typeof w.week === "number" ? w.week : i + 1,
        title: String(w.title || `Week ${i + 1}`),
        focusSkills: Array.isArray(w.focusSkills) ? w.focusSkills.slice(0, 3) : [],
        tasks: Array.isArray(w.tasks) ? w.tasks.slice(0, 6) : [],
        targetHours: clamp(Number(w.targetHours ?? perWeek), 4, 20),
        } satisfies Omit<WeekItem, "resources">;

        const res = Array.isArray(w.resources) ? w.resources.slice(0, 3) : undefined;
        return res ? { ...base, resources: res } : base;  // ← include only when present
    })
    .slice(0, 12);

    const fb = fallbackPlan(input.hours, input.topGaps, input.bridges).weeks;
    while (weeks.length < 12) weeks.push(fb[weeks.length]);

  return { role: input.role,weeks, echo: { usedLLM: true } };
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
