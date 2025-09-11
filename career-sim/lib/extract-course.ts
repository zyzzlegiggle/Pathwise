// lib/extract-course.ts
import { structuredOutput, structuredConfig } from "@/lib/llm";

function parseHours(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?|hrs?)/i);
  if (m) return Math.round(parseFloat(m[1]));
  const w = text.match(/(\d+)\s*weeks?.{0,40}?(\d+(?:\.\d+)?)\s*h(?:ours?)?\/?week/i);
  if (w) return Math.round(parseFloat(w[1]) * parseFloat(w[2]));
  return null;
}

function parseCost(text: string): number | null {
  if (/\bfree(?!\s*trial)\b/i.test(text)) return 0;
  const m = text.match(/(?:USD|US\$|\$)\s?(\d+(?:\.\d{2})?)/i);
  return m ? Math.round(parseFloat(m[1])) : null;
}

export async function extractCourse(snapshot: { url: string; title?: string; text: string }, skill: string) {
  const hoursHeu = parseHours(snapshot.text);
  const costHeu = parseCost(snapshot.text);

  const cfg: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        provider: { type: "string" },
        hours: { type: "number", nullable: true },
        cost: { type: "number", nullable: true },
        confidence: { type: "number" },
      },
      required: ["title", "provider", "confidence"],
    },
  };

  const prompt = `Extract course facts from the page text below. 
Rules:
- Only use facts present in the text. If unknown, return null.
- "provider" should be a short name (e.g., "Google", "MITx", "Udemy").
- Return a "confidence" 0–1 reflecting how certain you are this is a course page (not a blog post, forum, etc).

URL: ${snapshot.url}
PAGE_TITLE: ${snapshot.title ?? ""}
SKILL_FOCUS: ${skill}

PAGE_TEXT:
${snapshot.text.slice(0, 6000)}`;

  let parsed: any = {};
  try {
    parsed = JSON.parse(await structuredOutput(prompt, cfg));
  } catch {
    parsed = {};
  }

  return {
    id: crypto.randomUUID(),
    title: parsed.title || snapshot.title || "Untitled",
    provider: parsed.provider || undefined,
    url: snapshot.url,
    hours: hoursHeu ?? parsed.hours ?? null,
    cost: costHeu ?? parsed.cost ?? null,
    skills: [skill],
    kind: "learn" as const,
    _confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

export async function extractProject(snapshot: { url: string; title?: string; text: string }, skill: string) {
  const cfg: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        provider: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["title", "provider", "confidence"],
    },
  };

  const prompt = `Extract a PRACTICE PROJECT from the text below.
A valid project page should be a repo, tutorial, or walkthrough that guides building something.
If it is not a project/tutorial, set confidence near 0.

URL: ${snapshot.url}
PAGE_TITLE: ${snapshot.title ?? ""}
SKILL_FOCUS: ${skill}

PAGE_TEXT:
${snapshot.text.slice(0, 6000)}`;

  let parsed: any = {};
  try {
    parsed = JSON.parse(await structuredOutput(prompt, cfg));
  } catch {
    parsed = {};
  }

  return {
    id: crypto.randomUUID(),
    title: parsed.title || snapshot.title || "Untitled",
    provider: parsed.provider || "Web",
    url: snapshot.url,
    hours: 6, // your “weekend project” default
    cost: 0,
    skills: [skill],
    kind: "project" as const,
    _confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}
