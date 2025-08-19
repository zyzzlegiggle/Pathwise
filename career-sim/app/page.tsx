// app/page.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type JobResult = {
  id: string; // backend returns string; was number before (fix)
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
};
type ResourceHit = {
  title: string;
  provider: string;
  url: string;
  hours_estimate?: number;
  score?: number;
};
type SimStep = { week: number; score: number };

// ---------- Agent Orchestrator Types ----------
type AgentKey = "A" | "B" | "C" | "D" | "E" | "F";
type AgentStatus = "idle" | "running" | "done" | "error";
type AgentInfo = {
  key: AgentKey;
  title: string;
  subtitle: string;
};
const AGENTS: AgentInfo[] = [
  {
    key: "A",
    title: "Profile Ingestor",
    subtitle: "Parse resume → extract skills → embed → store",
  },
  {
    key: "B",
    title: "Market Crawler",
    subtitle: "Fetch jobs from JSearch → embed/store",
  },
  {
    key: "C",
    title: "Skill Mapper",
    subtitle: "Map job requirements to skills → compute gaps",
  },
  {
    key: "D",
    title: "Curriculum Assembler",
    subtitle: "Find learning resources per gap",
  },
  { key: "E", title: "Simulator", subtitle: "12-week qualification simulation" },
  {
    key: "F",
    title: "Explainer",
    subtitle: "Why this path? trade-offs + citations",
  },
];

type AgentState = Record<
  AgentKey,
  {
    status: AgentStatus;
    log: string[];
    progress: number; // 0–100
  }
>;

function newAgentState(): AgentState {
  return {
    A: { status: "idle", log: [], progress: 0 },
    B: { status: "idle", log: [], progress: 0 },
    C: { status: "idle", log: [], progress: 0 },
    D: { status: "idle", log: [], progress: 0 },
    E: { status: "idle", log: [], progress: 0 },
    F: { status: "idle", log: [], progress: 0 },
  };
}

