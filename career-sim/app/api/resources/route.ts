import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const skill = new URL(req.url).searchParams.get("skill");
  if (!skill) return NextResponse.json({ resources: [] });

  // vector sim: skill -> top resources
  const [row] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT embedding FROM skills_catalog WHERE skill_name = ?
  `, skill);

  if (!row?.embedding) return NextResponse.json({ resources: [] });

  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.title, r.provider, r.url, r.hours_estimate,
           1 - COSINE_DISTANCE(r.embedding, ?) AS score
    FROM resources r
    ORDER BY score DESC LIMIT 5
  `, row.embedding);

  return NextResponse.json({ resources: results });
}
