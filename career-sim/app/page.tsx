// app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter
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

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip as TooltipShadcn,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BadgeCheck, Play, FileDown, Loader2 } from "lucide-react";
import { ReferenceLine, Legend } from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";

import{
  ReactFlow, 
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Checkbox } from "@/components/ui/checkbox";


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
type SimStep = { week: number; score: number;  prob?: number };

// ---------- Agent Orchestrator Types ----------
type AgentKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
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
  {
    key: "G",
    title: "Counterfactual Comparator",
    subtitle: "Simulate choices side-by-side (bootcamp vs. self-study vs. transfer)",
  }, 
  { key: "H", title: "Similar Profiles", subtitle: "People like me — receipts & outcomes" },

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
    G: { status: "idle", log: [], progress: 0 },
    H: { status: "idle", log: [], progress: 0 },
  };
}

type Series = { label: string; steps: SimStep[] };

// Counterfactual decisions the user can compare
type DecisionOption = { id: string; label: string; description?: string };

// Uncertainty band for outcomes (p25/p50/p75 per week)
type OutcomeBand = { week: number; p25: number; p50: number; p75: number };

// Summary metrics per decision to show “why” + trade-offs
export type DecisionSummary = {
  decisionId: string;
  cohortSize?: number;
  timeToOfferP50?: number;       // weeks
  salaryDeltaMedian?: number;    // vs baseline
  comp1yr?: number;              
  comp3yrCeiling?: number;       
  burnoutRisk?: number;          
  currency?: string;             
  explanation?: string;   
  riskNotes?: string;            // short text (“small cohort”, etc.)
};
type ConfidenceBand = { p25: number; p50: number; p75: number };
type BridgeTransition = {
  fromSkill: string;
  bridgeSkill: string;
  toRole: string;
  confidence: ConfidenceBand;
  exampleProfileIds: string[];
};
type ExampleProfile = {
  id: string;
  title: string;
  summary: string;
  outcome?: { timeToOfferWeeks?: number; comp1yr?: number };
};

type RFNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string; kind: "from" | "bridge" | "role" };
};
type RFEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  markerEnd?: any;
  data?: { p25: number; p50: number; p75: number; exampleProfileIds: string[] };
};


type PlanTask = {
  id: string;
  title: string;
  estHours: number;
  priority: "high" | "med" | "low";
  skill?: string;
  url?: string;
  done?: boolean;
};

type WeeklyPlanWeek = {
  week: number;
  plannedHours: number;
  checkpoint?: {
    title: string;
    criteria: string; // short description of what "done" looks like
  };
  carriesOverFrom?: number; // previous week number if rolled forward
  tasks: PlanTask[];
};

type SimilarReceipt = {
  profileId: string;
  similarity: number; // 0–1
  pathTaken: string[]; // chips
  timeToOffer?: number; // weeks
  compAfter1yr?: number;
  snippet: string;
  sources: { label: string; url?: string }[];
};

