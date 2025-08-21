import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function cityCountryParts(loc?: string) {
  if (!loc) return { city: null, country: null };
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] || null;
  const country = parts.at(-1) || null;
  return { city, country };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const role  = url.searchParams.get("role") || "";
  const level = url.searchParams.get("level") || "";
  const loc   = url.searchParams.get("location") || "";
  const { city, country } = cityCountryParts(loc);

  // 1) Try aggregating from recent job postings for the same role & geo
  const jobs = await prisma.job.findMany({
    where: {
      title: { contains: role, lte: "insensitive" },
      AND: [
        country ? { location: { contains: country, lte: "insensitive" } } : {},
        city    ? { location: { contains: city,    lte: "insensitive" } } : {},
      ],
      min_salary: { not: null },
      max_salary: { not: null },
    },
    select: { min_salary: true, max_salary: true, currency: true },
    take: 200,
  });

  let currency = "USD";
  const samples: number[] = [];
  for (const j of jobs) {
    if (j.currency) currency = j.currency;
    if (j.min_salary && j.max_salary) {
      // midpoint as a crude annual range estimate
      samples.push(Math.round((j.min_salary + j.max_salary) / 2));
    }
  }

  function pct(arr: number[], p: number) {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const idx = Math.floor((a.length - 1) * p);
    return a[idx] ?? a.at(-1) ?? null;
  }

  let p25 = pct(samples, 0.25);
  let median = pct(samples, 0.5);
  let p75 = pct(samples, 0.75);
  let source = samples.length ? `Aggregated from ${samples.length} postings` : "";

  // 2) Fallback: benchmarks table
  if (!samples.length) {
    const bench = await prisma.salaryBenchmark.findFirst({
      where: {
        role: { equals: role, mode: "insensitive" },
        country: country ?? undefined,
        city: city ?? undefined,
        ...(level ? { level } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    if (bench) {
      currency = bench.currency || currency;
      p25 = bench.p25 ?? p25;
      median = bench.median ?? median;
      p75 = bench.p75 ?? p75;
      source = bench.source || "Benchmark";
    }
  }

  return NextResponse.json({
    role,
    location: loc,
    currency,
    samples: samples.length,
    p25, median, p75,
    source,
  });
}
