import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId, jobId, weeklyHours = 10 } = await req.json();
  const uid = BigInt(userId);
  const jid = BigInt(jobId);

  // get user & job vectors
  const [u] = await prisma.$queryRawUnsafe<any[]>(`SELECT embedding FROM resumes WHERE user_id=?`, uid.toString());
  const [j] = await prisma.$queryRawUnsafe<any[]>(`SELECT embedding FROM job_texts WHERE job_id=?`, jid.toString());
  if (!u?.embedding || !j?.embedding) return NextResponse.json({ error: "Missing embeddings" }, { status: 400 });

  // dummy: each week add +0.05 to score until max 1.0
  let score = 1 - (await prisma.$queryRawUnsafe<any[]>(`
    SELECT VEC_COSINE_DISTANCE(?, ?) AS d
  `, u.embedding, j.embedding))[0].d;

  const steps = [];
  for (let week = 1; week <= 12; week++) {
    score = Math.min(score + 0.05, 1.0);
    steps.push({ week, score: Number((score * 100).toFixed(1)) });
  }

  // store simulation
    const sim = await prisma.simulation.create({
    data: {
      user: { connect: { user_id: BigInt(uid) } }, // user_id must be unique on User
      path_name: "AutoSim",
      duration_weeks: steps.length
    }
  });
  for (const s of steps) {
    await prisma.simulationStep.create({
      data: {
        sim_id: sim.sim_id, 
        week: s.week,
        added_skills: JSON.stringify([]),
        est_qualification_score: s.score
      }
    });

  }

  console.log(steps);

  return NextResponse.json({ 
  simId: sim.sim_id.toString(), // convert BigInt → string
  steps 
});
}
