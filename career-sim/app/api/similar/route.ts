import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function jsonSafe<T>(v: T): T {
  if (typeof v === "bigint") return (String(v) as unknown) as T; // or Number(v) if you're sure it fits
  if (Array.isArray(v)) return v.map(jsonSafe) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = jsonSafe(val as unknown);
    return out as T;
  }
  return v;
}

type JobRow = {
  job_id: bigint;
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
};

export async function GET(req: NextRequest) {
  const uid = BigInt(new URL(req.url).searchParams.get("userId") || "1");

  const [row] = await prisma.$queryRaw<{ embedding: unknown }[]>`
    SELECT resume_embedding
    FROM user_profile
    WHERE user_id = ${uid}
  `;
  if (!row?.embedding) {
    return NextResponse.json({ jobs: [] });
  }

  const jobs = await prisma.$queryRaw<JobRow[]>`
    SELECT
      j.job_id,
      j.title,
      j.company,
      j.location,
      j.url,
      (1 - VEC_COSINE_DISTANCE(jt.embedding, r.embedding) / 2.0) AS score
    FROM job_texts jt
    JOIN jobs j ON j.job_id = jt.job_id
    CROSS JOIN (SELECT resume_embedding FROM user_profile WHERE user_id = ${uid}) AS r
    ORDER BY VEC_COSINE_DISTANCE(jt.embedding, r.embedding) ASC
    LIMIT 20
  `;

  // remove job_id (bigint) and add string id instead
  const payload = jobs.map(({ job_id, ...rest }) => ({
    ...rest,
    id: String(job_id), // use String to avoid overflow; use Number(...) if safe
  }));

  return NextResponse.json(jsonSafe({ jobs: payload }));
}
