// app/api/ingest/route.ts
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

export async function POST(req: NextRequest) {
  const { text, userId } = await req.json();

  try {
    const extracted = await llmExtract(String(text ?? ""));
    // Persist to DB using Prisma per schema
    await ingestProfile(toBigIntId(userId), String(text ?? ""), extracted);

    // dont change this
    return NextResponse.json(extracted);
  } catch (e: any) {
    // Surface a clean error message
    throw new Error(`Error in extracting background: ${e.message}`);
  }
}
