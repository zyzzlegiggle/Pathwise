import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embed";

const URL_RE = /^https?:\/\/(www\.)?linkedin\.com\/.*$/i;

function normSkill(s: string) {
  return s.trim().toLowerCase();
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export async function POST(req: NextRequest) {
  const {
    userId = "1",
    linkedinUrl,
    resumeText = "",
    shortForm = {
      yearsExperience: null as null | number,
      stacks: [] as string[],
      education: "" as string,
    },
  } = await req.json();

  const uid = BigInt(userId);

  // --- basic validation ---
  if (linkedinUrl && !URL_RE.test(linkedinUrl)) {
    return NextResponse.json({ ok: false, error: "Invalid LinkedIn URL" }, { status: 400 });
  }
  if (shortForm?.yearsExperience != null) {
    const y = Number(shortForm.yearsExperience);
    if (!Number.isFinite(y) || y < 0 || y > 50) {
      return NextResponse.json({ ok: false, error: "yearsExperience must be 0–50" }, { status: 400 });
    }
  }
  const stacks = Array.isArray(shortForm?.stacks) ? shortForm.stacks.map(String).map((s) => s.trim()).filter(Boolean) : [];

  // --- upsert base user & profile ---
  await prisma.user.upsert({
    where: { user_id: uid },
    create: { email: `u${userId}@demo.local` },
    update: {},
  });

  await prisma.userProfile.upsert({
    where: { user_id: uid },
    create: {
      user_id: uid,
      linkedin_url: linkedinUrl || null,
      years_experience: shortForm?.yearsExperience ?? null,
      stacks: stacks,
      education: shortForm?.education || null,
    },
    update: {
      linkedin_url: linkedinUrl || null,
      years_experience: shortForm?.yearsExperience ?? null,
      stacks: stacks,
      education: shortForm?.education || null,
    },
  });

  // --- optional: store resume embedding if provided (reuse your existing approach) ---
  if (resumeText && resumeText.trim().length > 20) {
    const vec = await embedText(resumeText);
    await prisma.resume.upsert({
      where: { user_id: uid },
      create: { user_id: uid, raw_text: resumeText },
      update: { raw_text: resumeText },
    });
    await prisma.$executeRawUnsafe(
      "UPDATE `resumes` SET embedding = VEC_FROM_TEXT(?) WHERE `user_id` = ?",
      `[${vec.join(",")}]`,
      uid.toString()
    );
  }

  // --- skill dedupe/normalization ---
  // Gather candidate skills from shortForm.stacks (+ simple extraction from education/resume by alias match)
  const candidateText = [stacks.join(", "), shortForm?.education || "", resumeText || ""].join("\n").toLowerCase();

  // load catalog aliases once
  const catalog = await prisma.skillCatalog.findMany({ select: { skill_name: true, aliases: true } });

  const extracted = new Set<string>();
  for (const s of catalog) {
    const names = [s.skill_name, ...((Array.isArray(s.aliases) ? s.aliases : []) as string[])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());
    // if any alias appears in candidate text, accept canonical skill_name
    if (names.some((n) => candidateText.includes(n))) {
      extracted.add(s.skill_name);
    }
  }
  // also add raw stacks as-is (normalized)
  stacks.forEach((s) => extracted.add(s));

  // de-duped, normalized list
  const finalSkills = uniq(Array.from(extracted)).slice(0, 200);

  // upsert into userSkill (ignore duplicates)
  if (finalSkills.length) {
    const existing = await prisma.userSkill.findMany({
      where: { user_id: uid },
      select: { skill_name: true },
    });
    const have = new Set(existing.map((r) => normSkill(r.skill_name)));
    const toInsert = finalSkills.filter((s) => !have.has(normSkill(s)));
    for (const name of toInsert) {
      await prisma.userSkill.create({ data: { user_id: uid, skill_name: name } });
    }
  }

  return NextResponse.json({
    ok: true,
    saved: {
      linkedinUrl: linkedinUrl || null,
      yearsExperience: shortForm?.yearsExperience ?? null,
      stacks: finalSkills,
    },
  });
}
