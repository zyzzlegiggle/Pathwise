// app/api/agents/run/route.ts
import { DecisionSummary } from "@/app/page";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
type SimJob = { id: string; title?: string; url?: string };

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
  const useLLM = searchParams.get("useLLM") === "true";
  const origin = req.nextUrl.origin;
  const targetRoleFromUI = searchParams.get("targetRole") || "";
  const baselineRole     = searchParams.get("baselineRole") || "";
  const baselineLocation = searchParams.get("baselineLocation") || "";
  const recencyDays = Number(searchParams.get("recencyDays") || "0");
  const risk = Number(searchParams.get("risk") || "2") as 1 | 2 | 3;
  const decisions = (searchParams.get("decisions") || "").split(",").filter(Boolean);
  const weeklyHours = Number(searchParams.get("weeklyHours") || "10");
  

  return sse(async (send) => {
    send("status", { status: "running" });
    send("log", { line: `Agent ${agent} started…` });
    const step = (p: number) => send("progress", { progress: p });

    switch (agent) {
      case "A": {
        step(10);
        send("log", { line: "Uploading & embedding resume…" });
        const r = await fetch(`${origin}/api/ingest/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            resumeText: resume || "",
            shortForm: {
              yearsExperience: Number(searchParams.get("yearsExp") || "0"),
              education: searchParams.get("education") || "",
            },
          }),
        });
        const j = await r.json();
        step(75);
        send("log", { line: j.ok ? "Resume stored." : "Ingest failed." });
        step(100)
        break;
      }
      case "B": {
        step(10);
        send("log", { line: "Fetching jobs from JSearch…" });
        const q = new URLSearchParams({
          role,
          location,
          remote: String(remote),
          ...(recencyDays > 0 ? { recencyDays: String(recencyDays) } : {}),
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
          send("log", { line: `Goals: ${timeframeMin}-${timeframeMax} mo;` });
        // this will return missing skills?
        const r = await fetch(`${origin}/api/gaps?userId=${userId}&jobId=${jobId}&mode=embedding`); 
        const j = await r.json();
        const targetRoleName = searchParams.get("targetRole") || "Backend SWE";

        const pathExplorer = {
          bridgeSkills: (j.missing || []).slice(0, 5),
          transitions: (j.missing || []).slice(0, 5).map((s: string) => ({
            fromSkill: '',
            bridgeSkill: s,
            toRole: targetRoleName,
            confidence: { p25: 40, p50: 65, p75: 80 }, // placeholder heuristics; replace with model
            exampleProfileIds: [`ex-${s}-1`, `ex-${s}-2`],
          })),
          exampleProfiles: Object.fromEntries(
            (j.missing || []).slice(0, 5).flatMap((s: string) => [
              [
                `ex-${s}-1`,
                {
                  id: `ex-${s}-1`,
                  title: `${s} bridge — Analyst → Backend`,
                  summary: `Self-study + 2 projects in ${s}. Internal transfer to platform team; mentored by senior.`,
                  outcome: { timeToOfferWeeks: 10, comp1yr: 78000 },
                },
              ],
              [
                `ex-${s}-2`,
                {
                  id: `ex-${s}-2`,
                  title: `${s} bootcamp path`,
                  summary: `Part-time bootcamp; capstone on ${s}. Joined fintech as junior backend.`,
                  outcome: { timeToOfferWeeks: 14, comp1yr: 72000 },
                },
              ],
            ])
          ),
        };
        step(100);
        send("payload", { 
          gaps: j.missing || [],
          cluster: j.cluster || null,
          citations: j.citations || [],
          pathExplorer,
        });
        send("log", { line: `Detected ${j.missing?.length ?? 0} missing skills.` });
        break;
      }
      case "D": {
        const weeklyHours = Number(searchParams.get("weeklyHours") || "10");
         let skills = (searchParams.get("skills") || "").split(",").filter(Boolean);
  
        if (!skills.length) {
          send("log", { line: "No gaps provided; nothing to fetch." });
          step(100);
          send("payload", { resources: {} });
          break;
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
        
        const weeks = Math.max(8, Math.round(((timeframeMin + timeframeMax) / 2) * 4.3));
        const plannedHours = weeklyHours;

        // Build lightweight weekly tasks from first few skills/resources
        const pickResources = (skill: string, list: any[] = []) =>
          (list || []).slice(0, 2).map((r: any, i: number) => ({
            id: `${skill}-${i}`,
            title: r.title || `Practice: ${skill}`,
            estHours: r.hours_estimate || 3,
            priority: i === 0 ? "high" : "med",
            skill,
            url: r.url || undefined,
          }));



        const allTasks: any[] = [];
        for (const s of (skills || []).slice(0, 4)) {
          // fetch resources you already did above
          const resList = resources[s] || [];
          allTasks.push(...pickResources(s, resList));
        }

        // Distribute tasks across weeks respecting plannedHours
        const weeklyPlan = Array.from({ length: weeks }, (_, i) => ({
          week: i + 1,
          plannedHours,
          checkpoint: (i + 1) % 2 === 0 ? {
            title: `Milestone W${i + 1}`,
            criteria: "Complete at least 2 high-priority tasks and 1 demo artifact.",
          } : undefined,
          carriesOverFrom: undefined,
          tasks: [] as any[],
        }));

        let wIdx = 0;
        let wHours = 0;
        for (const t of allTasks) {
          if (wHours + t.estHours > plannedHours) {
            wIdx = Math.min(wIdx + 1, weeklyPlan.length - 1);
            wHours = 0;
          }
          weeklyPlan[wIdx].tasks.push(t);
          wHours += t.estHours;
        }
        
        // CREATE PATHS
        send("log", { line: `Creating learning paths (templates${useLLM ? " + LLM" : ""})…` });
        const pr = await fetch(`${origin}/api/paths`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId, jobId: searchParams.get("jobId"), //targetRole, // targetRole optional param you may add
             gaps: skills, useLLM
          }),
        });
        const pj = await pr.json();
        send("payload", { paths: pj.paths || [], resources, weeklyPlan });
        step(100);
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
        const pathIds = (searchParams.get("pathIds") || "").split(",").filter(Boolean);
        if (!pathIds.length) send("log", { line: "No pathIds provided — simulating generic path." });
        const pathLoop = pathIds.length ? pathIds : ["" /* generic */];
        let idx = 0;
        for (const pid of pathLoop) {
          const labelPrefix = pid ? `Path ${pid}` : "Generic";
          for (const hours of variants) {
          send("log", { line: `Simulating ${weeksTarget} weeks @ ${hours}h/week…` });
          send("log", { line: `Risk tolerance = ${risk} (1=safe,2=balanced,3=aggressive)` });
          const r = await fetch(`${origin}/api/simulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, jobId, weeklyHours: hours, weeks: weeksTarget, pathId: pid || undefined, risk, }),
          });
          const j = await r.json();
          series.push({ label: `${labelPrefix} • ${hours}h/wk`, steps: j.steps || [] });          
          idx++;
          step(Math.min(15 + Math.round((idx / Math.max(1, pathLoop.length * variants.length)) * 80), 99));        }
        }
        step(100);
        const jobMeta = jobId ? await fetch(`${origin}/api/similar?userId=${userId}`).then(r=>r.json()).catch(()=>({})) : {};
        const targetTitle = targetRoleFromUI || (jobMeta.jobs?.find((j:any)=> String(j.id)===String(jobId))?.title) || "";
        const targetLoc   = (jobMeta.jobs?.find((j:any)=> String(j.id)===String(jobId))?.location) || "";
        const sal = await fetch(`${origin}/api/salary?role=${encodeURIComponent(targetTitle)}&location=${encodeURIComponent(targetLoc)}`).then(r=>r.json()).catch(()=>null);
        send("payload", { series, salary: sal });
        send("log", { line: "Simulation complete for all variants." });
        break;
      }

      case "F": {
        // Expect citedJobs param as comma-separated job IDs chosen by the client
        const citedJobs = (searchParams.get("citedJobs") || "").split(",").filter(Boolean);
        send("log", { line: `Generating explanation for ${citedJobs.length} citations…` });
        const targetRoleQ = targetRoleFromUI || "Software Engineer";
        // pick a location from first cited job if available
        let targetLocQ = "";
        try {
          const first = citedJobs[0];
          if (first) {
            const job = await fetch(`${origin}/api/similar?userId=${userId}`).then(r=>r.json());
            const hit = job.jobs?.find((j:any)=> String(j.id)===String(first));
            targetLocQ = hit?.location || "";
          }
        } catch {}
        const targetSalary = await fetch(`${origin}/api/salary?role=${encodeURIComponent(targetRoleQ)}&location=${encodeURIComponent(targetLocQ)}`).then(r=>r.json()).catch(()=>null);
        const baseSalary = (baselineRole || baselineLocation)
        ? await fetch(`${origin}/api/salary?role=${encodeURIComponent(baselineRole || targetRoleQ)}&location=${encodeURIComponent(baselineLocation || "")}`).then(r=>r.json()).catch(()=>null)
        : null;

        let delta = null as null | { currency: string; medianDelta: number | null };
        if (targetSalary?.median && baseSalary?.median && targetSalary.currency === baseSalary.currency) {
          delta = { currency: targetSalary.currency, medianDelta: targetSalary.median - baseSalary.median };
        }
        step(100);
        send("payload", {
          citedJobs,
          salaryTarget: targetSalary,
          salaryBaseline: baseSalary,
          delta,
        saveable: {
          inputs: {
            goalRole: targetRoleFromUI || "Software Engineer",
            timeframeMin, timeframeMax,
            targetJobTitle: targetRoleFromUI || "",
            targetLocation: targetLocQ || "",
            pathIds: (searchParams.get("pathIds") || "").split(",").filter(Boolean),
          },
          sources: {
            citedJobs: await (async () => {
              try {
                const sim = await fetch(`${origin}/api/similar?userId=${userId}`).then(r=>r.json());
                const map = new Map<string, SimJob>(sim.jobs?.map((j: SimJob) => [String(j.id), j]) ?? []);
                return citedJobs.map((id)=>({
                  id, title: map.get(String(id))?.title || "Unknown",
                  url: map.get(String(id))?.url || null
                }));
              } catch { return citedJobs.map((id)=>({id})); }
            })(),
            salarySources: [targetSalary?.source, baseSalary?.source].filter(Boolean),
          },
          outputs: {
            missing: (searchParams.get("missing") ? JSON.parse(searchParams.get("missing")!) : undefined), // optional if you pass via params
            series: undefined, // Agent E already streamed; client can attach
            salaryTarget: targetSalary,
            salaryBaseline: baseSalary,
            delta,
            explanation: undefined, // client adds final explanation text
            paths: undefined,       // client attaches chosen paths
          }
        }
        });
        send("log", { line: "Report generated." });
        break;
      }

      case "G": {
        // Basic horizon taken from goal months (same as Agent E)
        const avgMonths = (timeframeMin + timeframeMax) / 2;
        const weeksTarget = Math.max(8, Math.round(avgMonths * 4.3));

        // Heuristic profiles per decision (speed ~ median slope; var ~ spread)
        const profileByDecision: Record<string, { speed: number; var: number; cohort: number; delta: number; notes?: string }> = {
          "self-study":        { speed: 1.00, var: 1.10, cohort: 420,  delta: 0,     notes: "Wide outcomes; portfolio quality matters" },
          "bootcamp":          { speed: 1.15, var: 0.90, cohort: 260,  delta: 5000,  notes: "Structured; placement support helps" },
          "internal-transfer": { speed: 1.05, var: 0.95, cohort: 180,  delta: 8000,  notes: "Faster interviews; depends on openings" },
        };

        // Risk widens/narrows uncertainty
        const varScale = risk === 1 ? 0.85 : risk === 3 ? 1.15 : 1.0;

        const salaryDefaults = { median: 70000, currency: "USD" }; // fallback

        let currency = salaryDefaults.currency;
        let baseMedian = salaryDefaults.median;
        try {
          const jobsMeta = await fetch(`${origin}/api/similar?userId=${userId}`).then(r=>r.json()).catch(()=>null);
          const tgt = jobsMeta?.jobs?.[0];
          const sal = await fetch(`${origin}/api/salary?role=${encodeURIComponent(tgt?.title || "Software Engineer")}&location=${encodeURIComponent(tgt?.location || "")}`)
            .then(r=>r.json()).catch(()=>null);
          if (sal?.median) { baseMedian = sal.median; currency = sal.currency || currency; }
        } catch { /* noop */ }

        const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

        const burnoutFrom = (hours: number, variance: number) => {
          // base from hours (8–20h/wk)
          const base = Math.min(20 + (hours - 8) * 4, 85); // 8h→20, 15h→48, 20h→60
          const varAdj = 10 * (variance - 1);              // higher spread → higher stress
          const riskAdj = (risk - 2) * 8;                  // safe:-8, balanced:0, aggressive:+8
          return clamp(Math.round(base + varAdj + riskAdj), 5, 95);
        };

        const mkBand = (speed: number, variance: number) => {
          const out: { week: number; p25: number; p50: number; p75: number }[] = [];
          for (let w = 1; w <= weeksTarget; w++) {
            const t = w / weeksTarget;
            // Smooth S-curve-ish median toward 85%
            const mid = 20 + 65 * Math.pow(t, 0.8) * speed;
            const spread = 10 * variance * varScale * (0.6 + 0.4 * (1 - t)); // wider early, narrows later
            out.push({
              week: w,
              p25: clamp(mid - spread),
              p50: clamp(mid),
              p75: clamp(mid + spread),
            });
          }
          return out;
        };

        const bands: Record<string, { week: number; p25: number; p50: number; p75: number }[]> = {};
        const summaries: DecisionSummary[] = [];

        // Choose up to 3 decisions (client already enforces)
        const chosen = decisions.length ? decisions : ["self-study", "bootcamp"];
        let i = 0;
        for (const d of chosen) {
          const prof = profileByDecision[d] || profileByDecision["self-study"];
          send("log", { line: `Simulating bands for '${d}' (speed=${prof.speed}, var=${prof.var})…` });
          bands[d] = mkBand(prof.speed, prof.var);

          const cross = bands[d].find((pt) => pt.p50 >= 70)?.week ?? null;

          // compensation estimates
          const comp1yr = Math.round(baseMedian + prof.delta);
          const growth = 0.30 + 0.10 * (prof.speed - 1); // speedier paths → slightly higher upside
          const comp3yrCeiling = Math.round(comp1yr * (1 + growth));
          const burnoutRisk = burnoutFrom(weeklyHours, prof.var);

          // short “why”
          const explanation =
            d === "bootcamp"
              ? "Faster ramp via structure & placement; trade tuition for lower variance and earlier interviews."
              : d === "internal-transfer"
              ? "Leverages existing credibility; access to projects & referrals. Ceiling depends on openings."
              : "Max flexibility and low cost; outcomes hinge on portfolio quality and consistency.";

          summaries.push({
            decisionId: d,
            cohortSize: prof.cohort,
            timeToOfferP50: cross ?? undefined,
            salaryDeltaMedian: prof.delta,
            comp1yr,
            comp3yrCeiling,
            burnoutRisk,
            currency,
            explanation,
            riskNotes: prof.notes,
          });

          i++;
          step(20 + Math.round((i / Math.max(1, chosen.length)) * 70));
        }


        step(100);
        send("payload", { bands, summaries });
        send("log", { line: "Counterfactual comparison complete." });
        break;
      }

      case "H": {
        step(10);
        send("log", { line: "Retrieving similar profiles…" });

        // lightweight anchors from current context
        const target = searchParams.get("targetRole") || role || "Software Engineer";
        const currencyHint = "USD";

        // synthesize 3–4 anonymized receipts (replace with real retrieval later)
        const chips = (extra: string[]) => [...new Set([target])];
        
        
        const profiles = [
          {
            profileId: "plm-01",
            similarity: 0.86,
            pathTaken: chips(["Internal transfer", "Mentored project"]),
            timeToOffer: 12,
            compAfter1yr: 78000,
            snippet: `2 YOE QA → contributed to backend tooling.\nBuilt 2 services in  "Go"; internal transfer approved.`,
            sources: [{ label: "Internal Q3 promo memo" }, { label: "Demo repo", url: "https://example.com/repo1" }],
          },
          {
            profileId: "plm-02",
            similarity: 0.81,
            pathTaken: chips(["Bootcamp (pt)","Capstone"]),
            timeToOffer: 16,
            compAfter1yr: 72000,
            snippet: `Evenings/weekends bootcamp; capstone on analytics ETL.\n3 OSS issues merged; hired by fintech as Jr Backend.`,
            sources: [{ label: "Bootcamp showcase", url: "https://example.com/showcase" }],
          },
          {
            profileId: "plm-03",
            similarity: 0.78,
            pathTaken: chips(["Self-study","Open-source"]),
            timeToOffer: 18,
            compAfter1yr: 69000,
            snippet: `Self-study plan (10h/wk). Portfolio API + blog.\nReferral via OSS maintainer led to offer.`,
            sources: [{ label: "Portfolio", url: "https://example.com/portfolio" }],
          },
        ];

        step(100);
        send("payload", { profiles, currency: currencyHint });
        send("log", { line: `Returned ${profiles.length} similar profiles.` });
        break;
      }

      default:
        throw new Error(`Unknown agent: ${agent}`);
    }

    send("status", { status: "done" });
  });
}
