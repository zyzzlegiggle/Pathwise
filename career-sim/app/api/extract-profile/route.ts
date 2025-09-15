// app/api/ingest/route.ts
import { verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { embedText, structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";


type LlmExtracted = {
  skills: string[];
  yearsExperience: number;
  education: string;
  userName: string;
};

function toBigIntId(v: unknown): bigint {
  // Accept "123", 123, or BigInt
  if (typeof v === "bigint") return v;
  if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(v);
  throw new Error("Invalid userId; expected string|number|bigint");
}

function clampYears(n: unknown): number | null {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  const clamped = Math.max(0, Math.min(50, Math.round(x)));
  return clamped;
}

function normalizeSkills(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  // Trim, drop empties, de-dup (case-insensitive but preserve first casing)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out.slice(0, 200); // safety cap
}

async function ingestProfile(userId: bigint, resumeText: string, extracted: LlmExtracted) {
  const skills = normalizeSkills(extracted.skills);
  const years = clampYears(extracted.yearsExperience);
  const education = typeof extracted.education === "string" ? extracted.education.trim() : null;
  const userName = typeof extracted.userName === "string" ? extracted.userName.trim() : null;

  // 1) Do non-DB and long-running work OUTSIDE the transaction
  //    so we don't hold a connection open while waiting on external calls.
  //    (This was likely the main source of your timeout.)
  const embedResume = await embedText(resumeText);
  const embedResumeStr = JSON.stringify(embedResume);

  // 2) Lightweight existence check can also be outside the transaction
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new Error(`User ${userId.toString()} not found`);

  const now = new Date();

  // 3) Keep the transaction SHORT: only DB reads/writes, no network calls,
  //    and avoid per-row concurrent upserts.
  await prisma.$transaction(
    async (tx) => {
      // Update user's name if provided
      if (userName && userName !== user.name) {
        await tx.user.update({ where: { user_id: userId }, data: { name: userName } });
      }

      // Upsert profile fields
      await tx.userProfile.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          resume: resumeText,
          years_experience: years ?? undefined,
          education: education ?? undefined,
        },
        update: {
          resume: resumeText,
          years_experience: years ?? undefined,
          education: education ?? undefined,
        },
      });

      // If resume_embedding is not in your Prisma schema (e.g., TEXT column), keep raw update.
      // If it IS modeled (e.g., JSON), prefer a normal update with Prisma instead.
      await tx.$executeRaw`UPDATE user_profile SET resume_embedding = ${embedResumeStr} WHERE user_id = ${userId}`;

      // --- Skill sync (bulk ops; no Promise.all in-transaction) ---
      const existing = await tx.userSkill.findMany({
        where: { user_id: userId },
        select: { skill_name: true },
      });
      const existingSet = new Set(existing.map((s) => s.skill_name));
      const newSet = new Set(skills);

      const toDelete = [...existingSet].filter((s) => !newSet.has(s));
      const toInsert = [...newSet].filter((s) => !existingSet.has(s));
      const toUpdate = [...newSet].filter((s) => existingSet.has(s)); // bump last_updated for retained skills

      if (toDelete.length) {
        await tx.userSkill.deleteMany({
          where: { user_id: userId, skill_name: { in: toDelete } },
        });
      }

      if (toInsert.length) {
        await tx.userSkill.createMany({
          data: toInsert.map((skill_name) => ({ user_id: userId, skill_name, last_updated: now })),
          skipDuplicates: true,
        });
      }

      if (toUpdate.length) {
        await tx.userSkill.updateMany({
          where: { user_id: userId, skill_name: { in: toUpdate } },
          data: { last_updated: now },
        });
      }
    },
    // Optional: raise the interactive transaction timeout to tolerate brief bursts
    // (defaults are maxWait: 2s, timeout: 5s). Keep this modest; correctness comes from doing less work inside.
    { timeout: 20000, maxWait: 5000 }
  );
}


async function llmExtract(text: string): Promise<LlmExtracted> {
  const config: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        yearsExperience: { type: Type.INTEGER },
        education: { type: Type.STRING },
        userName: { type: Type.STRING },
      },
      required: ["skills", "yearsExperience", "education", "userName"], // keep original
      propertyOrdering: [
        "skills",
        "yearsExperience",
        "education",
        "userName"
      ],
    },
  };

  const llmPrompt = `
You are given a text input containing information about a candidate’s background:

---
${text}
---

Return a strict JSON object adhering to the provided schema. Use integers for yearsExperience. Extract concise, canonical skill names.
`;

  try {
    const res = await structuredOutput(llmPrompt, config);
    const parsed = JSON.parse(res);
    return parsed as LlmExtracted;
  } catch (e: any) {
    throw new Error(`Error in extracting background: ${e.message}`);
  }
}

function sanitizeResume(raw: string): string {
  // strip nulls and trim whitespace
  let s = raw.replace(/\0/g, " ").trim();

  // strip basic HTML tags if someone pasted from a rich editor
  s = s.replace(/<[^>]*>/g, " ");

  // collapse runs of whitespace
  s = s.replace(/\s{2,}/g, " ");

  return s;
}

// --- NEW: validation guard for background text ---
function validateResumeText(raw: string): { ok: true } | { ok: false; reason: string } {
  const text = sanitizeResume(raw);

  // Hard limits
  const minChars = 200;         // require at least a short paragraph or two
  const maxChars = 20_000;      // prevent huge payloads

  if (text.length < minChars) {
    return { ok: false, reason: `Please provide more detail (at least ${minChars} characters).` };
  }
  if (text.length > maxChars) {
    return { ok: false, reason: `Too long (>${maxChars.toLocaleString()} chars). Please trim the content.` };
  }

  // Reject link-only or mostly-link content
  const looksLikeUrlOnly =
    /^(https?:\/\/|www\.)\S+$/i.test(text) ||
    // 85%+ non-space characters are part of a single URL-ish token
    (() => {
      const noSpaces = text.replace(/\s/g, "");
      const urlish = text.match(/https?:\/\/\S+|www\.\S+/gi)?.join("") ?? "";
      return urlish.length > 0 && urlish.length / noSpaces.length >= 0.85;
    })();
  if (looksLikeUrlOnly) {
    return { ok: false, reason: "Please paste the *text* of your background instead of only a link." };
  }

  // Must contain letters and at least a few words
  const letterCount = (text.match(/[A-Za-z]/g) || []).length;
  const wordCount = (text.match(/\b\w+\b/g) || []).length;
  if (letterCount < 50 || wordCount < 30) {
    return { ok: false, reason: "That looks too short or non-text. Add more detail about roles, skills, and education." };
  }

  // Very repetitive / gibberish guard (e.g., spammy characters)
  const topCharRun = (() => {
    let maxRun = 1, run = 1;
    for (let i = 1; i < text.length; i++) {
      run = text[i] === text[i - 1] ? run + 1 : 1;
      if (run > maxRun) maxRun = run;
    }
    return maxRun;
  })();
  if (topCharRun > 50) {
    return { ok: false, reason: "Input looks malformed (very repetitive characters). Please type plain text." };
  }

  return { ok: true };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawText = body?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  // --- NEW: validate early ---
  const check = validateResumeText(rawText);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  const text = sanitizeResume(rawText);

  try {
    const token = req.cookies.get("auth_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyJwt(token);
    const userId = BigInt(String(payload.sub));

    const extracted = await llmExtract(text);
    await ingestProfile(userId, text, extracted);

    return NextResponse.json(extracted);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to extract" }, { status: 500 });
  }
}
