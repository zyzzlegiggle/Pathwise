import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const userId = BigInt(new URL(req.url).searchParams.get("userId") || "1");
  const goal = await prisma.userGoal.findUnique({ where: { user_id: userId } });
  return NextResponse.json({ goal });
}

export async function POST(req: NextRequest) {
  const { userId = "1", targetRole, timeframeMin, timeframeMax = [] } = await req.json();
  const uid = BigInt(userId);

  const up = await prisma.userGoal.upsert({
    where: { user_id: uid },
    create: {
      user_id: uid,
      target_role: targetRole,
      timeframe_min_months: Number(timeframeMin),
      timeframe_max_months: Number(timeframeMax),

    },
    update: {
      target_role: targetRole,
      timeframe_min_months: Number(timeframeMin),
      timeframe_max_months: Number(timeframeMax),
    },
  });

  return NextResponse.json({ ok: true, goal: String(up) });
}
