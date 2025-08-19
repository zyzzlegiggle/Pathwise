import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embed";
import axios from "axios";

/**
 * GET /api/jobs?role=software%20engineer&location=Kuala%20Lumpur&remote=true
 * Uses JSearch (RapidAPI) and stores jobs + vector embeddings in TiDB.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") || "software engineer";
  const location = url.searchParams.get("location") || "";
  const remote = url.searchParams.get("remote") === "true";

  const qParts = [role];
  if (location) qParts.push(`in ${location}`);
  if (remote) qParts.push("remote");
  const query = qParts.join(" ");

  try {
    const { data } = await axios.get(
      `https://${process.env.RAPIDAPI_JSEARCH_HOST}/search`,
      {
        params: {
          query,
          page: "1",
          num_pages: "1",
          date_posted: "all",
        },
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
          "X-RapidAPI-Host": process.env.RAPIDAPI_JSEARCH_HOST!,
        },
      }
    );

    const results = (data?.data ?? []).slice(0, 20);
    let count = 0;

    for (const it of results) {
      const externalId =
        String(
          it.job_id ??
            it.job_post_id ??
            `${it.job_title}-${it.job_city}-${it.employer_name}-${it.job_apply_link}`
        );

      const title = it.job_title as string | undefined;
      const company = it.employer_name as string | undefined;
      const city = it.job_city as string | undefined;
      const state = it.job_state as string | undefined;
      const country = it.job_country as string | undefined;
      const loc = [city, state, country].filter(Boolean).join(", ");
      const urlApply = (it.job_apply_link ||
        it.job_apply_url ||
        it.job_google_link) as string | undefined;

      // Concise description to embed
      const description = [
        title,
        company ? `at ${company}` : "",
        it.job_description || "",
        `Location: ${loc || "N/A"}`,
        it.job_is_remote ? "Remote: yes" : "Remote: no",
      ]
        .filter(Boolean)
        .join("\n");

      // Find existing job by (source, external_id)
      const existing = await prisma.job.findFirst({
        where: { source: "jsearch", external_id: externalId },
        select: { job_id: true },
      });

      // Create or update the Job row (schema uses snake_case and BigInt id)
      const job = existing
        ? await prisma.job.update({
            where: { job_id: existing.job_id },
            data: {
              title: title || "Unknown",
              company: company || null,
              location: loc || null,
              url: urlApply || null,
              // you can also set currency/min_salary/max_salary/post_date here if available
            },
            select: { job_id: true },
          })
        : await prisma.job.create({
            data: {
              source: "jsearch",
              external_id: externalId,
              title: title || "Unknown",
              company: company || null,
              location: loc || null,
              url: urlApply || null,
            },
            select: { job_id: true },
          });

      // Upsert JobText by job_id (1–1 relation)
      await prisma.jobText.upsert({
        where: { job_id: job.job_id },
        create: { job_id: job.job_id, description },
        update: { description },
      });

      // Embed and store into TiDB VECTOR column (raw SQL; keep field/table names aligned)
      try {
        const vec = await embedText(description);
        await prisma.$executeRawUnsafe(
          `UPDATE job_texts SET embedding = CAST(? AS VECTOR) WHERE job_id = ?`,
          JSON.stringify(vec),
          job.job_id.toString() // BigInt -> string for driver safety
        );
      } catch (e) {
        // Non-fatal: continue even if one embedding fails
        console.warn("Embedding failed for job", job.job_id, e);
      }

      count++;
    }

    return NextResponse.json({ ok: true, count, provider: "jsearch", query });
  } catch (err: any) {
    console.error("JSearch error", err?.response?.data || err?.message);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch jobs from JSearch" },
      { status: 500 }
    );
  }
}
