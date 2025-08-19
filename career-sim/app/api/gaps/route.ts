import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Very naive: match skills by string contains; improve with vector sim later
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = BigInt(url.searchParams.get("userId") || "1");
  const jobId = BigInt(url.searchParams.get("jobId") || "1");

  // get user skills (schema: UserSkill.user_id, .skill_name)
  const userSkills = await prisma.userSkill.findMany({
    where: { user_id: userId },
    select: { skill_name: true },
  });
  const userSkillNames = userSkills.map((s) => s.skill_name.toLowerCase());

  // get job description text (assumed schema: JobText.job_id, .description)
  const jt = await prisma.jobText.findUnique({
    where: { job_id: jobId },
    select: { description: true },
  });
  if (!jt?.description) return NextResponse.json({ missing: [] });

  const jobDesc = jt.description.toLowerCase();

  // get catalog (schema: SkillCatalog.skill_name, .aliases Json?)
  const skills = await prisma.skillCatalog.findMany({
    select: { skill_name: true, aliases: true },
  });

  // naive gap detection
  const missing: string[] = [];
  for (const s of skills) {
    // aliases is Json? — treat as string[]
    const aliases = Array.isArray(s.aliases) ? (s.aliases as unknown as string[]) : [];
    const allNames = [s.skill_name, ...aliases]
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase());

    const has = allNames.some((name) => userSkillNames.includes(name));
    const mentioned = allNames.some((name) => jobDesc.includes(name));

    if (!has && mentioned) {
      missing.push(s.skill_name);
    }
  }

  return NextResponse.json({ missing });
}