export default function HomePage() {
  // --------- your existing state ---------
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("software engineer");
  const [location, setLocation] = useState("Singapore");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [message, setMessage] = useState("");
  const [gapsByJob, setGapsByJob] = useState<Record<string, string[]>>({});
  const [resourcesBySkill, setResourcesBySkill] = useState<
    Record<string, ResourceHit[]>
  >({});
  const [simSteps, setSimSteps] = useState<SimStep[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>("");

  // --------- Agent orchestration state ---------
  const [agents, setAgents] = useState<AgentState>(newAgentState());
  const resetAgents = () => setAgents(newAgentState());

  // helpers
  const appendLog = useCallback((k: AgentKey, line: string) => {
    setAgents((prev) => ({
      ...prev,
      [k]: {
        ...prev[k],
        log: [...prev[k].log, line],
      },
    }));
  }, []);
  const setStatus = useCallback((k: AgentKey, status: AgentStatus) => {
    setAgents((prev) => ({ ...prev, [k]: { ...prev[k], status } }));
  }, []);
  const setProgress = useCallback((k: AgentKey, pct: number) => {
    setAgents((prev) => ({ ...prev, [k]: { ...prev[k], progress: pct } }));
  }, []);

  // ------------- existing handlers (minor fixes) -------------
  async function uploadResume() {
    setLoading(true);
    setMessage("Uploading resume...");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "1", resumeText: resume }),
      });
      const data = await res.json();
      setMessage(data.ok ? "Resume uploaded!" : "Failed to upload resume");
    } catch {
      setMessage("Error uploading resume");
    } finally {
      setLoading(false);
    }
  }

  async function fetchJobs() {
    setLoading(true);
    setMessage("Fetching jobs...");
    try {
      const params = new URLSearchParams({
        role,
        location,
        remote: String(remoteOnly),
      }).toString();
      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setMessage(`Fetched ${data.count ?? 0} jobs`);
    } catch {
      setMessage("Error fetching jobs");
    } finally {
      setLoading(false);
    }
  }

  async function findSimilar() {
    setLoading(true);
    setMessage("Finding similar jobs...");
    try {
      const res = await fetch("/api/similar?userId=1");
      const data = await res.json();
      setJobs(data.jobs || []);
      setMessage(`Found ${data.jobs?.length || 0} jobs`);
    } catch {
      setMessage("Error finding similar jobs");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeGaps(jobId: string) {
    setLoading(true);
    setMessage("Analyzing skill gaps...");
    try {
      const res = await fetch(`/api/gaps?userId=1&jobId=${jobId}`);
      const data = await res.json();
      setGapsByJob((prev) => ({ ...prev, [jobId]: data.missing ?? [] }));
      setMessage(`Found ${data.missing?.length ?? 0} gaps`);
    } catch {
      setMessage("Error analyzing gaps");
    } finally {
      setLoading(false);
    }
  }

  async function fetchResources(skill: string) {
    setLoading(true);
    setMessage(`Finding resources for ${skill}...`);
    try {
      const res = await fetch(
        `/api/resources?skill=${encodeURIComponent(skill)}`
      );
      const data = await res.json();
      setResourcesBySkill((prev) => ({
        ...prev,
        [skill]: data.resources ?? [],
      }));
      setMessage(`Found ${data.resources?.length ?? 0} resources`);
    } catch {
      setMessage("Error finding resources");
    } finally {
      setLoading(false);
    }
  }

  async function simulate(jobId: string) {
    setLoading(true);
    setMessage("Simulating 12-week path...");
    setSelectedJobId(jobId);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "1", jobId, weeklyHours: 10 }),
      });
      const data = await res.json();
      setSimSteps(data.steps ?? []);
      setMessage(`Simulation ready (${data.steps?.length ?? 0} weeks)`);
    } catch {
      setMessage("Error running simulation");
    } finally {
      setLoading(false);
    }
  }

  // ------------- Agent wrappers -------------
  const runAgentA = useCallback(async () => {
    setStatus("A", "running");
    setProgress("A", 10);
    appendLog("A", "Starting ingestion…");
    try {
      await uploadResume();
      setProgress("A", 70);
      appendLog("A", "Resume stored and embedded.");
      setProgress("A", 100);
      setStatus("A", "done");
      appendLog("A", "Agent A finished.");
    } catch (e: any) {
      setStatus("A", "error");
      appendLog("A", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, resume]);

  const runAgentB = useCallback(async () => {
    setStatus("B", "running");
    setProgress("B", 10);
    appendLog("B", "Fetching fresh job postings…");
    try {
      await fetchJobs(); // pulls and stores jobs
      setProgress("B", 60);
      appendLog("B", "Indexing + embedding…");
      await findSimilar(); // populates UI with similar jobs
      setProgress("B", 100);
      setStatus("B", "done");
      appendLog("B", `Found ${jobs.length || "…"} similar jobs.`);
    } catch (e: any) {
      setStatus("B", "error");
      appendLog("B", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, role, location, remoteOnly, jobs.length]);

  const runAgentC = useCallback(async () => {
    setStatus("C", "running");
    setProgress("C", 5);
    appendLog("C", "Selecting top job and computing gaps…");
    try {
      const top = jobs[0];
      if (!top) {
        throw new Error("No jobs available. Run Agent B first.");
      }
      await analyzeGaps(top.id);
      setProgress("C", 100);
      setStatus("C", "done");
      appendLog("C", `Gaps ready for job #${top.id}.`);
    } catch (e: any) {
      setStatus("C", "error");
      appendLog("C", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, jobs]);

  const runAgentD = useCallback(async () => {
    setStatus("D", "running");
    setProgress("D", 5);
    appendLog("D", "Fetching learning resources per gap…");
    try {
      const top = jobs[0];
      if (!top) throw new Error("No jobs available. Run Agent B first.");
      const gaps = gapsByJob[top.id] ?? [];
      if (gaps.length === 0) {
        appendLog("D", "No gaps found (or Agent C hasn’t run).");
        setProgress("D", 100);
        setStatus("D", "done");
        return;
      }
      const per = Math.max(90 / gaps.length, 10);
      for (let i = 0; i < gaps.length; i++) {
        const g = gaps[i];
        appendLog("D", `→ ${g}`);
        await fetchResources(g);
        setProgress("D", Math.min(10 + per * (i + 1), 100));
      }
      setProgress("D", 100);
      setStatus("D", "done");
      appendLog("D", "Curriculum assembled.");
    } catch (e: any) {
      setStatus("D", "error");
      appendLog("D", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, jobs, gapsByJob]);

  const runAgentE = useCallback(async () => {
    setStatus("E", "running");
    setProgress("E", 10);
    appendLog("E", "Simulating 12-week path…");
    try {
      const top = jobs[0];
      if (!top) throw new Error("No jobs available. Run Agent B first.");
      await simulate(top.id);
      setProgress("E", 100);
      setStatus("E", "done");
      appendLog("E", "Simulation complete.");
    } catch (e: any) {
      setStatus("E", "error");
      appendLog("E", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, jobs]);

  const runAgentF = useCallback(async () => {
    setStatus("F", "running");
    setProgress("F", 25);
    appendLog("F", "Generating explainable summary…");
    try {
      const top = jobs[0];
      const gaps = top ? gapsByJob[top.id] ?? [] : [];
      const citedJobs = jobs.slice(0, 3);
      const summary = [
        `Top target: ${top ? `${top.title} @ ${top.company} (${top.location})` : "N/A"}`,
        top ? `Current match score: ${(top.score * 100).toFixed(1)}%` : "",
        gaps.length ? `Primary gaps: ${gaps.join(", ")}` : "No significant gaps detected.",
        simSteps.length
          ? `Projected qualification in 12 weeks: ${
              simSteps[simSteps.length - 1].score
            }%`
          : "No simulation data yet.",
        citedJobs.length
          ? `Citations:\n${citedJobs
              .map((j, i) => `  [${i + 1}] ${j.title} — ${j.url || "N/A"}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      setExplanation(summary);
      setProgress("F", 100);
      setStatus("F", "done");
      appendLog("F", "Report generated.");
    } catch (e: any) {
      setStatus("F", "error");
      appendLog("F", `Error: ${e?.message || "unknown error"}`);
    }
  }, [appendLog, setProgress, setStatus, jobs, gapsByJob, simSteps]);

  const runAll = useCallback(async () => {
    resetAgents();
    await runAgentA();
    await runAgentB();
    await runAgentC();
    await runAgentD();
    await runAgentE();
    await runAgentF();
  }, [runAgentA, runAgentB, runAgentC, runAgentD, runAgentE, runAgentF]);

  // derived
  const topJob = useMemo(() => jobs[0], [jobs]);

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Career Clone Demo</h1>

      {/* Agent Orchestrator */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Agent Orchestrator</h2>
            <p className="text-sm text-muted-foreground">
              Run each agent step-by-step or run the full pipeline.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={resetAgents}>
              Reset
            </Button>
            <Button onClick={runAll}>Run all (A→F)</Button>
          </div>
        </div>

        <div className="grid gap-3">
          {AGENTS.map((a) => {
            const s = agents[a.key];
            return (
              <Card key={a.key} className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      Agent {a.key} — {a.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{a.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        s.status === "done"
                          ? "default"
                          : s.status === "running"
                          ? "secondary"
                          : s.status === "error"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {s.status.toUpperCase()}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={
                        a.key === "A"
                          ? runAgentA
                          : a.key === "B"
                          ? runAgentB
                          : a.key === "C"
                          ? runAgentC
                          : a.key === "D"
                          ? runAgentD
                          : a.key === "E"
                          ? runAgentE
                          : runAgentF
                      }
                    >
                      Run this agent
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={s.progress} />
                  <div className="rounded-md bg-muted p-2 text-xs max-h-28 overflow-auto leading-relaxed">
                    {s.log.length ? (
                      s.log.map((line, i) => <div key={i}>• {line}</div>)
                    ) : (
                      <div className="text-muted-foreground">No logs yet.</div>
                    )}
                  </div>

                  {/* Small dynamic bits per agent */}
                  {a.key === "B" && jobs.length > 0 && (
                    <div className="text-xs">
                      <span className="font-semibold">Top match:</span>{" "}
                      {topJob?.title} @ {topJob?.company} —{" "}
                      {(topJob!.score * 100).toFixed(1)}%
                    </div>
                  )}
                  {a.key === "C" && topJob && (
                    <div className="text-xs">
                      <span className="font-semibold">Gaps ({(gapsByJob[topJob.id]?.length ?? 0)}):</span>{" "}
                      {gapsByJob[topJob.id]?.slice(0, 6).join(", ") ||
                        "—"}
                    </div>
                  )}
                  {a.key === "F" && explanation && (
                    <pre className="text-xs whitespace-pre-wrap">{explanation}</pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Resume uploader */}
      <section className="space-y-2">
        <label className="block font-medium">Paste Resume</label>
        <Textarea
          value={resume}
          onChange={(e: any) => setResume(e.target.value)}
          placeholder="Paste resume text here..."
          className="h-40"
        />
        <Button onClick={uploadResume} disabled={loading}>
          Upload Resume
        </Button>
      </section>

      {/* Search controls */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Role / Keyword</label>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g., backend developer"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Kuala Lumpur"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="remoteOnly"
            checked={remoteOnly}
            onCheckedChange={(v) => setRemoteOnly(Boolean(v))}
          />
          <label htmlFor="remoteOnly" className="text-sm">
            Remote only
          </label>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={fetchJobs} disabled={loading} variant="secondary">
          Fetch JSearch
        </Button>
        <Button onClick={findSimilar} disabled={loading} variant="outline">
          Find Similar Jobs
        </Button>
      </div>

      {message && <p className="text-gray-700">{message}</p>}

      {/* Job results */}
      <div className="grid gap-4 mt-6">
        {jobs.map((job) => (
          <Card key={job.id} className="shadow-sm">
            <CardHeader>
              <CardTitle>{job.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.company} • {job.location}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Match Score: <strong>{(job.score * 100).toFixed(1)}%</strong>
              </p>
            </CardContent>
            <CardFooter className="flex gap-3 flex-wrap">
              {job.url ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  View job posting
                </a>
              ) : null}

              <Button
                size="sm"
                variant="secondary"
                onClick={() => analyzeGaps(job.id)}
                disabled={loading}
              >
                Analyze gaps
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => simulate(job.id)}
                disabled={loading}
              >
                Simulate 12 weeks
              </Button>
            </CardFooter>

            {gapsByJob[job.id]?.length ? (
              <div className="px-6 pb-4">
                <Separator className="my-3" />
                <p className="text-sm font-medium mb-2">Missing skills</p>
                <div className="flex flex-wrap gap-2">
                  {gapsByJob[job.id].map((skill) => (
                    <div key={skill} className="flex items-center gap-2">
                      <Badge variant="secondary">{skill}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => fetchResources(skill)}
                        disabled={loading}
                      >
                        resources
                      </Button>
                    </div>
                  ))}
                </div>

                {/* resources for any clicked skill */}
                <div className="mt-3 space-y-3">
                  {gapsByJob[job.id].map((skill) =>
                    resourcesBySkill[skill]?.length ? (
                      <div key={`res-${skill}`} className="rounded-md border p-3">
                        <p className="text-sm font-semibold mb-1">
                          Resources for {skill}
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                          {resourcesBySkill[skill].map((r, i) => (
                            <li key={`${skill}-${i}`} className="text-sm">
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                {r.title}
                              </a>{" "}
                              <span className="text-muted-foreground">
                                • {r.provider}
                                {r.hours_estimate ? ` • ~${r.hours_estimate}h` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {/* simulation chart */}
      {simSteps.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-2">
            Simulation — Qualification vs Weeks{" "}
            {selectedJobId ? `(Job #${selectedJobId})` : ""}
          </h2>
          <div className="w-full h-64 rounded-lg border p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simSteps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(val: any) => `${val}%`}
                  labelFormatter={(l) => `Week ${l}`}
                />
                <Line type="monotone" dataKey="score" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </main>
  );
}
