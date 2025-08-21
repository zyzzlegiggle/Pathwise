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
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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

type Series = { label: string; steps: SimStep[] };

export default function HomePage() {
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
  const [citedJobIds, setCitedJobIds] = useState<string[]>([]);
  const [multiSeries, setMultiSeries] = useState<Series[]>([]);
  const [goalRole, setGoalRole] = useState("backend SWE");
  const [goalMonths, setGoalMonths] = useState<[number, number]>([6, 9]);
  const [stackPrefs, setStackPrefs] = useState<string[]>([]); // e.g., ["Rust","Go","Java"]
  const [paths, setPaths] = useState<{ pathId: string; name: string; skills: string[] }[]>([]);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const [clusterInfo, setClusterInfo] = useState<{id:string,name:string,sim:number}|null>(null);

  // --------- Agent orchestration state ---------
  const [agents, setAgents] = useState<AgentState>(newAgentState());
  const resetAgents = () => { setAgents(newAgentState()); setClusterInfo(null); };
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

  function onRunSSE(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    const es = new EventSource(`/api/agents/run?${qs}`);
    return es;
  }

    async function saveGoals() {
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "1",
        targetRole: goalRole,
        timeframeMin: goalMonths[0],
        timeframeMax: goalMonths[1],
        stackPrefs,
      }),
    });
  }


  // ------------- Agent wrappers -------------
  // Agent A
  const onRunA = () => {
    setAgents((s) => ({ ...s, A: { ...s.A, status: "running", log: [], progress: 0 } }));
    const es = onRunSSE({
      agent: "A",
      userId: "1",
      // WARNING: querystrings have length limits; for long resumes, switch to POST streaming in prod.
      resume: resume.slice(0, 3000),
    });
    es.addEventListener("log", (e: any) =>
      appendLog("A", JSON.parse(e.data).line)
    );
    es.addEventListener("progress", (e: any) =>
      setProgress("A", JSON.parse(e.data).progress)
    );
    es.addEventListener("status", (e: any) => {
      const { status } = JSON.parse(e.data);
      setStatus("A", status as any);
      if (status !== "running") es.close();
    });
  };

  // Agent B
  const onRunB = () => {
    setAgents((s) => ({ ...s, B: { ...s.B, status: "running", log: [], progress: 0 } }));
    const es = onRunSSE({
      agent: "B",
      userId: "1",
      role,
      location,
      remote: String(remoteOnly),
    });
    es.addEventListener("log", (e: any) =>
      appendLog("B", JSON.parse(e.data).line)
    );
    es.addEventListener("progress", (e: any) =>
      setProgress("B", JSON.parse(e.data).progress)
    );
    es.addEventListener("payload", (e: any) => {
      const p = JSON.parse(e.data);
      if (p.jobs) {
        setJobs(p.jobs);
        // initialize selector + citations
        const id = p.jobs[0]?.id;
        if (id) {
          setSelectedJobId(id);
          setCitedJobIds(Array.from(new Set([id, ...p.jobs.slice(0, 3).map((j: any) => j.id)])));
        }
      }
    });
    es.addEventListener("status", (e: any) => {
      const { status } = JSON.parse(e.data);
      setStatus("B", status as any);
      if (status !== "running") es.close();
    });
  };

  // Agent C
  const onRunC = () => {
    const jid = selectedJobId || jobs[0]?.id;
    if (!jid) return;
    setAgents((s) => ({ ...s, C: { ...s.C, status: "running", log: [], progress: 0 } }));
    const es = onRunSSE({  agent: "C",
            userId: "1",
            jobId: jid,
            timeframeMin: String(goalMonths[0]),
            timeframeMax: String(goalMonths[1]),
            stackPrefs: stackPrefs.join(","),});
    es.addEventListener("log", (e: any) => appendLog("C", JSON.parse(e.data).line));
    es.addEventListener("progress", (e: any) =>
      setProgress("C", JSON.parse(e.data).progress)
    );
    es.addEventListener("payload", (e: any) => {
      const { gaps, cluster, coverage } = JSON.parse(e.data);
      setGapsByJob((prev) => ({ ...prev, [jid]: gaps || [] }));
      setClusterInfo(cluster || null); // optional: display "Matched cluster: Backend SWE (0.91)"
    });
    es.addEventListener("status", (e: any) => {
      const { status } = JSON.parse(e.data);
      setStatus("C", status as any);
    if (status !== "running") es.close();
  });
};

