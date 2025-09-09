// app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function toBigIntId(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(v);
  throw new Error("Invalid userId; expected string|number|bigint");
}
function clampYears(n: unknown): number | null {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(50, Math.round(x)));
}
function normalizeSkills(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
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
  return out.slice(0, 200);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get("userId") ?? "1"; // fallback like your extractor
    const userId = toBigIntId(userIdParam);

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { name: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const profile = await prisma.userProfile.findUnique({
      where: { user_id: userId },
      select: { years_experience: true, education: true, resume: true },
    });

    const skills = await prisma.userSkill.findMany({
      where: { user_id: userId },
      select: { skill_name: true },
      orderBy: { skill_name: "asc" },
    });

    return NextResponse.json({
      userName: user.name ?? "",
      yearsExperience: profile?.years_experience ?? 0,
      education: profile?.education ?? "",
      resume: profile?.resume ?? "",
      skills: skills.map(s => s.skill_name),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId = "1",
      userName,
      yearsExperience,
      education,
      skills: rawSkills,
    } = body ?? {};

    const id = toBigIntId(userId);
    const years = clampYears(yearsExperience);
    const skills = normalizeSkills(rawSkills);

    const existingUser = await prisma.user.findUnique({ where: { user_id: id } });
    if (!existingUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Update user name
      if (typeof userName === "string" && userName.trim()) {
        await tx.user.update({
          where: { user_id: id },
          data: { name: userName.trim() },
        });
      }

      // Upsert profile fields
      await tx.userProfile.upsert({
        where: { user_id: id },
        create: {
            user_id: id,
            resume: "", // required by schema, even if empty
            years_experience: years ?? undefined,
            education: typeof education === "string" ? education.trim() : undefined,
        },
        update: {
            years_experience: years ?? undefined,
            education: typeof education === "string" ? education.trim() : undefined,
        },
        });


      // Sync skills
      const existing = await tx.userSkill.findMany({
        where: { user_id: id },
        select: { skill_name: true },
      });
      const existingSet = new Set(existing.map(s => s.skill_name));
      const newSet = new Set(skills);

      const toDelete = [...existingSet].filter(s => !newSet.has(s));
      const toInsert = [...newSet].filter(s => !existingSet.has(s));
      const toTouch  = [...newSet].filter(s => existingSet.has(s));

      if (toDelete.length) {
        await tx.userSkill.deleteMany({ where: { user_id: id, skill_name: { in: toDelete } } });
      }
      if (toInsert.length) {
        await tx.userSkill.createMany({
          data: toInsert.map(skill_name => ({ user_id: id, skill_name, last_updated: now })),
          skipDuplicates: true,
        });
      }
      if (toTouch.length) {
        await tx.userSkill.updateMany({
          where: { user_id: id, skill_name: { in: toTouch } },
          data: { last_updated: now },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
