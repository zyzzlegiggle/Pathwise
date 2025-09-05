import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";
import { prisma } from "@/lib/db";

type DecisionMetrics = { firstOffer: string; comp1y: string; comp3y: string; risk: string; burnout: string };
type EvidenceItem = { text: string; weight: number; source?: string; url?: string };
type EvidenceBuckets = {
  comparableOutcomes: EvidenceItem[]; alumniStories: EvidenceItem[]; marketNotes: EvidenceItem[];
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const gaussian = (m: number, sd: number, x: number) => Math.exp(-((x - m) ** 2) / (2 * sd * sd));
const makeTTFO = (mean: number, sd: number) => {
  const out: { week: number; Safe: number; Aggressive: number }[] = [];
  for (let w = 2; w <= 40; w++) out.push({ week: w, Safe: gaussian(mean + 2, sd, w), Aggressive: gaussian(mean - 3, sd * 0.8, w) });
  return out;
};

async function getUserContext(prisma: PrismaClient, userId?: number) {
  if (userId === undefined) return { profile: null as null | any, skills: [] as string[] };
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { user_id: BigInt(userId) },
      select: { resume: true, years_experience: true, education: true },
    });
    const skillsRows = await prisma.userSkill.findMany({
      where: { user_id: BigInt(userId) },
      select: { skill_name: true },
      orderBy: { skill_name: "asc" },
      take: 100,
    });
    return { profile, skills: skillsRows.map(s => s.skill_name) };
  } catch {
    return { profile: null, skills: [] };
  }
}

// ---- LLM
async function llmDecisionSupport(input: {
  location: string; hours: number;
  pathA: { role: string; approach: string; missingSkills: string[] };
  pathB: { role: string; approach: string; missingSkills: string[] };
  resume?: string; years?: number | null; education?: string | null; skills: string[];
}): Promise<{ metricsA?: DecisionMetrics; metricsB?: DecisionMetrics; evidence: EvidenceBuckets }> {
  const schema: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        metricsA: { type: Type.OBJECT, properties: { firstOffer: { type: Type.STRING }, comp1y: { type: Type.STRING }, comp3y: { type: Type.STRING }, risk: { type: Type.STRING }, burnout: { type: Type.STRING } }, required: ["firstOffer","comp1y","comp3y","risk","burnout"] },
        metricsB: { type: Type.OBJECT, properties: { firstOffer: { type: Type.STRING }, comp1y: { type: Type.STRING }, comp3y: { type: Type.STRING }, risk: { type: Type.STRING }, burnout: { type: Type.STRING } }, required: ["firstOffer","comp1y","comp3y","risk","burnout"] },
        evidence: {
          type: Type.OBJECT,
          properties: {
            comparableOutcomes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, weight: { type: Type.NUMBER }, source: { type: Type.STRING }, url: { type: Type.STRING } }, required: ["text","weight"] } },
            alumniStories: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, weight: { type: Type.NUMBER }, source: { type: Type.STRING }, url: { type: Type.STRING } }, required: ["text","weight"] } },
            marketNotes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, weight: { type: Type.NUMBER }, source: { type: Type.STRING }, url: { type: Type.STRING } }, required: ["text","weight"] } },
          },
          required: ["comparableOutcomes","alumniStories","marketNotes"],
        },
      },
      required: ["metricsA","metricsB","evidence"],
    },
  };

  const prompt = `
You compare two career paths to a target role. Create realistic, conservative metrics for ${input.location}.
Explain briefly with evidence snippets. Keep each snippet under 100 words. If uncertain, reduce weight.

Situation
Location: ${input.location}
Hours/week: ${input.hours}

Path A: role=${input.pathA.role}; approach=${input.pathA.approach}; gaps=${input.pathA.missingSkills.join(", ") || "none"}
Path B: role=${input.pathB.role}; approach=${input.pathB.approach}; gaps=${input.pathB.missingSkills.join(", ") || "none"}

Candidate
Years experience: ${input.years ?? "unknown"}
Education: ${input.education ?? "unknown"}
Skills: ${input.skills.join(", ") || "unknown"}
Resume snippet: ${(input.resume ?? "").slice(0, 1500)}

Output rules
- firstOffer as "<integer> wks"
-1 year compensation in currency based on its location. Example: USD 100, SGD 100, MYR 100
-3 year compensation in currency based on its location. Example: USD 100, SGD 100, MYR 100
- risk/burnout: Low/Medium/High
Return JSON per schema only.
`;
  const raw = await structuredOutput(prompt, schema);
  const parsed = JSON.parse(raw);
  return { metricsA: parsed.metricsA, metricsB: parsed.metricsB, evidence: parsed.evidence };
}

