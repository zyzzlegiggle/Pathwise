// app/api/ingest/route.ts
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embed";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId, resumeText } = await req.json();
  const uid = BigInt(userId);

  const vec = await embedText(resumeText);         // number[]
  const vecText = `[${vec.join(",")}]`;            // -> "[0.12,0.34,...]"

  await prisma.user.upsert({
    where: { id: uid },
    create: { id: uid, email: `u${userId}@demo.local` }, // backticks!
    update: {}
  });

  await prisma.resume.upsert({
    where: { userId: uid },
    create: { userId: uid, rawText: resumeText },
    update: { rawText: resumeText }
  });

  // Store the embedding into the VECTOR column
  await prisma.$executeRawUnsafe(
    "UPDATE Resume SET embedding = VEC_FROM_TEXT(?) WHERE userId = ?",
    vecText,
    uid.toString()
  );

  return NextResponse.json({ ok: true });
}
