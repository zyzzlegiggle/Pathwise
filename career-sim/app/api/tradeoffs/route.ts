// app/api/tradeoffs/route.ts
import { NextResponse } from "next/server";

// ⬅️ Adjust these imports to your actual helpers (your example used structuredOutput + Type)
import { structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";
import { UserProfile } from "@/types/server/user-profile";

export type PathTarget = {
  id: string;
  label: string;
  missingSkills?: string[];
};

export type TradeoffItem = {
  factor: string;      // e.g., "Portfolio / work samples", "Networking (warm intros)", "SQL"
  lift: number;        // 0..1
  rationale?: string;  // why this helps for THIS user
};

type TradeoffsResponse = { tradeoffs: TradeoffItem[] };

// ---------- Helpers ----------
function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalize(items: { factor: string; weight: number; rationale?: string }[]): TradeoffItem[] {
  const sum = items.reduce((s, x) => s + Math.max(0, x.weight), 0) || 1;
  return items
    .map((x) => ({ factor: x.factor, lift: clamp01(x.weight / sum), rationale: x.rationale }))
    .sort((a, b) => b.lift - a.lift);
}

// Simple deterministic fallback if LLM fails
function heuristicTradeoffs(profile: UserProfile, targets?: PathTarget[]): TradeoffItem[] {
  const missingCounts = new Map<string, number>();
  for (const t of targets ?? []) {
    for (const ms of t.missingSkills ?? []) {
      missingCounts.set(ms, (missingCounts.get(ms) ?? 0) + 1);
    }
  }

  // Baseline buckets with rough priors
  const base: { factor: string; weight: number; rationale: string }[] = [
    {
      factor: "Portfolio / work samples",
      weight: profile.yearsExp < 3 ? 0.9 : 0.5,
      rationale:
        "Strong portfolio shortens trust-building for early career and career pivots.",
    },
    {
      factor: "Interview practice",
      weight: 0.7,
      rationale:
        "Improves pass rates quickly and compounds with other profile upgrades.",
    },
    {
      factor: "Networking (warm intros)",
      weight: 0.7,
      rationale:
        "Warm intros increase response rates and bypass cold-apply funnels.",
    },
    {
      factor: "Mentorship / coaching",
      weight: 0.5,
      rationale:
        "Guided feedback accelerates skill acquisition and portfolio quality.",
    },
    {
      factor: "Public profile (talks, writing)",
      weight: 0.35,
      rationale:
        "Signals expertise and helps recruiters find you for niche roles.",
    },
    {
      factor: "Volunteering / internships",
      weight: profile.yearsExp < 2 ? 0.45 : 0.2,
      rationale:
        "Useful to create real artifacts and references when experience is light.",
    },
  ];

  // Turn missing skills into targeted factors with weight by frequency
  for (const [skill, count] of missingCounts) {
    base.push({
      factor: skill,
      weight: 0.55 + Math.min(0.25, count * 0.1),
      rationale: `This is listed as a gap for target roles; closing it removes a screen-out reason.`,
    });
  }

  return normalize(base);
}

// LLM-backed generator
async function llmTradeoffs(profile: UserProfile, targets?: PathTarget[]): Promise<TradeoffItem[] | null> {
  try {
    const targetSummary =
      (targets ?? [])
        .map(
          (t) =>
            `- ${t.label}${t.missingSkills?.length ? ` (missing: ${t.missingSkills.join(", ")})` : ""}`
        )
        .join("\n") || "None provided";

    const prompt = `
You are ranking the top career levers that will most improve interview chances for THIS candidate.
Return 5–8 items. Each item MUST have:
- factor: short label (e.g., "Portfolio / work samples", "Networking (warm intros)", "SQL")
- lift: a fractional value 0..1, normalized across items (they should roughly sum to 1)
- rationale: 1–2 sentences tailored to THIS candidate

Consider:
- Candidate profile (resume, skills, YoE, education)
- Target roles and missing skills
- General hiring funnel dynamics (response rates, screenouts, portfolio leverage, interviewing)

Candidate:
Name: ${profile.userName}
Years Experience: ${profile.yearsExp}
Education: ${profile.education}
Skills: ${profile.skills?.join(", ") || "N/A"}

Resume:
${profile.resume}

Target roles (and gaps):
${targetSummary}

Do not use pronouns. use You/Your
    `.trim();

    const config: structuredConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tradeoffs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                factor: { type: Type.STRING },
                lift: { type: Type.NUMBER },
                rationale: { type: Type.STRING },
              },
              required: ["factor", "lift"],
            },
          },
        },
        required: ["tradeoffs"],
      },
    } as const;

    const raw = await structuredOutput(prompt, config);
    const parsed = JSON.parse(raw) as TradeoffsResponse;

    // Sanity + normalization
    const items =
      Array.isArray(parsed?.tradeoffs) && parsed.tradeoffs.length
        ? parsed.tradeoffs
        : null;

    if (!items) return null;

    // If lifts aren't normalized, normalize them
    const normalized = normalize(
      items.map((i) => ({
        factor: String(i.factor),
        weight: typeof i.lift === "number" ? i.lift : 0,
        rationale: i.rationale,
      }))
    );

    return normalized;
  } catch {
    return null;
  }
}

// ---------- Route ----------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const profile: UserProfile | undefined = body?.profile;
    const targets: PathTarget[] | undefined = body?.targets;

    if (!profile || typeof profile.resume !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'profile' in request body." },
        { status: 400 }
      );
    }

    const llm = await llmTradeoffs(profile, targets);
    const result = llm ?? heuristicTradeoffs(profile, targets);

    // Guard: always return at least 5 items
    const trimmed = result.slice(0, Math.max(5, Math.min(8, result.length)));

    return NextResponse.json({ tradeoffs: trimmed } satisfies TradeoffsResponse);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to compute tradeoffs." },
      { status: 500 }
    );
  }
}
