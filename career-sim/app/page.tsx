'use client'
import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Calendar,
  CircleDollarSign,
  Clock,
  GitBranch,
  Info,
  Layers,
  LineChart,
  ListChecks,
  Map,
  RefreshCw,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position
} from "reactflow";
import "reactflow/dist/style.css";
import { Metric } from "@/components/custom-ui/metric";
import { Chip } from "@/components/custom-ui/chip";
import { Slider } from "@/components/custom-ui/slider";
import { Section } from "@/components/custom-ui/section";
import { Toggle } from "@/components/custom-ui/toggle";
import { UserProfile } from "../types/user-profile";
import { OnboardingForm } from "@/components/custom-ui/on-boarding-form";
import { SidebarProfile } from "@/components/custom-ui/sidebar-profile";


// --- Mock helpers ---
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function gaussian(mu: number, sigma: number, x: number) {
  const coef = 1 / (sigma * Math.sqrt(2 * Math.PI));
  return coef * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
}

// Create a simple distribution for time-to-first-offer (in weeks)
function makeTTFO(mean: number, sd: number) {
  const data = [] as { week: number; Safe: number; Aggressive: number }[];
  for (let w = 2; w <= 40; w++) {
    data.push({ week: w, Safe: gaussian(mean + 2, sd, w), Aggressive: gaussian(mean - 3, sd * 0.8, w) });
  }
  return data;
}

// Feature importance mock
function makeImportances() {
  return [
    { factor: "Portfolio / work samples", lift: 0.22 },
    { factor: "Relevant certification", lift: 0.11 },
    { factor: "Interview practice", lift: 0.2 },
    { factor: "Networking (warm intros)", lift: 0.18 },
    { factor: "Mentorship / coaching", lift: 0.12 },
    { factor: "Public profile (talks, writing)", lift: 0.09 },
    { factor: "Volunteering / internships", lift: 0.08 },
  ];
}

// --- Path Explorer Graph (React Flow) ---
const nodeBase = "rounded-xl border bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900";

function PathExplorer({ planMode }: { planMode: string }) {
  const nodes = useMemo(() => ([
    { id: "you", position: { x: 0, y: 120 }, data: { label: "You now" }, type: "input", style: { width: 150 }, className: nodeBase },
    { id: "bridge1", position: { x: 240, y: 40 }, data: { label: "Bridge: foundational skills" }, className: nodeBase },
    { id: "bridge2", position: { x: 240, y: 200 }, data: { label: "Bridge: portfolio & practice" }, className: nodeBase },
    { id: "target1", position: { x: 500, y: 0 }, data: { label: "Target role A" }, className: nodeBase },
    { id: "target2", position: { x: 520, y: 150 }, data: { label: "Target role B" }, className: nodeBase },
    { id: "target3", position: { x: 520, y: 300 }, data: { label: "Target role C" }, className: nodeBase },
  ]), []);

  const edges = useMemo(() => {
    const strength = planMode === "Aggressive" ? 0.85 : planMode === "Safe" ? 0.55 : 0.7;
    return [
      { id: "e1", source: "you", target: "bridge1", label: `${Math.round(strength * 65)}%`, markerEnd: { type: "arrowclosed" } },
      { id: "e2", source: "you", target: "bridge2", label: `${Math.round(strength * 50)}%`, markerEnd: { type: "arrowclosed" } },
      { id: "e3", source: "bridge1", target: "target1", label: `${Math.round(strength * 60)}%`, markerEnd: { type: "arrowclosed" } },
      { id: "e4", source: "bridge2", target: "target2", label: `${Math.round(strength * 55)}%`, markerEnd: { type: "arrowclosed" } },
      { id: "e5", source: "bridge2", target: "target3", label: `${Math.round(strength * 45)}%`, markerEnd: { type: "arrowclosed" } }
    ];
  }, [planMode]);

  return (
    <div className="h-[280px] overflow-hidden rounded-xl border dark:border-gray-800">
      <ReactFlow nodes={nodes as any} edges={edges as any} fitView>
        <MiniMap zoomable pannable />
        <Controls />
        <Background gap={16} />
      </ReactFlow>
      <div className="p-3 text-xs text-gray-500 dark:text-gray-400">
        Confidence on arrows shows how likely each step is, given your plan mode and study time. Examples on hover (mock).
      </div>
    </div>
  );
}

