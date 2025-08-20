// app/api/agents/run/route.ts
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function sse(responder: (send: (ev: string, data: any) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${ev}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await responder(send);
      } catch (e: any) {
        send("status", { status: "error", error: e?.message || "unknown" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent = (searchParams.get("agent") || "").toUpperCase();
  const userId = searchParams.get("userId") || "1";
  const role = searchParams.get("role") || "software engineer";
  const location = searchParams.get("location") || "";
  const remote = searchParams.get("remote") === "true";
  const jobId = searchParams.get("jobId");
  const resume = searchParams.get("resume") || ""; // NOTE: keep short; prefer POST for long resumes in prod.
  const timeframeMin = Number(searchParams.get("timeframeMin") || "6");
  const timeframeMax = Number(searchParams.get("timeframeMax") || "9");
  const stackPrefs = (searchParams.get("stackPrefs") || "").split(",").filter(Boolean);
  const origin = req.nextUrl.origin;

  return sse(async (send) => {
    send("status", { status: "running" });
    send("log", { line: `Agent ${agent} started…` });
    const step = (p: number) => send("progress", { progress: p });

    switch (agent) {
      case "A": {
        step(10);
        send("log", { line: "Uploading & embedding resume…" });
        const r = await fetch(`${origin}/api/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, resumeText: resume || "Resume via SSE" }),
        });
        const j = await r.json();
        step(75);
        send("log", { line: j.ok ? "Resume stored." : "Ingest failed." });
        break;
      }
      case "B": {
        step(10);
        send("log", { line: "Fetching jobs from JSearch…" });
        const q = new URLSearchParams({
          role,
          location,
          remote: String(remote),
        }).toString();
        await fetch(`${origin}/api/jobs?${q}`);
        step(55);
        send("log", { line: "Indexing & embedding…" });
        const sim = await fetch(`${origin}/api/similar?userId=${userId}`);
        const data = await sim.json();
        step(100);
        send("payload", { jobs: data.jobs || [] });
        send("log", { line: `Found ${data.jobs?.length || 0} similar jobs.` });
        break;
      }
      case "C": {
         if (!jobId) throw new Error("Missing jobId for Agent C.");
          step(15);
          send("log", { line: `Goals: ${timeframeMin}-${timeframeMax} mo; stacks=${stackPrefs.join("/") || "any"}` });
        const r = await fetch(`${origin}/api/gaps?userId=${userId}&jobId=${jobId}`);
        const j = await r.json();
        step(100);
        send("payload", { gaps: j.missing || [] });
        send("log", { line: `Detected ${j.missing?.length ?? 0} missing skills.` });
        break;
      }
      case "D": {
         let skills = (searchParams.get("skills") || "").split(",").filter(Boolean);
  
        if (!skills.length) {
          send("log", { line: "No gaps provided; nothing to fetch." });
          step(100);
          send("payload", { resources: {} });
          break;
        }
        if (stackPrefs.length) {
          const kw = stackPrefs.map((s) => s.toLowerCase());
          skills = skills.filter((g) => kw.some((k) => g.toLowerCase().includes(k)));
          send("log", { line: `Filtered gaps by stacks → ${skills.length} skills.` });
        }
        const resources: Record<string, any[]> = {};
        let i = 0;
        for (const s of skills) {
          send("log", { line: `Fetching resources for ${s}…` });
          const r = await fetch(`${origin}/api/resources?skill=${encodeURIComponent(s)}`);
          resources[s] = (await r.json()).resources || [];
          i++;
          step(20 + Math.round((i / skills.length) * 75));
        }
        step(100);
        send("payload", { resources });
        send("log", { line: "Curriculum assembled." });
        break;
      }
      case "E": {
        if (!jobId) throw new Error("Missing jobId for Agent E.");
        const avgMonths = (timeframeMin + timeframeMax) / 2;
        const weeksTarget = Math.round(avgMonths * 4.3); // approx weeks/month
        const variants = (searchParams.get("variants") || "8,10,15")
          .split(",").map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n));

        const series: { label: string; steps: any[] }[] = [];
        let idx = 0;
        for (const hours of variants) {
          send("log", { line: `Simulating ${weeksTarget} weeks @ ${hours}h/week…` });
          const r = await fetch(`${origin}/api/simulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, jobId, weeklyHours: hours, weeks: weeksTarget }),
          });
          const j = await r.json();
          series.push({ label: `${hours}h/wk`, steps: j.steps || [] });
          idx++;
          step(Math.min(15 + Math.round((idx / variants.length) * 80), 99));
        }
        step(100);
        send("payload", { series });
        send("log", { line: "Simulation complete for all variants." });
        break;
      }

      case "F": {
        // Expect citedJobs param as comma-separated job IDs chosen by the client
        const citedJobs = (searchParams.get("citedJobs") || "").split(",").filter(Boolean);
        send("log", { line: `Generating explanation for ${citedJobs.length} citations…` });
        step(100);
        send("payload", { citedJobs });
        send("log", { line: "Report generated." });
        break;
      }
      default:
        throw new Error(`Unknown agent: ${agent}`);
    }

    send("status", { status: "done" });
  });
}
