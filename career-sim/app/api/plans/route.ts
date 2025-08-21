import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST body: { userId, title, inputs, sources, outputs }
export async function POST(req: NextRequest) {
  const { userId = "1", title, inputs = {}, sources = {}, outputs = {} } = await req.json();
  const rec = await prisma.plan.create({
    data: {
      user_id: BigInt(userId),
      title: title || "Plan",
      inputs, sources, outputs,
    },
    select: { plan_id: true },
  });
  return NextResponse.json({ ok: true, planId: rec.plan_id.toString() });
}

// GET ?userId=1 — list plans (lightweight)
export async function GET(req: NextRequest) {
  const userId = BigInt(new URL(req.url).searchParams.get("userId") || "1");
  const rows = await prisma.plan.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: { plan_id: true, title: true, created_at: true },
  });
  return NextResponse.json({
    plans: rows.map((r) => ({ id: r.plan_id.toString(), title: r.title, createdAt: r.created_at })),
  });
}