// --- Decision Duel ---
function DecisionDuel({ hours, location }: { hours: number; location: string }) {
  const [choiceA, setChoiceA] = useState("Stay & upskill (self-study)");
  const [choiceB, setChoiceB] = useState("Pivot via course/bootcamp");

  const ttfoData = useMemo(() => makeTTFO(16 - Math.round(hours / 4), 4), [hours]);

  const baseComp = location === "Singapore" ? 82000 : 70000;

  const metricsA = {
    firstOffer: `${clamp(10 - Math.round(hours / 6), 4, 18)} wks`,
    comp1y: `$${(baseComp * 0.95).toLocaleString()}`,
    comp3y: `$${Math.round(baseComp * 1.55).toLocaleString()}`,
    risk: "Medium",
    burnout: "Low"
  };
  const metricsB = {
    firstOffer: `${clamp(12 - Math.round(hours / 7), 4, 20)} wks`,
    comp1y: `$${Math.round(baseComp * 1.05).toLocaleString()}`,
    comp3y: `$${Math.round(baseComp * 1.45).toLocaleString()}`,
    risk: "Medium-High",
    burnout: "Medium"
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-3 rounded-2xl border p-4 dark:border-gray-800">
        <div className="mb-2 text-sm font-semibold">Pick two choices</div>
        <label className="text-xs text-gray-500">Choice A</label>
        <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={choiceA} onChange={(e) => setChoiceA(e.target.value)}>
          <option>Stay & upskill (self-study)</option>
          <option>Stay & upskill (certificate)</option>
          <option>Internal move (new function)</option>
          <option>New employer (similar role)</option>
        </select>
        <label className="mt-3 text-xs text-gray-500">Choice B</label>
        <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={choiceB} onChange={(e) => setChoiceB(e.target.value)}>
          <option>Pivot via course/bootcamp</option>
          <option>Graduate studies (part-time)</option>
          <option>Freelance/contract for exposure</option>
          <option>Career break → re-entry</option>
        </select>
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <Info size={14} />
          Numbers are sample estimates to show the UI.
        </div>
      </div>

      <div className="space-y-3 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="First offer date" value={metricsA.firstOffer + " / " + metricsB.firstOffer} hint={"A / B (weeks)"} />
          <Metric label="1‑yr total pay" value={metricsA.comp1y + " / " + metricsB.comp1y} />
          <Metric label="3‑yr ceiling" value={metricsA.comp3y + " / " + metricsB.comp3y} />
          <Metric label="Burnout risk" value={metricsA.burnout + " / " + metricsB.burnout} />
        </div>
        <div className="rounded-2xl border p-3 dark:border-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><LineChart size={16} />Time‑to‑First‑Offer distribution</div>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <AreaChart data={ttfoData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopOpacity={0.4} />
                    <stop offset="95%" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopOpacity={0.3} />
                    <stop offset="95%" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="Safe" strokeWidth={2} fillOpacity={0.4} fill="url(#gA)" />
                <Area type="monotone" dataKey="Aggressive" strokeWidth={2} fillOpacity={0.3} fill="url(#gB)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Explainable Trade-offs ---
function Tradeoffs() {
  const data = makeImportances()
    .sort((a, b) => b.lift - a.lift)
    .map((d) => ({ ...d, pct: Math.round(d.lift * 100) }));

  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><BarChart3 size={16} />What moves the needle</div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="factor" width={160} />
            <Tooltip formatter={(v: number) => [`${v}% lift`, "Factor"]} />
            <Legend />
            <Bar dataKey="pct" radius={[6, 6, 6, 6]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500">Lift shows estimated increase in interview chances when you add one item to your profile. These are sample values for the demo.</p>
    </div>
  );
}

// --- Week-by-Week Plan ---
function WeekPlan({ hours }: { hours: number }) {
  const totalWeeks = 12;
  const perWeek = clamp(Math.round(hours), 4, 20);
  const tasks = [
    { w: 1, t: "Clarify goals, gather achievements (6h)" },
    { w: 2, t: "Refresh core skills, draft portfolio (8h)" },
    { w: 3, t: "Create 1–2 work samples (8h)" },
    { w: 4, t: "Resume & profile revamp (6h)" },
    { w: 5, t: "Mock interviews & feedback (8h)" },
    { w: 6, t: "Case practice / role-plays (6h)" },
    { w: 7, t: "Targeted learning module (6h)" },
    { w: 8, t: "Networking: 5 warm reach-outs (3h)" },
    { w: 9, t: "Applications & tailored notes (6h)" },
    { w: 10, t: "Portfolio polish & metrics (6h)" },
    { w: 11, t: "Interview loops & follow-ups (4h)" },
    { w: 12, t: "Offer prep & negotiation basics (6h)" },
  ];

  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Calendar size={16} />Week‑by‑Week Plan (12 weeks)</div>
      <ul className="grid gap-2 md:grid-cols-2">
        {tasks.map((x) => (
          <li key={x.w} className="flex items-start gap-3 rounded-xl border p-3 text-sm dark:border-gray-800">
            <div className="mt-1 h-6 w-6 shrink-0 rounded-lg border text-center text-xs font-semibold leading-6 dark:border-gray-700">{x.w}</div>
            <div>
              <div className="font-medium">{x.t}</div>
              <div className="text-xs text-gray-500">Target {perWeek} hours/week · Shift tasks if you fall behind—plan auto‑adjusts.</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- People Like Me ---
function PeopleLikeMe() {
  const people = [
    { name: "A., 26", from: "Assistant", to: "Coordinator", time: "5 months", pay: "$38k → $48k", note: "Portfolio + referral" },
    { name: "K., 29", from: "Analyst", to: "Associate", time: "4 months", pay: "$52k → $65k", note: "Certificate + networking" },
    { name: "S., 31", from: "Operator", to: "Specialist", time: "7 months", pay: "$45k → $60k", note: "3 samples + blog" },
  ];
  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users size={16} />People like me (examples)</div>
      <div className="grid gap-3 md:grid-cols-3">
        {people.map((p, i) => (
          <div key={i} className="rounded-xl border p-3 text-sm shadow-sm dark:border-gray-800">
            <div className="mb-1 font-semibold">{p.name}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">{p.from} → {p.to}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>Time: {p.time}</Chip>
              <Chip>Pay: {p.pay}</Chip>
              <Chip>{p.note}</Chip>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">Examples are anonymized and simplified. In the real app, each card links to sources and proof.</p>
    </div>
  );
}

// --- Evidence / Receipts ---
function Evidence() {
  const items = [
    { k: "Salary survey (region, 2024)", v: "Median comp by level & function" },
    { k: "Job posts (target roles)", v: "Common requirements & keywords" },
    { k: "Alumni stories", v: "Typical pivot timelines" },
    { k: "Program outcomes", v: "Portfolio impact on interviews" },
  ];
  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ListChecks size={16} />Receipts (why we think this)</div>
      <ul className="space-y-2 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{it.k}</div>
              <div className="text-xs text-gray-500">{it.v} · With links and cohort sizes in the full product.</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Risks & Mitigations ---
function Risks() {
  const risks = [
    { title: "Selection bias", body: "We show uncertainty and sample size behind every estimate." },
    { title: "Outdated information", body: "We favor recent sources and down-weight old outcomes." },
    { title: "Over-personalization", body: "You can switch between Safe, Balanced, Aggressive plans." },
    { title: "Single-path thinking", body: "Compare multiple paths side-by-side before committing." },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {risks.map((r, i) => (
        <div key={i} className="rounded-xl border p-3 text-sm dark:border-gray-800">
          <div className="mb-1 flex items-center gap-2 font-semibold"><Shield size={16} />{r.title}</div>
          <p className="text-gray-600 dark:text-gray-300">{r.body}</p>
        </div>
      ))}
    </div>
  );
}

// --- Main App ---
export default function CareerAgentUI() {
  const [hours, setHours] = useState(10);
  const [risk, setRisk] = useState("Balanced");
  const [location, setLocation] = useState("Singapore");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const basePay = location === "Singapore" ? 82000 : 70000;

  if (!profile) {
    return <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 dark:from-gray-950 dark:to-gray-900">
      <OnboardingForm onComplete={(p) => {
        setProfile(p);
      }} />
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="rounded-3xl border bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Sparkles className="h-6 w-6" /> Career Strategy Studio
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                Explore realistic paths, compare choices, and get a weekly plan for your career. Clear numbers, simple language, and sources.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip><Map className="mr-1 inline h-3 w-3" /> Path Explorer</Chip>
              <Chip><GitBranch className="mr-1 inline h-3 w-3" /> Decision Duel</Chip>
              <Chip><Calendar className="mr-1 inline h-3 w-3" /> Week Plan</Chip>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <SidebarProfile profile={profile} />

          <div className="space-y-6 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto pr-1">
            {/* Path Explorer */}
            <Section title="Path Explorer" icon={<Layers className="h-5 w-5" />} actions={<div className="text-sm text-gray-500">Confidence bands shown on arrows</div>}>
              <PathExplorer planMode={risk} />
            </Section>

            {/* Decision Duel */}
            <Section title="Decision Duel" icon={<GitBranch className="h-5 w-5" />}>
              <DecisionDuel hours={hours} location={location} />
            </Section>

            {/* Tradeoffs + Evidence */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Explainable trade‑offs" icon={<BarChart3 className="h-5 w-5" />}>
                <Tradeoffs />
              </Section>
              <Section title="Receipts (evidence)" icon={<ListChecks className="h-5 w-5" />}>
                <Evidence />
              </Section>
            </div>

            {/* Week Plan + People Like Me */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Week‑by‑Week Plan" icon={<Calendar className="h-5 w-5" />} actions={<div className="flex items-center gap-2 text-xs"><Clock size={14} /> Target {hours} h/week</div>}>
                <WeekPlan hours={hours} />
              </Section>
              <Section title="People like me" icon={<Users className="h-5 w-5" />}>
                <PeopleLikeMe />
              </Section>
            </div>

            {/* Footer / Risk cards */}
            <Section title="Risks & safeguards" icon={<Shield className="h-5 w-5" />}>
              <Risks />
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <RefreshCw size={14} />
                We decay old data, show uncertainty clearly, and let you choose plan style.
              </div>
            </Section>

            {/* CTA */}
            <div className="rounded-2xl border bg-white p-5 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mx-auto max-w-2xl">
                <h3 className="text-lg font-semibold">Ready to plug in real data?</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Connect your resume, pick sources (job boards, salary surveys), and turn on live estimates.
                </p>    
                <button className="mt-3 inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white shadow-sm transition hover:opacity-90 dark:bg-white dark:text-gray-900">
                  <CircleDollarSign size={16} /> Continue to data setup <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
