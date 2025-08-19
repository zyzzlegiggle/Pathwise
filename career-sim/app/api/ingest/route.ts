// app/api/ingest/route.ts
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embed";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId, resumeText } = await req.json();

  // Make sure this is safe for BigInt columns
  const uid = BigInt(userId);

  const vec = await embedText(resumeText);              // number[]
  const vecText = `[${vec.join(",")}]`;                 // e.g. "[0.12,0.34,...]"

  // Upsert User (schema: model User { user_id BigInt @id ... })
  await prisma.user.upsert({
    where: { user_id: uid },
    create: { user_id: uid, email: `u${userId}@demo.local` },
    update: {},
  });

  // Upsert Resume (schema: model Resume { user_id BigInt @id, raw_text String })
  await prisma.resume.upsert({
    where: { user_id: uid },
    create: { user_id: uid, raw_text: resumeText },
    update: { raw_text: resumeText },
  });

  // Store the embedding with a raw query (column not in Prisma schema)
  // If you're on **PostgreSQL**, prefer double quotes for CamelCase table names:
  // await prisma.$executeRawUnsafe(
  //   `UPDATE "Resume" SET embedding = VEC_FROM_TEXT(?) WHERE "user_id" = ?`,
  //   vecText,
  //   uid.toString()
  // );

  // If you're on **MySQL**, use backticks (or no quotes if not needed):
  await prisma.$executeRawUnsafe(
    "UPDATE `resumes` SET embedding = VEC_FROM_TEXT(?) WHERE `user_id` = ?",
    vecText,
    uid.toString()
  );

  return NextResponse.json({ ok: true });
}
