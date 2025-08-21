import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// σ(x)
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

type Sample = { score?: number; sim?: number; label: 0 | 1 };
// score: 0..100 (from your UI) OR sim: 0..1; we normalize internally.

function fitLogistic1D(samples: Sample[], iters = 400, lr = 0.05) {
  // Start with conservative defaults
  let b0 = -2.0, b1 = 4.0;
  for (let t = 0; t < iters; t++) {
    let g0 = 0, g1 = 0;
    for (const s of samples) {
      const x = typeof s.sim === "number" ? s.sim : (Math.max(0, Math.min(100, s.score ?? 0)) / 100);
      const p = sigmoid(b0 + b1 * x);
      const e = (s.label as number) - p; // gradient for log loss
      g0 += e;
      g1 += e * x;
    }
    // gradient ascent on log-likelihood
    b0 += lr * g0;
    b1 += lr * g1;
  }
  return { b0, b1 };
}

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get("name") || "default";
  const row = await prisma.calibrationModel.findUnique({ where: { name } });
  if (!row) return NextResponse.json({ name, b0: -2.0, b1: 4.0, source: "default-fallback" });
  return NextResponse.json({ name: row.name, b0: row.b0, b1: row.b1, updatedAt: row.updated_at });
}

// POST body: { name?: string, samples: Array<{score?: number, sim?: number, label: 0|1}>, iters?, lr? }
export async function POST(req: NextRequest) {
  const { name = "default", samples = [], iters = 400, lr = 0.05 } = await req.json();
  if (!Array.isArray(samples) || samples.length < 10) {
    return NextResponse.json({ ok: false, error: "Need at least 10 samples" }, { status: 400 });
  }
  const { b0, b1 } = fitLogistic1D(samples, iters, lr);
  const rec = await prisma.calibrationModel.upsert({
    where: { name },
    create: { name, b0, b1 },
    update: { b0, b1 },
  });
  return NextResponse.json({ ok: true, name: rec.name, b0: rec.b0, b1: rec.b1 });
}
