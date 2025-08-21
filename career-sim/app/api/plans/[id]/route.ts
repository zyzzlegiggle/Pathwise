import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = BigInt(params.id);
  const row = await prisma.plan.findUnique({ where: { plan_id: id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: row.plan_id.toString(),
    title: row.title,
    inputs: row.inputs,
    sources: row.sources,
    outputs: row.outputs,
    createdAt: row.created_at,
  });
}
