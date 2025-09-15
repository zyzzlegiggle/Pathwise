// app/api/evidence/route.ts
import { NextResponse } from "next/server";
import { serpSearchUrls } from "@/lib/search-serpapi";
import { fetchSnapshot } from "@/lib/fetch-page";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import { Type } from "@google/genai";

export type EvidenceItem = { text: string; weight: number; source?: string; url?: string };
export type EvidenceBuckets = {
  comparableOutcomes: EvidenceItem[];
  alumniStories: EvidenceItem[];
  marketNotes: EvidenceItem[];
};

type Input = {
  location: string;
  roleA?: string;
  roleB?: string;
  approachA?: string;
  approachB?: string;
  limitPerBucket?: number; // default 5
};

// ---- helpers
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

function domainFromUrl(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

function scoreWeight(text: string, qTerms: string[]) {
  const t = text.toLowerCase();
  const hits = qTerms.reduce((acc, term) => acc + (t.includes(term.toLowerCase()) ? 1 : 0), 0);
  return clamp(0.25 + hits * 0.15, 0.3, 0.95);
}

function pickSnippet(text: string, maxChars = 420) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function bucketQueries(location: string, roleA?: string, roleB?: string, approachA?: string, approachB?: string) {
  const roles = uniq([roleA, roleB].filter(Boolean) as string[]);
  const approaches = uniq([approachA, approachB].filter(Boolean) as string[]);
  const rolePart = roles.length ? `(${roles.join(" OR ")})` : "";
  const approachPart = approaches.length ? `(${approaches.join(" OR ")})` : "";
  const locPart = location ? `"${location}"` : "";

  return {
    comparableOutcomes: [
      `${rolePart} salary outcomes ${locPart}`,
      `${rolePart} first job offer timeline ${locPart}`,
      `${rolePart} placement rate ${approachPart} ${locPart}`,
    ],
    alumniStories: [
      `${rolePart} career transition story ${approachPart} ${locPart}`,
      `${rolePart} alumni story ${locPart}`,
      `${rolePart} portfolio project ${locPart}`,
    ],
    marketNotes: [
      `${rolePart} hiring trends ${locPart}`,
      `${rolePart} demand ${locPart}`,
      `${rolePart} interview market ${locPart}`,
    ],
  };
}

/** Summarize an array of sources with the LLM (order-preserving). */
async function llmSummaries(items: { title?: string; text: string; url: string }[]): Promise<string[]> {
  if (!items.length) return [];

  const cfg: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        summaries: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["summaries"],
    },
  };

  // Single prompt for a small batch to keep it fast and cheap.
  // (If you ever raise per-bucket caps a lot, chunk the inputs 8–10 at a time.)
  const examples = items.map((it, i) => {
    const head = it.title ? `${it.title}\n` : "";
    // keep it small—text is already a sanitized snippet
    return `#${i + 1}\n${head}${it.text}`;
  }).join("\n\n---\n\n");

  const prompt = `You are given several short source snippets (title + text when available).
For EACH item, write ONE brief, neutral description (<= 45 words), suitable for a sidebar evidence chip.
- Prefer concrete facts or numbers present in the text.
- No hype; no first person; no invented details.
- Do not include URLs or citations. Just the description line.

Return JSON with { "summaries": ["...", "...", ...] } in the SAME ORDER.

Sources:
${examples}
`;

  try {
    const res = await structuredOutput(prompt, cfg);
    const parsed = JSON.parse(res) as { summaries?: unknown[] };
    const out = Array.isArray(parsed.summaries)
      ? parsed.summaries.map(s => (typeof s === "string" ? s.trim() : ""))
      : [];
    // pad or trim to match input length
    return items.map((_, i) => out[i] || "");
  } catch {
    return items.map(() => "");
  }
}

async function queryBucket(queries: string[], need = 5) {
  const prelim: { title?: string; text: string; url: string; weight: number; source?: string }[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (prelim.length >= need) break;

    const urls = await serpSearchUrls(q, 5); // small fanout per query
    for (const url of urls) {
      if (prelim.length >= need) break;

      try {
        const snap = await fetchSnapshot(url); // { url, title?, text }
        if (!snap?.text) continue;

        const key = (snap.url || url).replace(/[#?].*$/, "");
        if (seen.has(key)) continue;
        seen.add(key);

        const snippet = pickSnippet(snap.text, 600); // give LLM a bit more context
        if (!snippet) continue;

        const terms = q.split(/\s+/).filter(Boolean);
        const weight = scoreWeight(`${snap.title ?? ""} ${snippet}`, terms);
        const dom = domainFromUrl(snap.url || url);

        prelim.push({
          title: snap.title,
          text: snippet,
          url: snap.url || url,
          source: dom || undefined,
          weight,
        });
      } catch {
        // ignore this URL
      }
    }
  }

  // LLM: turn prelim snippets into concise blurbs
  const summaries = await llmSummaries(prelim.map(p => ({ title: p.title, text: p.text, url: p.url })));

  // Build final items (fallback to snippet if summary empty)
  const items: EvidenceItem[] = prelim.map((p, i) => ({
    text: (summaries[i] && summaries[i].length > 0)
      ? (p.title ? `${p.title}: ${summaries[i]}` : summaries[i])
      : (p.title ? `${p.title}: ${pickSnippet(p.text, 420)}` : pickSnippet(p.text, 420)),
    weight: p.weight,
    source: p.source,
    url: p.url,
  }));

  return items
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, need);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Input;
    const {
      location = "Singapore",
      roleA, roleB, approachA, approachB,
      limitPerBucket = 5,
    } = body;

    const qs = bucketQueries(location, roleA, roleB, approachA, approachB);

    const [comparableOutcomes, alumniStories, marketNotes] = await Promise.all([
      queryBucket(qs.comparableOutcomes, limitPerBucket),
      queryBucket(qs.alumniStories,     limitPerBucket),
      queryBucket(qs.marketNotes,       limitPerBucket),
    ]);

    return NextResponse.json({ comparableOutcomes, alumniStories, marketNotes } as EvidenceBuckets);
  } catch (e: any) {
    return NextResponse.json(
      { comparableOutcomes: [], alumniStories: [], marketNotes: [], error: e?.message ?? "failed" },
      { status: 200 } // soft-fail so UI renders gracefully
    );
  }
}
