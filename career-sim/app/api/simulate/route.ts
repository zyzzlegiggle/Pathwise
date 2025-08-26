import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId, jobId, weeklyHours = 10, weeks: weeksOverride, pathId } = await req.json();
   const uid = BigInt(userId);
  const jid = BigInt(jobId);

  // get user & job vectors
  const [u] = await prisma.$queryRawUnsafe<any[]>(`SELECT embedding FROM resumes WHERE user_id=?`, uid.toString());
  const [j] = await prisma.$queryRawUnsafe<any[]>(`SELECT embedding FROM job_texts WHERE job_id=?`, jid.toString());
  if (!u?.embedding || !j?.embedding) return NextResponse.json({ error: "Missing embeddings" }, { status: 400 });


  // 1) find mentioned-but-missing skills (same logic as /api/gaps)
const userSkills = await prisma.userSkill.findMany({
  where: { user_id: uid },
  select: { skill_name: true },
});
const userSkillNames = new Set(userSkills.map((s) => s.skill_name.toLowerCase()));

const jtFull = await prisma.jobText.findUnique({
  where: { job_id: jid },
  select: { description: true },
});
const jobDesc = (jtFull?.description ?? "").toLowerCase();

const catalog = await prisma.skillNode.findMany({
  select: { name: true, aliases: true },
});

const missingSkills: string[] = [];
for (const s of catalog) {
  const aliases: string[] = Array.isArray(s.aliases) ? (s.aliases as any) : [];
  const names = [s.name, ...aliases]
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.toLowerCase());

  const userHas = names.some((n) => userSkillNames.has(n));
  const mentioned = names.some((n) => jobDesc.includes(n));
  if (!userHas && mentioned) missingSkills.push(s.name);
}

// AFTER you compute missingSkills[] (current logic), filter by path if provided
let targetMissing = missingSkills;
 if (pathId) {
   const path = await prisma.learningPath.findUnique({
     where: { path_id: BigInt(pathId) },
     select: { skills: true },
   });
   const wanted = new Set<string>((path?.skills as string[]) || []);
   if (wanted.size) {
     targetMissing = missingSkills.filter((s) =>
       Array.from(wanted).some((w) => s.toLowerCase().includes(w.toLowerCase()))
     );
   }
 }


// 2) pull resources + rough hours
type GapItem = { skill: string; hours: number; remaining: number };
const gaps: GapItem[] = [];
for (const skill of targetMissing) {
  const [skillRow] = await prisma.$queryRawUnsafe<any[]>(
    "SELECT embedding FROM skills_catalog WHERE skill_name = ?",
    skill
  );
  if (!skillRow?.embedding) continue;

  const resources = await prisma.$queryRawUnsafe<any[]>(
    `SELECT r.title, r.provider, r.url, COALESCE(r.hours_estimate, 8) AS hours_estimate,
            1 - VEC_COSINE_DISTANCE(r.embedding, ?) AS score
     FROM resources r
     ORDER BY score DESC
     LIMIT 3`,
    skillRow.embedding
  );
  const totalHours = resources.reduce((a: number, r: any) => a + (Number(r.hours_estimate) || 8), 0);
  if (totalHours > 0) gaps.push({ skill, hours: totalHours, remaining: totalHours });
}

// 3) simulate weekly progress consuming hours
const weeks = Math.max(4, Math.min(52, Number(weeksOverride ?? 12)));
const perSkillBump = gaps.length > 0 ? 0.6 / gaps.length : 0;
let steps: { week: number; score: number; prob: number }[] = [];
// base score from cosine similarity
const [{ d }] = await prisma.$queryRawUnsafe<any[]>(
  "SELECT VEC_COSINE_DISTANCE(?, ?) AS d",
  u.embedding,
  j.embedding
);
let runningScore = Math.max(0, Math.min(1, 1 - d)); // base similarity 0..1
const calib = await prisma.calibrationModel.findUnique({ where: { name: "default" } });
const b0 = calib?.b0 ?? -2.0;
const b1 = calib?.b1 ?? 4.0;
const toProb = (s01: number) => 1 / (1 + Math.exp(-(b0 + b1 * s01)));

for (let week = 1; week <= weeks; week++) {
  let capacity = weeklyHours;
  // greedy consume hours across remaining skills
  for (const g of gaps) {
    if (capacity <= 0) break;
    if (g.remaining <= 0) continue;
    const consume = Math.min(g.remaining, capacity);
    g.remaining -= consume;
    capacity -= consume;
    if (g.remaining <= 0) {
      runningScore += perSkillBump; // finished a skill -> bump
    }
  }
  runningScore = Math.min(runningScore + 0.02, 1.0); // small ambient gain from “practice”
    const s01 = Math.min(Math.max(runningScore, 0), 1);
    const prob = toProb(s01);
    steps.push({
    week,
    score: Number((s01 * 100).toFixed(1)),           // keep for backward compat
    prob: Number((prob * 100).toFixed(1))            // NEW: calibrated probability %
    })
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