// Agent D
const onRunD = () => {
  const jid = selectedJobId || jobs[0]?.id;
  const skills = (gapsByJob[jid] || []).join(",");
  setAgents((s) => ({ ...s, D: { ...s.D, status: "running", log: [], progress: 0 } }));
  const es = onRunSSE({  agent: "D",
  userId: "1",
  skills,
  timeframeMin: String(goalMonths[0]),
  timeframeMax: String(goalMonths[1]),
  stackPrefs: stackPrefs.join(","),
 });
  es.addEventListener("log", (e: any) => appendLog("D", JSON.parse(e.data).line));
  es.addEventListener("progress", (e: any) =>
    setProgress("D", JSON.parse(e.data).progress)
  );
  es.addEventListener("payload", (e: any) => {
    const { resources, paths: p } = JSON.parse(e.data);
    setResourcesBySkill((prev) => ({ ...prev, ...resources }));
    if (p) {
      setPaths(p);
      setSelectedPathIds(p.slice(0, 2).map((x: any) => x.pathId)); // preselect top 2
    }
  });
  es.addEventListener("status", (e: any) => {
    const { status } = JSON.parse(e.data);
    setStatus("D", status as any);
    if (status !== "running") es.close();
  });
};

// Agent E — multi-path (8/10/15 h/week overlay)
const onRunE = () => {
  const jid = selectedJobId || jobs[0]?.id;
  if (!jid) return;
  setAgents((s) => ({ ...s, E: { ...s.E, status: "running", log: [], progress: 0 } }));
  setMultiSeries([]); // reset
  const es = onRunSSE({
    agent: "E",
  userId: "1",
  jobId: jid,
  variants: "8,10,15",
  timeframeMin: String(goalMonths[0]),
  timeframeMax: String(goalMonths[1]),
  stackPrefs: stackPrefs.join(","),
  pathIds: selectedPathIds.join(",")
  });
  es.addEventListener("log", (e: any) => appendLog("E", JSON.parse(e.data).line));
  es.addEventListener("progress", (e: any) =>
    setProgress("E", JSON.parse(e.data).progress)
  );
  es.addEventListener("payload", (e: any) => {
    const { series } = JSON.parse(e.data);
    setMultiSeries(series || []);
    // also keep single-series backward compat
    
    const base = series?.find((s: any) => s.label === "10h/wk") || series?.[0];
    if (base) setSimSteps(base.steps);
  });
  es.addEventListener("status", (e: any) => {
    const { status } = JSON.parse(e.data);
    setStatus("E", status as any);
    if (status !== "running") es.close();
  });
};

