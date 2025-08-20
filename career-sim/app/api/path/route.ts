import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// OPTIONAL placeholder — swap with your LLM of choice later.
async function suggestSkillsWithLLM(seed: { role: string; stack: string[]; gaps: string[] }) {
  // return top-N atomic skills; keep deterministic fallback
  const base = Array.from(new Set([...seed.stack, ...seed.gaps]));
  return base.slice(0, 8);
}

// very small built-in templates; not exhaustive
const TEMPLATES: Record<string, string[]> = {
  "Rust + Tokio": ["Rust", "Tokio", "Async", "HTTP", "SQL", "Docker"],
  "Go + gRPC": ["Go", "gRPC", "Protobuf", "HTTP", "SQL", "Docker"],
  "Java + Spring": ["Java", "Spring Boot", "REST", "JPA", "SQL", "Docker"],
};

export async function POST(req: NextRequest) {
  const { userId = "1", jobId, targetRole = "backend SWE", stackPrefs = [], gaps = [], useLLM = false } = await req.json();
  if (!jobId) return NextResponse.json({ paths: [] });

  // 1) seed from templates filtered by stackPrefs
  const names = Object.keys(TEMPLATES).filter(
    (n) => !stackPrefs.length || stackPrefs.some((p: string) => n.toLowerCase().includes(p.toLowerCase()))
  ).slice(0, 3);

  const basePaths = names.map((name) => ({ name, skills: TEMPLATES[name] }));

  // 2) optionally add an LLM-generated path
  let llmPath: { name: string; skills: string[] } | null = null;
  if (useLLM) {
    const skills = await suggestSkillsWithLLM({ role: targetRole, stack: stackPrefs, gaps });
    if (skills.length) llmPath = { name: `${(stackPrefs[0] || "Custom")} Path`, skills };
  }

  const all = llmPath ? [...basePaths, llmPath] : basePaths;

  // 3) persist & return
  const created = [];
  for (const p of all) {
    const rec = await prisma.learningPath.create({
      data: { user_id: BigInt(userId), job_id: BigInt(jobId), name: p.name, skills: p.skills },
    });
    created.push({ pathId: rec.path_id.toString(), name: p.name, skills: p.skills });
  }
  return NextResponse.json({ paths: created });
}
