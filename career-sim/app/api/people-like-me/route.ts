
import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import type { UserProfile } from "@/types/server/user-profile";


export type SimilarPerson = {
  name: string;            // e.g., "A., 26" (anonymized initial + age if provided by model)
  from: string;            // prior role/title
  to: string;              // new role/title
  time: string;            // duration, e.g., "5 months"
  pay: string;             // compact pay summary, e.g., "$38k → $48k"
  note?: string;           // short tactic, e.g., "Portfolio + referral"
  sources?: { label: string; url?: string }[]; // optional
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const profile: UserProfile | undefined = body?.profile;
    const targets: Array<{ id: string; label: string }> | undefined = body?.targets;

    if (!profile) {
      return NextResponse.json({ error: "Missing required: profile" }, { status: 400 });
    }

    // --- LLM schema & prompt ---
    const config: structuredConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          people: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                from: { type: Type.STRING },
                to: { type: Type.STRING },
                time: { type: Type.STRING },
                pay: { type: Type.STRING },
                note: { type: Type.STRING },
                sources: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      url: { type: Type.STRING },
                    },
                    required: ["label"],
                  },
                },
              },
              required: ["name", "from", "to", "time", "pay"],
            },
          },
        },
        required: ["people"],
        propertyOrdering: ["people"],
      },
    };

    const roleHints = (targets ?? []).map((t) => t.label).slice(0, 4);

    const prompt = `You are helping a career app generate brief, anonymized examples of people with *similar backgrounds* who successfully changed roles.
Return 3–6 concise examples tailored to the candidate. Keep language simple and concrete.

Rules:
- Use very short strings. No fluff.
- "name" should be a short, realistic first name (or first-name-like pseudonym). Avoid initials. Optionally include age in parentheses if safely inferred, e.g., "Aiden (26)".
- Prefer role transitions that match the candidate's likely targets: ${roleHints.join(", ") || "(no hints)"}.
- "pay" should be a compact summary like "$52k → $65k" or "S$4.5k → S$5.8k". If not sure, give a plausible conservative delta.
- "time" is the time-to-offer (not total career time).
- "note" should summarize the key tactic used (e.g., "Portfolio + referral"). make it brief sentence.
- If you reference a public source, include it under "sources" with label + URL; otherwise omit.

Candidate profile:
Name: ${profile.userName}
Years experience: ${profile.yearsExp}
Education: ${profile.education}
Skills: ${profile.skills?.join(", ")}`;

    const raw = await structuredOutput(prompt, config);
    const parsed = JSON.parse(raw) as { people?: unknown };

    const people: SimilarPerson[] = Array.isArray(parsed.people)
      ? (parsed.people as any[])
          .filter((p) => p && typeof p === "object")
          .map((p) => ({
            name: String(p.name ?? "Anon."),
            from: String(p.from ?? ""),
            to: String(p.to ?? ""),
            time: String(p.time ?? "—"),
            pay: String(p.pay ?? "—"),
            note: p.note ? String(p.note) : undefined,
            sources: Array.isArray(p.sources)
              ? p.sources
                  .filter((s: any) => s && typeof s === "object" && s.label)
                  .map((s: any) => ({ label: String(s.label), url: s.url ? String(s.url) : undefined }))
              : undefined,
          }))
          .slice(0, 6)
      : [];

    return NextResponse.json({ people });
  } catch (e: any) {
    console.error("People-like-me API error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