// Agent F — pass citations
const onRunF = () => {
  setAgents((s) => ({ ...s, F: { ...s.F, status: "running", log: [], progress: 0 } }));
  const es = onRunSSE({
    agent: "F",
    userId: "1",
    citedJobs: citedJobIds.join(","),
  });
  es.addEventListener("log", (e: any) => appendLog("F", JSON.parse(e.data).line));
  es.addEventListener("progress", (e: any) =>
    setProgress("F", JSON.parse(e.data).progress)
  );
  es.addEventListener("payload", (e: any) => {
    const { citedJobs } = JSON.parse(e.data);
    // build a short explanation that cites titles/urls from current jobs list
    const lookup = new Map(jobs.map((j) => [j.id, j]));
    const picked = citedJobs
      .map((id: string, i: number) => {
        const j = lookup.get(id);
        return j ? `[${i + 1}] ${j.title} — ${j.url || "N/A"}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const top = jobs.find((j) => j.id === (selectedJobId || jobs[0]?.id));
    const gaps = top ? (gapsByJob[top.id] || []) : [];
    const summary =
      [
        `Top target: ${top ? `${top.title} @ ${top.company} (${top.location})` : "N/A"}`,
        top ? `Current match score: ${(top.score * 100).toFixed(1)}%` : "",
        gaps.length ? `Primary gaps: ${gaps.join(", ")}` : "No significant gaps detected.",
        multiSeries.length
          ? `Projected qualification after 12 weeks: ${multiSeries
              .map((s) => `${s.label} → ${s.steps.at(-1)?.score ?? "—"}%`)
              .join(" | ")}`
          : simSteps.length
          ? `Projected qualification in 12 weeks: ${simSteps.at(-1)?.score ?? "—"}%`
          : "No simulation data yet.",
        picked ? `Citations:\n${picked}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    setExplanation(summary);
  });
  es.addEventListener("status", (e: any) => {
    const { status } = JSON.parse(e.data);
    setStatus("F", status as any);
    if (status !== "running") es.close();
  });
};


  const runAll = async () => {
  // run sequentially to keep UX simple
  onRunA();
  // wait a bit for A to finish before starting B (quick heuristic for demo)
  setTimeout(() => onRunB(), 400);
  setTimeout(() => onRunC(), 1200);
  setTimeout(() => onRunD(), 1800);
  setTimeout(() => onRunE(), 2400);
  setTimeout(() => onRunF(), 3200);
};

  // derived
  const topJob = useMemo(() => jobs[0], [jobs]);

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Career Clone Demo</h1>
      {/* Goals form */}
      <section className="rounded-xl border p-4 space-y-3 mb-3">
        <h3 className="text-sm font-semibold">Pick Goals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <Input
            value={goalRole}
            onChange={(e) => setGoalRole(e.target.value)}
            placeholder="Target role (e.g., backend SWE)"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={goalMonths[0]}
              onChange={(e) => setGoalMonths([Number(e.target.value), goalMonths[1]])}
              placeholder="Min months"
               className="w-24"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              min={goalMonths[0]}
              value={goalMonths[1]}
              onChange={(e) => setGoalMonths([goalMonths[0], Number(e.target.value)])}
              placeholder="Max months"
               className="w-24"
            />
            <span className="text-sm">months</span>
          </div>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {["Rust","Go","Java","Python","LLM apps","Data Eng","MLOps"].map((t) => {
              const on = stackPrefs.includes(t);
              return (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  onClick={() =>
                    setStackPrefs((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))
                  }
                >
                  {t}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={saveGoals}>Save goals</Button>
          {/* Optional: run all with current goals */}
          <Button onClick={runAll}>Run all (A→F) with goals</Button>
        </div>
      </section>

      {/* Agent Orchestrator */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open Agent Orchestrator</Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Agent Orchestrator</DialogTitle>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={resetAgents}>Reset</Button>
              <Button onClick={runAll}>Run all (A→F)</Button>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[80vh] pr-2">
              <section className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Run each agent step-by-step or run the full pipeline.
            </p>
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
                          ? onRunA
                          : a.key === "B"
                          ? onRunB
                          : a.key === "C"
                          ? onRunC
                          : a.key === "D"
                          ? onRunD
                          : a.key === "E"
                          ? onRunE
                          : onRunF
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
                  {a.key === "C" && topJob && clusterInfo && (
                    <div className="text-xs">
                      <span className="font-semibold">Role cluster:</span> {clusterInfo.name} ({(clusterInfo.sim*100).toFixed(1)}%)
                    </div>
                  )}
                  {a.key === "C" && topJob && (
                    <div className="text-xs">
                      <span className="font-semibold">Gaps ({(gapsByJob[topJob.id]?.length ?? 0)}):</span>{" "}
                      {gapsByJob[topJob.id]?.slice(0, 6).join(", ") ||
                        "—"}
                    </div>
                  )}
                  
                  {a.key === "D" && paths.length > 0 && (
                    <div className="text-xs space-y-2">
                      <div className="font-semibold">Paths</div>
                      <div className="flex flex-wrap gap-2">
                        {paths.map((p) => {
                          const on = selectedPathIds.includes(p.pathId);
                          return (
                            <Button
                              key={p.pathId}
                              size="sm"
                              variant={on ? "default" : "outline"}
                              onClick={() =>
                                setSelectedPathIds((prev) =>
                                  on ? prev.filter((id) => id !== p.pathId) : [...prev, p.pathId]
                                )
                              }
                            >
                              {p.name}
                            </Button>
                          );
                        })}
                      </div>
                      <div className="text-muted-foreground">
                        Tip: select 1–3 paths, then run Agent E.
                      </div>
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
          </ScrollArea>
          

          
        </DialogContent>
      </Dialog>
      

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

      {jobs.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Target job for C–F</label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={selectedJobId ?? jobs[0]?.id}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedJobId(id);
              // keep 3 most-relevant job ids for potential citations
              const top3 = jobs.slice(0, 3).map((j) => j.id);
              // ensure selected is included
              const citations = Array.from(new Set([id, ...top3])).slice(0, 5);
              setCitedJobIds(citations);
            }}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} @ {j.company} — {(j.score * 100).toFixed(1)}%
              </option>
            ))}
          </select>
        </div>
      )}

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

      {/* simulation chart with multi-path overlay */}
      {(multiSeries.length > 0 || simSteps.length > 0) && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-2">
            Simulation — Qualification vs Weeks{" "}
            {selectedJobId ? `(Job #${selectedJobId})` : ""}
          </h2>
          <div className="w-full h-64 rounded-lg border p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={
                  // merge data by week for tooltip alignment (uses the longest series)
                  (multiSeries[0]?.steps || simSteps).map((row, idx) => {
                    const base = { week: row.week, base: row.score };
                    multiSeries.forEach((s, si) => {
                      base.base = s.steps[idx]?.score ?? null;
                    });
                    return base;
                  })
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(val: any) => (val == null ? "—" : `${val}%`)}
                  labelFormatter={(l) => `Week ${l}`}
                />
                {multiSeries.length > 0
                  ? multiSeries.map((s, i) => (
                      <Line
                        key={s.label}
                        type="monotone"
                        dataKey={`s${i}`}
                        name={s.label}
                        dot
                      />
                    ))
                  : (
                      <Line type="monotone" dataKey="base" name="10h/wk" dot />
                    )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </main>
  );
}
