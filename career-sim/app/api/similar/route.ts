import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const uid = BigInt(new URL(req.url).searchParams.get("userId") || "1");

  // Ensure the user’s resume vector exists
  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT embedding FROM Resume WHERE userId = ?`,
    uid.toString()
  );
  if (!row?.embedding) return NextResponse.json({ jobs: [] });

  // Use TiDB vector function: VEC_COSINE_DISTANCE
  // - Use CROSS JOIN to bind the user's vector once
  // - Order by distance ASC (smaller = more similar) so ANN index can be used
  // - Convert distance (0..2) -> similarity score (0..1) via (1 - d/2)
  const jobs = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT j.id, j.title, j.company, j.location, j.url,
           (1 - VEC_COSINE_DISTANCE(jt.embedding, r.embedding) / 2.0) AS score
    FROM JobText jt
    JOIN Job j ON j.id = jt.jobId
    CROSS JOIN (SELECT embedding FROM Resume WHERE userId = ?) AS r
    ORDER BY VEC_COSINE_DISTANCE(jt.embedding, r.embedding) ASC
    LIMIT 20
    `,
    uid.toString()
  );

  console.log(jobs)

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      ...j,
      id: Number(j.id),   // convert BigInt → number
    })),
  });
}
