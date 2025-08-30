import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embedText, structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";



export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body.userId ?? "1");
    const resumeText: string = String(body.resumeText ?? "");
    const yearsExperience = body.yearsExperience ?? null;
    const education: string = String(body.education ?? "");
    const skills: string[] = body.skills ?? [];
    const userName: string = body.userName ?? ""

    if (!resumeText || resumeText.trim().length < 20) {
      return NextResponse.json({ ok: false, error: "Resume must be provided or too short" }, { status: 400 });
    }
    if (yearsExperience != null) {
      const y = Number(yearsExperience);
      if (!Number.isFinite(y) || y < 0 || y > 50) {
        return NextResponse.json({ ok: false, error: "yearsExperience must be 0–50" }, { status: 400 });
      }
    }

    const uid = BigInt(userId);

    const candidateText = [
      skills.join(", "),
      education,
      resumeText.slice(0, 20000),
    ].join("\n").toLowerCase();

    const hasWord = (needle: string) => {
      const n = needle.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^a-z0-9_])${n}([^a-z0-9_]|$)`, "i");
      return re.test(` ${candidateText} `);
    };

    const catalog = await prisma.skillNode.findMany({ select: { name: true, aliases: true } });

    const extracted = new Set<string>();
    for (const s of catalog) {
      const names = [s.name, ...((Array.isArray(s.aliases) ? s.aliases : []) as string[])]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase());
      if (names.some(hasWord)) extracted.add(s.name);
    }
    for (const s of skills) extracted.add(s);

    const finalSkills = Array.from(extracted).slice(0, 200);

    await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { user_id: uid },
        create: { email: `u${userId}@demo.local`, name: userName },
        update: {},
      });

      await tx.userProfile.upsert({
        where: { user_id: uid },
        create: {
          user_id: uid,
          resume: resumeText,
          years_experience: yearsExperience ?? null,
          education: education || null,
        },
        update: {
          resume: resumeText,
          years_experience: yearsExperience ?? null,
          education: education || null,
        },
      });

      const vec = await embedText(resumeText);
      const vecStr = `[${vec.join(",")}]`;
      await tx.$executeRawUnsafe(
        "UPDATE `user_profile` SET resume_embedding = VEC_FROM_TEXT(?) WHERE `user_id` = ?",
        vecStr,
        uid.toString()
      );

      if (finalSkills.length) {
        const existing = await tx.userSkill.findMany({ where: { user_id: uid }, select: { skill_name: true } });
        const have = new Set(existing.map((r) => r.skill_name.trim().toLowerCase()));
        const toInsert = finalSkills.filter((s) => !have.has(s.trim().toLowerCase()));
        
        await Promise.all(
          toInsert.map((name) => tx.userSkill.create({ data: { user_id: uid, skill_name: name, last_updated: new Date()} }))
        );
      }
    });

    return NextResponse.json({ ok: true, skills: finalSkills, yearsExperience, education });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Unexpected error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