// ---- heuristics fallback (simple & transparent)
function heuristics(location: string, hours: number, role: string, approach: string): DecisionMetrics {
  const baseComp =  1000;

  // approach speed tweaks (weeks: negative = faster)
  const speedAdj: Record<string, number> = {
    "Self-study while employed": 0,
    "Bootcamp / certificate": -1,
    "Internal transfer": -3,
    "New employer job search": +1,
  };
  const adj = speedAdj[approach] ?? 0;
  const weeks = clamp(12 - Math.floor(hours / 6) + adj, 4, 24);

  // very rough role multipliers
  const r = role.toLowerCase();
  const roleMult = r.includes("pm") ? 1.1 : r.includes("ops") ? 0.95 : 1.0;

  const y1 = Math.round(baseComp * roleMult);
  const y3 = Math.round(y1 * (1.45 + (adj < 0 ? 0.05 : 0)));

  const risk =
    approach === "Internal transfer" ? "Low"
    : approach === "Self-study while employed" ? "Medium"
    : approach === "Bootcamp / certificate" ? "Medium-High"
    : "Medium-High";

  const burnout =
    approach === "Self-study while employed" ? "Medium"
    : approach === "Bootcamp / certificate" ? "Medium"
    : approach === "Internal transfer" ? "Low"
    : "Medium-High";

  return {
    firstOffer: `${weeks} wks`,
    comp1y: `${y1.toLocaleString()}`,
    comp3y: `${y3.toLocaleString()}`,
    risk,
    burnout,
  };
}

function mergeEvidence(a: EvidenceBuckets, b: EvidenceBuckets): EvidenceBuckets {
  const cap = (xs: EvidenceItem[], n = 6) => xs.slice(0, n);
  return {
    comparableOutcomes: cap([...(a?.comparableOutcomes ?? []), ...(b?.comparableOutcomes ?? [])]),
    alumniStories: cap([...(a?.alumniStories ?? []), ...(b?.alumniStories ?? [])]),
    marketNotes: cap([...(a?.marketNotes ?? []), ...(b?.marketNotes ?? [])]),
  };
}

// ---- handlers
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const hours = Number(body.hours ?? 10);
  const location = String(body.location ?? "Singapore");
  const targetRoleA = String(body.targetRoleA ?? "Associate PM");
  const targetRoleB = String(body.targetRoleB ?? "Business Analyst");
  const approachA = String(body.approachA ?? "Self-study while employed");
  const approachB = String(body.approachB ?? "Bootcamp / certificate");
  const missingSkillsA = Array.isArray(body.missingSkillsA) ? body.missingSkillsA.filter((x: any) => typeof x === "string") : [];
  const missingSkillsB = Array.isArray(body.missingSkillsB) ? body.missingSkillsB.filter((x: any) => typeof x === "string") : [];
  const userId = body.userId !== undefined ? Number(body.userId) : undefined;

  const { profile, skills } = await getUserContext(prisma, userId);

  // Try LLM
  let metricsA: DecisionMetrics | undefined, metricsB: DecisionMetrics | undefined;
  let evidence: EvidenceBuckets = { comparableOutcomes: [], alumniStories: [], marketNotes: [] };

  try {
    const llm = await llmDecisionSupport({
      location, hours,
      pathA: { role: targetRoleA, approach: approachA, missingSkills: missingSkillsA },
      pathB: { role: targetRoleB, approach: approachB, missingSkills: missingSkillsB },
      resume: profile?.resume, years: profile?.years_experience ?? null, education: profile?.education ?? null, skills,
    });
    metricsA = llm.metricsA;
    metricsB = llm.metricsB;
    evidence = mergeEvidence(evidence, llm.evidence);
  } catch {
    // fall through to heuristics
  }

  // Fallbacks
  const mA = metricsA ?? heuristics(location, hours, targetRoleA, approachA);
  const mB = metricsB ?? heuristics(location, hours, targetRoleB, approachB);
  const ttfo = makeTTFO(16 - Math.round(hours / 4), 4);

  return NextResponse.json({
    metricsA: mA,
    metricsB: mB,
    ttfo,
    evidence,
    echo: {
      location, hours,
      pathA: { role: targetRoleA, approach: approachA, missingSkillsA },
      pathB: { role: targetRoleB, approach: approachB, missingSkillsB },
      resumeChars: profile?.resume?.length ?? 0,
    },
  });
}

export async function GET(req: Request) {
  // keep GET working by proxying to POST-like behavior with defaults
  const url = new URL(req.url);
  return POST(new Request(req.url, {
    method: "POST",
    body: JSON.stringify({
      hours: Number(url.searchParams.get("hours") ?? "10"),
      location: url.searchParams.get("location") ?? "Singapore",
      targetRoleA: url.searchParams.get("targetRoleA") ?? "Associate PM",
      targetRoleB: url.searchParams.get("targetRoleB") ?? "Business Analyst",
      approachA: url.searchParams.get("approachA") ?? "Self-study while employed",
      approachB: url.searchParams.get("approachB") ?? "Bootcamp / certificate",
    }),
    headers: { "Content-Type": "application/json" },
  }));
}
