import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const uid = BigInt(new URL(req.url).searchParams.get("userId") || "1");

  // 1) Load the user's resume embedding
  const [row] = await prisma.$queryRaw<{ embedding: unknown }[]>`
    SELECT embedding
    FROM resumes
    WHERE user_id = ${uid}
  `;
  if (!row?.embedding) {
    return NextResponse.json({ jobs: [] });
  }

  // 2) ANN search using TiDB vector function
  //    Order by distance ASC for index usage; compute a [0..1] similarity score.
  const jobs = await prisma.$queryRaw<
    { job_id: bigint; title: string; company: string; location: string; url: string; score: number }[]
  >`
    SELECT
      j.job_id,
      j.title,
      j.company,
      j.location,
      j.url,
      (1 - VEC_COSINE_DISTANCE(jt.embedding, r.embedding) / 2.0) AS score
    FROM job_texts jt
    JOIN jobs j ON j.job_id = jt.job_id
    CROSS JOIN (SELECT embedding FROM resumes WHERE user_id = ${uid}) AS r
    ORDER BY VEC_COSINE_DISTANCE(jt.embedding, r.embedding) ASC
    LIMIT 20
  `;

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      ...j,
      id: Number(j.job_id), // convert BIGINT -> number
    })),
  });
}