export default function HomePage() {
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("software engineer");
  const [location, setLocation] = useState("United States");
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
  const [salaryTarget, setSalaryTarget] = useState<any>(null);
  const [salaryBaseline, setSalaryBaseline] = useState<any>(null);
  const [salaryDelta, setSalaryDelta] = useState<{currency:string; medianDelta:number|null}|null>(null);
  const [citationsByJob, setCitationsByJob] = useState<Record<string, Array<{skillId:string; name:string; start:number; end:number; snippet:string}>>>({});
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [yearsExp, setYearsExp] = useState<number | ''>('');
  const [stackInput, setStackInput] = useState("");   // comma-separated entry
  const [educationText, setEducationText] = useState("");
  const [plans, setPlans] = useState<{id:string; title:string; createdAt:string}[]>([]);
  const [savedPaths, setSavedPaths] = useState<any[]>([]);
  const [savedSeries, setSavedSeries] = useState<any[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<number>(10);
  const [activeSeries, setActiveSeries] = useState<string[]>([]);   // which series are visible
  const [targetThreshold, setTargetThreshold] = useState<number>(75); // goal line on chart
  const [activeTab, setActiveTab] = useState<"plan"|"profile"|"jobs"|"results"|"orchestrator">("plan");
  const [jobsPage, setJobsPage] = useState(1);
  const [riskTolerance, setRiskTolerance] = useState<1 | 2 | 3>(2); // 1=safe,2=balanced,3=aggressive
  const [decisions, setDecisions] = useState<DecisionOption[]>([
    { id: "self-study", label: "Self-study (10h/wk)", description: "Projects + open source" },
    { id: "bootcamp", label: "Part-time bootcamp", description: "Tuition + structured mentorship" },
    { id: "internal-transfer", label: "Internal transfer", description: "Bridge role in current company" },
  ]);

  const [bridgeSkills, setBridgeSkills] = useState<string[]>([]);
  const [transitions, setTransitions] = useState<BridgeTransition[]>([]);
  const [exampleProfiles, setExampleProfiles] = useState<Record<string, ExampleProfile>>({});
  const [activeBridge, setActiveBridge] = useState<string | null>(null);
  const [showProfileId, setShowProfileId] = useState<string | null>(null);

  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanWeek[]>([]);
  const [observedHoursByWeek, setObservedHoursByWeek] = useState<Record<number, number>>({});
  const [currentWeek, setCurrentWeek] = useState<number>(1);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  
  // Which choices to compare
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<string[]>(["self-study", "bootcamp"]);

  // Result: for each decision, an array of p25/p50/p75 bands per week
  const [compareSeries, setCompareSeries] = useState<Record<string, OutcomeBand[]>>({});

  // Result: quick facts for cards
  const [decisionSummaries, setDecisionSummaries] = useState<DecisionSummary[]>([]);
  const pageSize = 6;
  const pagedJobs = useMemo(() => {
    const start = (jobsPage - 1) * pageSize;
    return jobs.slice(start, start + pageSize);
  }, [jobs, jobsPage]);
  const totalJobPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  useEffect(() => { if (jobs.length) setJobsPage(1); }, [jobs]);
  // collapse/expand for job rows
  const [openJobIds, setOpenJobIds] = useState<Record<string, boolean>>({});
  const [similarReceipts, setSimilarReceipts] = useState<SimilarReceipt[]>([]);
  const toggleJobRow = (id: string) =>
    setOpenJobIds(prev => ({ ...prev, [id]: !prev[id] }));

  // tiny fade/slide variants for smoother tab/content transitions
  const fadeSlide = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.18 } },
    exit: { opacity: 0, y: 8, transition: { duration: 0.12 } },
  };

  const RiskBadge: React.FC<{ score?: number }> = ({ score }) => {
  if (score == null) return <Badge variant="outline">N/A</Badge>;
  const label = score < 30 ? "Low" : score < 60 ? "Med" : "High";
  return <Badge variant={score < 30 ? "secondary" : score < 60 ? "default" : "destructive"}>
    Burnout: {label}
  </Badge>;
  };

  useEffect(() => {
  if (multiSeries.length) {
    setActiveSeries(multiSeries.map((s) => s.label));
  } else {
    setActiveSeries(["Match score", "Qualification probability"]);
  }
  }, [multiSeries]);

  useEffect(() => {
    if (!transitions.length) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    const filtered = transitions.filter(
      (t) => !activeBridge || t.bridgeSkill === activeBridge
    );

    // columns & spacing
    const colX = { from: 40, bridge: 300, role: 580 };
    const rowH = 84;

    // unique nodes
    const froms = Array.from(new Set(filtered.map((t) => t.fromSkill)));
    const bridges = Array.from(new Set(filtered.map((t) => t.bridgeSkill)));
    const roles = Array.from(new Set(filtered.map((t) => t.toRole)));

    const nodes: RFNode[] = [
      ...froms.map((s, i) => ({
        id: `from:${s}`,
        position: { x: colX.from, y: 40 + i * rowH },
        data: { label: s, kind: "from" as const},
      })),
      ...bridges.map((s, i) => ({
        id: `bridge:${s}`,
        position: { x: colX.bridge, y: 40 + i * rowH },
        data: { label: s, kind: "bridge" as const},
      })),
      ...roles.map((r, i) => ({
        id: `role:${r}`,
        position: { x: colX.role, y: 40 + i * rowH },
        data: { label: r, kind: "role" as const},
      })),
    ];

    // edges with p50 as label
    const edges: RFEdge[] = [];
    filtered.forEach((t, i) => {
      const e1 = {
        id: `e1:${t.fromSkill}->${t.bridgeSkill}:${i}`,
        source: `from:${t.fromSkill}`,
        target: `bridge:${t.bridgeSkill}`,
        label: `${t.confidence.p50}%`,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { ...t.confidence, exampleProfileIds: t.exampleProfileIds },
      };
      const e2 = {
        id: `e2:${t.bridgeSkill}->${t.toRole}:${i}`,
        source: `bridge:${t.bridgeSkill}`,
        target: `role:${t.toRole}`,
        label: `${t.confidence.p50}%`,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { ...t.confidence, exampleProfileIds: t.exampleProfileIds },
      };
      edges.push(e1 as RFEdge, e2 as RFEdge);
    });

    setRfNodes(nodes);
    setRfEdges(edges);
  }, [transitions, activeBridge, setRfNodes, setRfEdges]);


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

  const getObservedHours = (w: WeeklyPlanWeek) =>
  (w.tasks || []).reduce((sum, t) => sum + (t.done ? t.estHours : 0), 0);

  const isSlip = (w: WeeklyPlanWeek) => getObservedHours(w) < w.plannedHours;

  function autoAdjustPlan(startWeek: number) {
    if (!weeklyPlan.length) return;

    // Make a deep-ish copy
    const plan = weeklyPlan.map(w => ({
      ...w,
      tasks: [...w.tasks],
    }));

    for (let i = startWeek - 1; i < plan.length; i++) {
      const w = plan[i];
      const observed = getObservedHours(w);
      const slack = w.plannedHours - observed;

      if (slack <= 0) continue; // no slip

      // Identify unfinished tasks (lowest priority first)
      const unfinished = w.tasks
        .filter(t => !t.done)
        .sort((a, b) => {
          const rank = { low: 2, med: 1, high: 0 };
          return rank[a.priority] - rank[b.priority];
        });

      let carry = 0;
      for (const t of unfinished) {
        if (carry >= slack) break;
        // Move this task to next week
        const nextIdx = Math.min(i + 1, plan.length - 1);
        plan[nextIdx].tasks.push({ ...t });
        plan[nextIdx].carriesOverFrom = plan[nextIdx].carriesOverFrom ?? w.week;
        // Remove from current week
        w.tasks = w.tasks.filter(x => x.id !== t.id);
        carry += t.estHours;
      }
    }

    setWeeklyPlan(plan);
  }

  function toggleTask(weekNum: number, taskId: string) {
    setWeeklyPlan(prev =>
      prev.map(w =>
        w.week === weekNum
          ? { ...w, tasks: w.tasks.map(t => (t.id === taskId ? { ...t, done: !t.done } : t)) }
          : w
      )
    );
  }


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
      recencyDays: "60",
    }).toString();
    const res = await fetch(`/api/jobs?${params}`);
    const data = await res.json();

    const list: JobResult[] = data.jobs || [];
    setJobs(list);

    // initialize selected job + citations for downstream agents
    const firstId = list[0]?.id ?? null;
    setSelectedJobId(firstId);
    if (firstId) {
      const top3 = list.slice(0, 3).map((j) => j.id);
      setCitedJobIds(Array.from(new Set([firstId, ...top3])).slice(0, 5));
    }

    setMessage(`Fetched ${data.count ?? list.length} jobs`);
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
        body: JSON.stringify({ userId: "1", jobId, weeklyHours }),
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
  async function saveProfile() {
  const stacks = stackInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await fetch("/api/ingest/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "1",
      linkedinUrl,
      resumeText: resume, // optional — reuse paste if present
      shortForm: {
        yearsExperience: yearsExp === '' ? null : Number(yearsExp),
        stacks,
        education: educationText,
      },
    }),
  });
  const data = await res.json();
  setMessage(data.ok ? "Profile saved & skills deduped" : data.error || "Failed to save profile");
}

  async function saveCurrentPlan() {
    const title =
      `Plan — ${goalRole || "Target Role"} — ${new Date().toLocaleString()}`;

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "1",
        title,
        inputs: {
          goalRole,
          timeframeMin: goalMonths[0],
          timeframeMax: goalMonths[1],
          stackPrefs,
          riskTolerance,                         
          decisions: selectedDecisionIds,       
          targetJobTitle: jobs.find(j=>j.id===selectedJobId)?.title ?? "",
          targetLocation: jobs.find(j=>j.id===selectedJobId)?.location ?? "",
          pathIds: selectedPathIds,
        },
        sources: {
          citedJobs: citedJobIds.map((id) => {
            const j = jobs.find((x) => x.id === id);
            return { id, title: j?.title || "Unknown", url: j?.url || null };
          }),
          salarySources: [salaryTarget?.source, salaryBaseline?.source].filter(Boolean),
        },
        outputs: {
          missing: selectedJobId ? (gapsByJob[selectedJobId] || []) : [],
          paths: savedPaths,
          series: savedSeries,
          compareSeries,
          decisionSummaries,  
          salaryTarget,
          salaryBaseline,
          delta: salaryDelta,
          explanation, // Agent F summary text
        },
      }),
    });
    const data = await res.json();
    setMessage(data.ok ? `Saved plan #${data.planId}` : "Failed to save plan");
  }

  async function refreshPlans() {
  const r = await fetch("/api/plans?userId=1");
  const j = await r.json();
  setPlans(j.plans || []);
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
    if (!jid) { setMessage("Select or fetch a target job before running Agent C."); return; }
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
      const { gaps, cluster, coverage, citations, pathExplorer } = JSON.parse(e.data);
      setGapsByJob((prev) => ({ ...prev, [jid]: gaps || [] }));
      setClusterInfo(cluster || null); // optional: display "Matched cluster: Backend SWE (0.91)"
      if (citations?.length) {
         setCitationsByJob((prev) => ({ ...prev, [jid]: citations }));
       }
      if (pathExplorer) {
          setBridgeSkills(pathExplorer.bridgeSkills || []);
          setTransitions(pathExplorer.transitions || []);
          if (pathExplorer.exampleProfiles) {
            setExampleProfiles((prev) => ({ ...prev, ...pathExplorer.exampleProfiles }));
          }
      }
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
    const { resources, paths: p, weeklyPlan: wp } = JSON.parse(e.data);
    setResourcesBySkill((prev) => ({ ...prev, ...resources }));
    if (p) {
      setPaths(p);
      setSavedPaths(p);
      setSelectedPathIds(p.slice(0, 2).map((x: any) => x.pathId)); // preselect top 2
    }
    if (wp?.length) setWeeklyPlan(wp);
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
  if (!jid) { setMessage("Select or fetch a target job before running Agent E."); return; }  setAgents((s) => ({ ...s, E: { ...s.E, status: "running", log: [], progress: 0 } }));
  setMultiSeries([]); // reset
  const es = onRunSSE({
    agent: "E",
    userId: "1",
    jobId: jid,
    variants: "8,10,15",
    timeframeMin: String(goalMonths[0]),
    timeframeMax: String(goalMonths[1]),
    stackPrefs: stackPrefs.join(","),
    pathIds: selectedPathIds.join(","),
    risk: String(riskTolerance),          // NEW
  });
  es.addEventListener("log", (e: any) => appendLog("E", JSON.parse(e.data).line));
  es.addEventListener("progress", (e: any) =>
    setProgress("E", JSON.parse(e.data).progress)
  );
  es.addEventListener("payload", (e: any) => {
    const { series, salary } = JSON.parse(e.data);
    setMultiSeries(series || []);
    if (series) setSavedSeries(series);
    // also keep single-series backward compat
    if (salary) setSalaryTarget(salary);
    
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
    targetRole: goalRole || (jobs.find(j=>j.id===selectedJobId)?.title ?? "Software Engineer"),
  });
  es.addEventListener("log", (e: any) => appendLog("F", JSON.parse(e.data).line));
  es.addEventListener("progress", (e: any) =>
    setProgress("F", JSON.parse(e.data).progress)
  );
  es.addEventListener("payload", (e: any) => {
    const { citedJobs, salaryTarget, salaryBaseline, delta } = JSON.parse(e.data);
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
    const summary = [
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

    // Build evidence once and append to the summary, then set a SINGLE time.
    let evidence = "";
    if (selectedJobId && citationsByJob[selectedJobId]?.length) {
      const lines = citationsByJob[selectedJobId]
        .slice(0, 6)
        .map((c) => `• ${c.name}: “…${c.snippet.slice(0, 120)}…”`);
      evidence = `\n\nEvidence:\n${lines.join("\n")}`;
    }
    setExplanation(summary + evidence);

    setSalaryTarget(salaryTarget || null);
    setSalaryBaseline(salaryBaseline || null);
    setSalaryDelta(delta || null);
  });

  es.addEventListener("status", (e: any) => {
    const { status } = JSON.parse(e.data);
    setStatus("F", status as any);
    if (status !== "running") es.close();
  });
};

  const onRunG = () => {
    setAgents((s) => ({ ...s, G: { ...s.G, status: "running", log: [], progress: 0 } }));
    const es = onRunSSE({
      agent: "G",
      userId: "1",
      jobId: selectedJobId || jobs[0]?.id || "",
      decisions: selectedDecisionIds.join(","),   // e.g. "self-study,bootcamp"
      risk: String(riskTolerance),                // 1,2,3 affects assumptions
      timeframeMin: String(goalMonths[0]),
      timeframeMax: String(goalMonths[1]),
      weeklyHours: String(weeklyHours),
    });

    es.addEventListener("log", (e: any) => appendLog("G", JSON.parse(e.data).line));
    es.addEventListener("progress", (e: any) => setProgress("G", JSON.parse(e.data).progress));
    es.addEventListener("payload", (e: any) => {
      // expected payload: { bands: Record<decisionId, OutcomeBand[]>, summaries: DecisionSummary[] }
      const { bands, summaries } = JSON.parse(e.data);
      if (bands) setCompareSeries(bands);
      if (summaries) setDecisionSummaries(summaries);
    });
    es.addEventListener("status", (e: any) => {
      const { status } = JSON.parse(e.data);
      setStatus("G", status as any);
      if (status !== "running") es.close();
    });
  };

  const onRunH = () => {
    setAgents((s) => ({ ...s, H: { ...s.H, status: "running", log: [], progress: 0 } }));
    const es = onRunSSE({
      agent: "H",
      userId: "1",
      role,
      location,
      stackPrefs: stackPrefs.join(","),
      targetRole: goalRole || role,
      weeklyHours: String(weeklyHours),
      yearsExp: String(yearsExp || ""),
    });
    es.addEventListener("log", (e: any) => appendLog("H", JSON.parse(e.data).line));
    es.addEventListener("progress", (e: any) => setProgress("H", JSON.parse(e.data).progress));
    es.addEventListener("payload", (e: any) => {
      const { profiles } = JSON.parse(e.data);
      if (profiles?.length) setSimilarReceipts(profiles);
    });
    es.addEventListener("status", (e: any) => {
      const { status } = JSON.parse(e.data);
      setStatus("H", status as any);
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
  setTimeout(() => onRunG(), 3800);
  setTimeout(() => onRunH(), 4400);
};

  // derived
  const topJob = useMemo(() => jobs[0], [jobs]);

  // compact circular score pill for job cards
  const ScorePill: React.FC<{ score: number }> = ({ score }) => {
    const pct = Math.max(0, Math.min(100, Math.round(score)));
    return (
      <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-full"
        style={{ background: `conic-gradient(hsl(var(--primary)) ${pct*3.6}deg, hsl(var(--muted-foreground)) 0)` }}>
        <div className="absolute w-9 h-9 rounded-full bg-background border" />
        <motion.span
          className="text-xs font-semibold"
          key={pct}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {pct}%
        </motion.span>
      </div>
    );
  };

  // Hours slider with label
  const HoursSlider: React.FC<{ value:number; onChange:(v:number)=>void }> = ({ value, onChange }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Weekly learning hours</Label>
        <span className="text-[11px]  text-muted-foreground">{value}h/wk</span>
      </div>
      <Slider
        value={[value]}
        min={4}
        max={20}
        step={1}
        onValueChange={(v)=> onChange(v[0] ?? value)}
      />
    </div>
  );

  // Compact, expandable job row
  const JobRow: React.FC<{ job: JobResult }> = ({ job }) => {
    const isOpen = !!openJobIds[job.id];
    return (
      <div className="border rounded-xl p-3">
        <button
          className="w-full text-left"
          onClick={() => toggleJobRow(job.id)}
          aria-expanded={isOpen}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{job.title}</div>
              <div className="text-[11px]  text-muted-foreground truncate">
                {job.company} • {job.location}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ScorePill score={job.score * 100} />
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div {...fadeSlide} className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {job.url && (
                  <a href={job.url} target="_blank" rel="noreferrer" className="underline text-xs">
                    View posting
                  </a>
                )}
                <Button size="xs" variant="secondary" onClick={() => analyzeGaps(job.id)} disabled={loading}>
                  Analyze gaps
                </Button>
                <Button size="xs" variant="outline" onClick={() => simulate(job.id)} disabled={loading}>
                  Simulate
                </Button>
                <Button
                  size="xs"
                  variant={selectedJobId === job.id ? "default" : "outline"}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    const top3 = jobs.slice(0, 3).map((j) => j.id);
                    setCitedJobIds(Array.from(new Set([job.id, ...top3])).slice(0, 5));
                    setExplanation("");
                  }}
                >
                  Set target
                </Button>
              </div>

              {(!gapsByJob[job.id]?.length) && (
                <p className="text-[11px] text-muted-foreground">
                  Tip: run <span className="font-medium">Analyze gaps</span> to unlock resources.
                </p>
              )}

              {gapsByJob[job.id]?.length ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {gapsByJob[job.id].map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-[11px]">{skill}</Badge>
                    ))}
                  </div>

                  {/* keep your resources block, but tighten paddings */}
                  <div className="space-y-2">
                    {gapsByJob[job.id].map((skill) =>
                      resourcesBySkill[skill]?.length ? (
                        <div key={`res-${skill}`} className="rounded-lg border p-2">
                          <div className="text-xs font-medium mb-1">Resources for {skill}</div>
                          <ul className="list-disc pl-4 space-y-1">
                            {resourcesBySkill[skill].map((r, i) => (
                              <li key={`${skill}-${i}`} className="text-xs">
                                <a href={r.url} target="_blank" rel="noreferrer" className="underline">{r.title}</a>{" "}
                                <span className="text-muted-foreground">
                                  • {r.provider}{r.hours_estimate ? ` • ~${r.hours_estimate}h` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <Button
                          key={`btn-${skill}`}
                          size="xs"
                          variant="outline"
                          onClick={() => fetchResources(skill)}
                          disabled={loading}
                        >
                          Find {skill} resources
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

  };

  // Alightweight dashboard shell + sidebar nav
  const SidebarNav = ({
    active,
    onChange,
  }: {
    active: string;
    onChange: (v: any) => void;
  }) => {
    const items: Array<{ key: typeof active; label: string; icon?: React.ReactNode }> = [
      { key: "plan", label: "Plan" },
      { key: "profile", label: "Profile" },
      { key: "jobs", label: "Openings" },
      { key: "results", label: "Results" },
      { key: "orchestrator", label: "Orchestrator" },
    ];
    return (
      <nav className="p-3 space-y-1">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => onChange(i.key as any)}
            className={[
              "w-full text-left px-3 py-2 rounded-lg text-sm transition",
              active === i.key
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted text-muted-foreground",
            ].join(" ")}
            aria-current={active === i.key ? "page" : undefined}
          >
            {i.label}
          </button>
        ))}
      </nav>
    );
  };

  const DashboardShell: React.FC<{ title?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title="Career Clone", actions, children }) => (
    <div className="mx-auto max-w-6xl">
      {/* header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b">
        <div className="px-5 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      </header>

      {/* body with sidebar */}
      <div className="grid grid-cols-12 gap-0">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r min-h-[calc(100vh-49px)]">
          {/* you’ll wire activeTab into here */}
          {/* placeholder; actual usage below in the main return */}
        </aside>
        <section className="col-span-12 md:col-span-9 lg:col-span-10 p-5">{children}</section>
      </div>
    </div>
  );

  // compact KPI strip (stat cards)
  const KPICard = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {hint ? <div className="text-[11px]  text-muted-foreground">{hint}</div> : null}
    </div>
  );

  // empty state
  const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
    <div className="rounded-xl border p-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint ? <div className="text-[11px]  text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );


  return (
    <main>
  <DashboardShell
    actions={
      <>
        <Button size="sm" variant="secondary" onClick={saveGoals}>Save goals</Button>
        <Button size="sm" onClick={runAll}><Play className="mr-1 h-4 w-4"/>Run pipeline</Button>
      </>
    }
  >
    {/* inject sidebar nav that controls activeTab */}
    <div className="grid grid-cols-12 gap-0">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r">
        <SidebarNav active={activeTab} onChange={(v)=> setActiveTab(v as any)} />
      </aside>

      <section className="col-span-12 md:col-span-9 lg:col-span-10 space-y-6">
        {/* KPI strip – small, glanceable */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Openings" value={jobs.length || "—"} hint="from JSearch / similar" />
          <KPICard label="Target hours" value={`${weeklyHours} h/wk`} hint="simulation input" />
          <KPICard label="Qualification target" value={`${targetThreshold}%`} />
          <KPICard
            label="Selected job"
            value={selectedJobId ? "Set" : "Not set"}
            hint={selectedJobId ? undefined : "Pick in Openings"}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "plan" && (
            <motion.div key="tab-plan" {...fadeSlide} className="space-y-6">
              <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold">Plan</h2>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={saveGoals} size="sm">Save</Button>
                    <Button onClick={runAll} size="sm"><Play className="mr-1 h-4 w-4"/>Run</Button>
                  </div>
                </div>
              <Tabs defaultValue="goal" className="w-full">

              <TabsList className="grid grid-cols-3 w-full text-xs">
                <TabsTrigger value="goal">Goal</TabsTrigger>
                <TabsTrigger value="prefs">Prefs</TabsTrigger>
                <TabsTrigger value="runtime">Sim</TabsTrigger>
              </TabsList>

              <TabsContent value="goal" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-sm">Target role</Label>
                    <Input
                      value={goalRole}
                      onChange={(e) => setGoalRole(e.target.value)}
                      placeholder="e.g., Backend SWE"
                      className="mt-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Timeframe (months)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={1}
                        value={goalMonths[0]}
                        onChange={(e)=> setGoalMonths([Number(e.target.value), goalMonths[1]])}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="number" min={goalMonths[0]}
                        value={goalMonths[1]}
                        onChange={(e)=> setGoalMonths([goalMonths[0], Number(e.target.value)])}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="prefs" className="mt-4">
                <Label className="text-sm">Tech focus</Label>
                <div className="flex flex-wrap gap-2 mt-2">
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
                <Separator className="my-3" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <div className="sm:col-span-2">
                    <Label className="text-sm">Decisions to compare</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {decisions.map((d) => {
                        const on = selectedDecisionIds.includes(d.id);
                        return (
                          <Button
                            key={d.id}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            onClick={() =>
                              setSelectedDecisionIds((prev) =>
                                on ? prev.filter((x) => x !== d.id) : [...prev, d.id].slice(0, 3)
                              )
                            }
                            title={d.description}
                          >
                            {d.label}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-[11px]  text-muted-foreground mt-1">Pick up to 3.</p>
                  </div>

                  <div>
                    <Label className="text-sm">Risk tolerance</Label>
                    <div className="mt-2">
                      <Slider
                        value={[riskTolerance]}
                        min={1}
                        max={3}
                        step={1}
                        onValueChange={(v) => setRiskTolerance((v[0] ?? 2) as 1 | 2 | 3)}
                      />
                      <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                        <span>Safe</span><span>Balanced</span><span>Aggressive</span>
                      </div>
                    </div>
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="runtime" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <HoursSlider value={weeklyHours} onChange={(v)=> setWeeklyHours(v)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Target qualification</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={50} max={100}
                        value={targetThreshold}
                        onChange={(e)=> setTargetThreshold(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px]  text-muted-foreground mt-2">
                  We’ll draw a goal line at the target qualification and overlay scenarios (8/10/15h).
                </p>
              </TabsContent>
            </Tabs>
              </section>
            </motion.div>
          )}

          {activeTab === "profile" && (
            <motion.div key="tab-profile" {...fadeSlide} className="space-y-6">
              {/* Resume uploader + Profile */}
              <section className="rounded-xl border p-4 space-y-3">
                <h2 className="text-sm font-semibold">Your Profile</h2>
                {/* Paste Resume (unchanged component) */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Paste resume (optional)</label>
                  {/* keep your Textarea + Upload button */}
                  <Textarea
                    value={resume}
                    onChange={(e: any) => setResume(e.target.value)}
                    placeholder="Paste resume text here..."
                    className="h-40"
                  />
                  <Button onClick={uploadResume} disabled={loading}>
                    Upload Resume
                  </Button>
                </div>

                <Separator className="my-3" />

                <h2 className="text-sm font-semibold">Connect Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
              <div className="sm:col-span-3 space-y-1">
                <label className="block text-sm font-medium">LinkedIn URL</label>
                <Input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/your-handle"
                  inputMode="url"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">Years of experience</label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={yearsExp}
                  onChange={(e) => setYearsExp(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g., 4"
                  className="w-28"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-sm font-medium">Stacks (comma separated)</label>
                <Input
                  value={stackInput}
                  onChange={(e) => setStackInput(e.target.value)}
                  placeholder="Rust, Tokio, Go, gRPC, PostgreSQL"
                />
                <p className="text-[11px]  text-muted-foreground">We’ll dedupe and normalize against the skill catalog.</p>
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="block text-sm font-medium">Education</label>
                <Textarea
                  value={educationText}
                  onChange={(e) => setEducationText(e.target.value)}
                  placeholder="e.g., BSc in Computer Science, University of X (2019)"
                  className="h-20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={saveProfile}>Save profile</Button>
            </div>
              </section>
            </motion.div>
          )}

          {activeTab === "jobs" && (
            <motion.div key="tab-jobs" {...fadeSlide} className="space-y-6">
              {/* Job Finder controls */}
              <section className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Find openings</h2>
                  <div className="flex gap-2">
                    <Button onClick={fetchJobs} disabled={loading} size="sm" variant="secondary">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Fetch
                    </Button>
                    <Button onClick={findSimilar} disabled={loading} size="sm" variant="outline">
                      Similar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Role / Keyword</Label>
                    <Input value={role} onChange={(e)=> setRole(e.target.value)} placeholder="backend developer" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Location</Label>
                    <Input value={location} onChange={(e)=> setLocation(e.target.value)} placeholder="e.g., Singapore" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="remoteOnly" checked={remoteOnly} onCheckedChange={(v)=> setRemoteOnly(Boolean(v))}/>
                    <Label htmlFor="remoteOnly" className="text-xs">Remote only</Label>
                  </div>
                </div>
              </section>

              {message && (
                <motion.div {...fadeSlide} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {message}
                </motion.div>
              )}

              {/* Target job selector (compact) */}
              {jobs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm font-medium">Target job for C–F</label>
                
                  <select
                className="border rounded-lg px-2 py-1 text-sm"
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

              {/* Job results — compact list with pagination */}
              {!!jobs.length && (
                <section className="space-y-3">
                  <div className="grid gap-3">
                    {pagedJobs.map((job) => <JobRow key={job.id} job={job} />)}
                  </div>

                  {totalJobPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px]  text-muted-foreground">
                        Page {jobsPage} of {totalJobPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobsPage((p) => Math.max(1, p - 1))}
                          disabled={jobsPage === 1}
                        >
                          Prev
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobsPage((p) => Math.min(totalJobPages, p + 1))}
                          disabled={jobsPage === totalJobPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {!jobs.length && (
                <EmptyState title="No openings yet" hint="Try Fetch or adjust role/location." />
              )}
            </motion.div>
          )}

          {activeTab === "results" && (
            <motion.div key="tab-results" {...fadeSlide} className="space-y-6">
              {Object.keys(compareSeries).length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Decision Duel — outcome bands</h3>
                    <Button size="sm" variant="outline" onClick={() => onRunG()}>
                      Recompute
                    </Button>
                  </div>

                  {/* Simple comparison table of quick facts */}
                  <div className="rounded-lg border overflow-hidden">

                    <div className="grid gap-3 sm:grid-cols-2">
                      {decisionSummaries.map((s) => {
                        const d = decisions.find(d => d.id === s.decisionId);
                        return (
                          <Card key={s.decisionId} className="shadow-sm">
                            <CardHeader className="py-2">
                                <CardTitle className="text-sm">{d?.label}</CardTitle>
                                <div className="text-[11px] text-muted-foreground">
                                  {s.cohortSize ? `${s.cohortSize} similar` : "cohort unknown"}
                                  {s.riskNotes ? ` — ${s.riskNotes}` : ""}
                                </div>
                              </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-2 text-sm">
                              <div className="rounded-lg border p-2">
                                <div className="text-[11px] text-muted-foreground">First offer (p50)</div>
                                <div className="font-medium">{s.timeToOfferP50 ? `${s.timeToOfferP50} weeks` : "—"}</div>
                              </div>
                              <div className="rounded-lg border p-2">
                                <div className="text-[11px] text-muted-foreground">1-yr comp</div>
                                <div className="font-medium">
                                  {s.comp1yr != null ? `${s.currency ?? ""} ${s.comp1yr.toLocaleString()}` : "—"}
                                </div>
                              </div>
                              <div className="rounded-lg border p-2">
                                <div className="text-[11px] text-muted-foreground">3-yr ceiling</div>
                                <div className="font-medium">
                                  {s.comp3yrCeiling != null ? `${s.currency ?? ""} ${s.comp3yrCeiling.toLocaleString()}` : "—"}
                                </div>
                              </div>
                              <div className="rounded-lg border p-2 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-muted-foreground">Well-being</div>
                                  <RiskBadge score={s.burnoutRisk} />
                                </div>
                                {s.burnoutRisk != null && (
                                  <div className="w-24">
                                    <Progress value={s.burnoutRisk} />
                                  </div>
                                )}
                              </div>
                            </CardContent>
                            {s.explanation && (
                              <CardFooter className="pt-0">
                                <p className="text-[11px]  text-muted-foreground">{s.explanation}</p>
                              </CardFooter>
                            )}
                          </Card>
                        );
                      })}
                    </div>

                  </div>

                  {/* Mini band chart for the first selected decision (keep it lightweight) */}
                  <div className="w-full h-64 rounded-lg border p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={(compareSeries[selectedDecisionIds[0]] ?? []).map(d => ({
                        week: d.week, p25: d.p25, p50: d.p50, p75: d.p75
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week" />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v:any)=> `${v}%`} labelFormatter={(l)=>`Week ${l}`} />
                        <Legend />
                        <ReferenceLine y={targetThreshold} strokeDasharray="4 4" label={`${targetThreshold}% target`} />
                        <Line type="monotone" dataKey="p25" name="p25" dot />
                        <Line type="monotone" dataKey="p50" name="p50 (median)" dot />
                        <Line type="monotone" dataKey="p75" name="p75" dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="text-[11px]  text-muted-foreground">
                    Bands show uncertainty from similar profiles. Risk tolerance biases plan selection and the simulator’s assumptions.
                  </p>
                </section>
              )}

              {!Object.keys(compareSeries).length && !simSteps.length && (
                <EmptyState title="No results yet" hint="Run a simulation to visualize progress." />
              )}

              {transitions.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold">Path Explorer</h2>

                  {/* Bridge skills filter */}
                  <div className="flex flex-wrap gap-2">
                    {bridgeSkills.map((bs) => {
                      const on = activeBridge === bs;
                      return (
                        <Button
                          key={bs}
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() => setActiveBridge(on ? null : bs)}
                        >
                          {bs}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Transitions list with confidence bands + example profiles */}
                  <div className="rounded-lg border divide-y">
                    {transitions
                      .filter((t) => !activeBridge || t.bridgeSkill === activeBridge)
                      .map((t, idx) => (
                        <div key={idx} className="p-3 grid grid-cols-5 gap-2 items-center">
                          <div className="text-sm truncate">{t.fromSkill}</div>
                          <div className="text-sm text-center">
                            → <Badge className="mx-1" variant="secondary">{t.bridgeSkill}</Badge> →
                          </div>
                          <div className="text-sm truncate">{t.toRole}</div>
                          <div className="space-y-1">
                            <div className="text-[11px] text-muted-foreground">Confidence (p25 / p50 / p75)</div>
                            <div className="flex items-center gap-2">
                              <Progress value={t.confidence.p50} className="w-32" />
                              <span className="text-xs">
                                {t.confidence.p25}% / {t.confidence.p50}% / {t.confidence.p75}%
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end">
                            {t.exampleProfileIds.slice(0, 3).map((pid) => (
                              <Button
                                key={pid}
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs underline"
                                onClick={() => setShowProfileId(pid)}
                              >
                                Profile {pid}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Example profile modal */}
                  <Dialog open={!!showProfileId} onOpenChange={(o) => !o && setShowProfileId(null)}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Example profile</DialogTitle>
                      </DialogHeader>
                      {showProfileId && (
                        <div className="space-y-2 text-sm">
                          <div className="font-medium">
                            {exampleProfiles[showProfileId]?.title || `Profile ${showProfileId}`}
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {exampleProfiles[showProfileId]?.summary}
                          </p>
                          {exampleProfiles[showProfileId]?.outcome && (
                            <div className="text-[11px]  text-muted-foreground">
                              {exampleProfiles[showProfileId]?.outcome?.timeToOfferWeeks
                                ? `Offer in ~${exampleProfiles[showProfileId]?.outcome?.timeToOfferWeeks} weeks`
                                : null}
                              {exampleProfiles[showProfileId]?.outcome?.comp1yr
                                ? ` • 1-yr comp: ${exampleProfiles[showProfileId]?.outcome?.comp1yr.toLocaleString()}`
                                : null}
                            </div>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                  <div className="w-full h-[440px] rounded-lg border overflow-hidden">
                    <ReactFlow
                      nodes={rfNodes}
                      edges={rfEdges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      fitView
                      proOptions={{ hideAttribution: true }}
                      onEdgeClick={(_, edge: any) => {
                        const ids = (edge?.data?.exampleProfileIds as string[]) || [];
                        if (ids[0]) setShowProfileId(ids[0]); // open modal you already wired
                      }}
                    >
                      <MiniMap pannable zoomable />
                      <Controls showInteractive />
                      <Background />
                    </ReactFlow>
                  </div>
                  <p className="text-[11px]  text-muted-foreground">
                    Click an edge to open an example profile for that bridge. Edge labels show median confidence (p50).
                  </p>
                </section>
              )}


              {weeklyPlan.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Week-by-Week Plan</h2>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}>Prev</Button>
                      <Button size="sm" variant="outline" onClick={() => setCurrentWeek(Math.min(weeklyPlan.length, currentWeek + 1))}>Next</Button>
                      <Button size="sm" onClick={() => autoAdjustPlan(currentWeek)}>Auto-adjust from Week {currentWeek}</Button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {weeklyPlan.map((w) => {
                      const observed = getObservedHours(w);
                      const slip = observed < w.plannedHours;
                      return (
                        <Card key={w.week} className={w.week === currentWeek ? "ring-2 ring-primary" : ""}>
                          <CardHeader className="py-3 flex flex-row items-center justify-between">
                            <div className="space-y-1">
                              <CardTitle className="text-base">Week {w.week}</CardTitle>
                              <div className="text-[11px]  text-muted-foreground">
                                Planned {w.plannedHours}h • Observed {observed}h
                                {w.carriesOverFrom ? ` • Carry-over from week ${w.carriesOverFrom}` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {w.checkpoint ? <Badge variant="secondary">Checkpoint</Badge> : null}
                              {slip ? <Badge variant="destructive">Behind</Badge> : <Badge variant="outline">On track</Badge>}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Progress value={Math.min(100, (observed / Math.max(1, w.plannedHours)) * 100)} />
                            {w.checkpoint && (
                              <div className="rounded-lg border p-2 text-xs">
                                <div className="font-medium">{w.checkpoint.title}</div>
                                <div className="text-muted-foreground">{w.checkpoint.criteria}</div>
                              </div>
                            )}
                            <div className="space-y-2">
                              {(w.tasks || []).map((t) => (
                                <div key={t.id} className="flex items-center justify-between rounded-lg border p-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox checked={!!t.done} onCheckedChange={() => toggleTask(w.week, t.id)} />
                                    <div>
                                      <div className="text-sm">{t.title}</div>
                                      <div className="text-[11px]  text-muted-foreground">
                                        {t.skill ? `${t.skill} • ` : ""}{t.estHours}h • {t.priority.toUpperCase()}
                                        {t.url ? <> • <a className="underline" href={t.url} target="_blank" rel="noreferrer">resource</a></> : null}
                                      </div>
                                    </div>
                                  </div>
                                  {t.done ? <Badge variant="secondary">Done</Badge> : null}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Simulation chart + controls (move your whole simulation section here) */}
              {(multiSeries.length > 0 || simSteps.length > 0) ? (
                <section className="space-y-3">
                  {/* keep your existing HoursSlider + Re-simulate + chart */}
                  <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Simulation — Qualification vs Weeks {selectedJobId ? `(Job #${selectedJobId})` : ""}
                </h2>
                <div className="flex items-center gap-3">
                  <HoursSlider value={weeklyHours} onChange={(v)=> setWeeklyHours(v)} />
                  <Button
                    size="sm"
                    onClick={() => {
                      // re-run E with hours variants around selection for comparison
                      setSelectedPathIds((p) => p.slice(0, 3));
                      onRunE();
                    }}
                  >
                    Re-simulate
                  </Button>
                </div>
              </div>

              {/* Series toggles */}
              <div className="flex flex-wrap gap-2">
                {(multiSeries.length ? multiSeries.map(s => s.label) : ["Match score","Qualification probability"]).map((label) => {
                  const on = activeSeries.includes(label);
                  return (
                    <Button
                      key={label}
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() =>
                        setActiveSeries((prev) =>
                          prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
                        )
                      }
                    >
                      {on ? <BadgeCheck className="mr-1 h-4 w-4" /> : null}
                      {label}
                    </Button>
                  );
                })}
              </div>

              <div className="w-full h-72 rounded-lg border p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(multiSeries[0]?.steps || simSteps).map((row, idx) => {
                      const base: Record<string, any> = { week: row.week, score: row.score, prob: row.prob };
                      multiSeries.forEach((s, si) => { base[s.label] = s.steps[idx]?.score ?? null; });
                      return base;
                    })}
                  >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(val: any) => (val == null ? "—" : `${val}%`)} labelFormatter={(l) => `Week ${l}`} />
                  <ReferenceLine y={targetThreshold} strokeDasharray="4 4" label={`${targetThreshold}%`} />
                  {multiSeries.length > 0 ? (
                    multiSeries.map((s) =>
                      activeSeries.includes(s.label) ? (
                        <Line key={s.label} type="monotone" dataKey={s.label} name={s.label} dot={false} strokeWidth={2} />
                      ) : null
                    )
                  ) : (
                    <>
                      {activeSeries.includes("Match score") && (
                        <Line type="monotone" dataKey="score" name="Match score" dot={false} strokeWidth={2} />
                      )}
                      {activeSeries.includes("Qualification probability") && (
                        <Line type="monotone" dataKey="prob" name="Qualification probability" dot={false} strokeWidth={2} />
                      )}
                    </>
                  )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px]  text-muted-foreground">
                The dashed line marks your target qualification ({targetThreshold}%). Toggle series to compare scenarios.
              </p>

                </section>
              ) : (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">
                    Run a simulation from the Jobs tab to see projected qualification over time.
                  </p>
                </Card>
              )}

            {similarReceipts.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">People Like Me — Receipts</h2>
                  <Button size="sm" variant="outline" onClick={onRunH}>Refresh</Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {similarReceipts.map((p) => (
                    <Card key={p.profileId} className="shadow-sm">
                      <CardHeader className="py-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Profile {p.profileId.replace(/^.+-/, "").toUpperCase()}</CardTitle>
                          <Badge variant="secondary">{Math.round(p.similarity * 100)}% match</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.pathTaken.map((chip, i) => (
                            <Badge key={i} variant="outline" className="text-[11px]">{chip}</Badge>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.snippet}</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-lg border p-2">
                            <div className="text-[11px] text-muted-foreground">Offer timing</div>
                            <div className="font-medium">{p.timeToOffer ? `~${p.timeToOffer} weeks` : "—"}</div>
                          </div>
                          <div className="rounded-lg border p-2">
                            <div className="text-[11px] text-muted-foreground">Comp after 1 yr</div>
                            <div className="font-medium">
                              {p.compAfter1yr != null ? `${salaryTarget?.currency ?? ""} ${p.compAfter1yr.toLocaleString()}` : "—"}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      {p.sources?.length ? (
                        <CardFooter className="flex flex-wrap gap-2">
                          {p.sources.map((s, i) =>
                            s.url ? (
                              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-xs underline">
                                {s.label}
                              </a>
                            ) : (
                              <span key={i} className="text-[11px]  text-muted-foreground">{s.label}</span>
                            )
                          )}
                        </CardFooter>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </section>
            )}

            

            </motion.div>
          )}

          {activeTab === "orchestrator" && (
            <motion.div key="tab-orchestrator" {...fadeSlide} className="space-y-6">
              {/* Inline Orchestrator: convert Dialog to inline card for tab view */}
              <section className="rounded-xl border">
                <div className="p-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Agent Orchestrator</h2>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={resetAgents}>Reset</Button>
                    <Button onClick={runAll}>Run all (A→F)</Button>
                  </div>
                </div>
                <Separator />
                <ScrollArea className="max-h-[70vh] p-4">
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
                        <p className="text-[11px]  text-muted-foreground">{a.subtitle}</p>
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
                            a.key === "A" ? onRunA
                            : a.key === "B" ? onRunB
                            : a.key === "C" ? onRunC
                            : a.key === "D" ? onRunD
                            : a.key === "E" ? onRunE
                            : a.key === "F" ? onRunF
                            : a.key === "G" ? onRunG
                            : onRunH
                          }
                        >
                          Run this agent
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Progress value={s.progress} />
                      <div className="rounded-lg bg-muted p-2 text-xs max-h-28 overflow-auto leading-relaxed">
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
                      {a.key === "F" && (salaryTarget || salaryBaseline) && (
                        <div className="text-xs grid gap-1">
                          {salaryTarget && (
                            <div>
                              <span className="font-semibold">Target salary (median):</span>{" "}
                              {salaryTarget.currency} {salaryTarget.median?.toLocaleString() ?? "—"}
                              {salaryTarget.p25 && salaryTarget.p75
                                ? `  (p25 ${salaryTarget.p25.toLocaleString()} • p75 ${salaryTarget.p75.toLocaleString()})`
                                : ""}
                              <span className="text-muted-foreground"> — {salaryTarget.source}</span>
                            </div>
                          )}
                          {salaryBaseline && (
                            <div>
                              <span className="font-semibold">Baseline (median):</span>{" "}
                              {salaryBaseline.currency} {salaryBaseline.median?.toLocaleString() ?? "—"}
                              <span className="text-muted-foreground"> — {salaryBaseline.source}</span>
                            </div>
                          )}
                          {salaryDelta && salaryDelta.medianDelta != null && (
                            <div>
                              <span className="font-semibold">Estimated delta:</span>{" "}
                              {salaryDelta.currency} {salaryDelta.medianDelta.toLocaleString()}
                            </div>
                          )}
                          {decisionSummaries.length > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {decisionSummaries.map((s) => (
                                <div key={`sum-${s.decisionId}`}>
                                  {decisions.find(d=>d.id===s.decisionId)?.label}:{" "}
                                  {s.cohortSize ? `${s.cohortSize} similar profiles` : "cohort unknown"}
                                  {s.riskNotes ? ` — ${s.riskNotes}` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {a.key === "F" && selectedJobId && citationsByJob[selectedJobId]?.length > 0 && (
                        <div className="text-xs">
                          <div className="font-semibold mb-1">Evidence from job description:</div>
                          <div className="flex flex-wrap gap-2">
                            {citationsByJob[selectedJobId].map((c, i) => (
                              <TooltipShadcn key={`${c.skillId}-${i}`}>
                                <TooltipTrigger asChild>
                                  <Badge variant="secondary">{c.name}</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs whitespace-pre-wrap">
                                  <p className="text-[11px] leading-snug">{c.snippet}</p>
                                </TooltipContent>
                              </TooltipShadcn>
                            ))}
                          </div>
                        </div>
                      )}

                      {plans.length > 0 && (
                      <section className="rounded-xl border p-4 space-y-2 mt-3">
                        <h3 className="text-sm font-semibold">My Plans</h3>
                        <ul className="space-y-1 text-sm">
                          {plans.map((p) => (
                            <li key={p.id} className="flex items-center justify-between">
                              <span>{p.title}</span>
                              <div className="flex gap-2">
                                <a
                                  href={`/api/export?planId=${p.id}&format=md`}
                                  className="underline"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Export .md
                                </a>
                                <a
                                  href={`/api/export?planId=${p.id}&format=pdf`}
                                  className="underline"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Export .pdf
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2">
                          <Button onClick={saveCurrentPlan}>Save plan</Button>
                          {plans.length === 0 ? (
                            <Button variant="outline" onClick={refreshPlans}>Load My Plans</Button>
                          ) : null}
                        </div>
                      </section>
                    )}



                    </CardContent>
                  </Card>
                );
              })}
            </div>
                </ScrollArea>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* subtle global message */}
        {message && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{message}</div>
        )}
      </section>
    </div>
  </DashboardShell>
</main>


  );
}
