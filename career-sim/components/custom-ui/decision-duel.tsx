'use client'
import { useEffect, useMemo, useState } from "react";
import { Info, LineChart as LineChartIcon } from "lucide-react";
import { Metric } from "./metric";
import {
  LineChart, Line, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { PathTarget } from "@/types/client/path-explorer-data";
import { EvidenceBuckets } from "@/types/client/evidence-types";
import { DecisionResponse } from "@/types/client/decision-response";


const APPROACHES = [
  "Self-study while employed",
  "Bootcamp / certificate",
  "Internal transfer",
  "New employer job search",
];

const FALLBACK_TARGETS: PathTarget[] = [
  { id: "associate-pm", label: "Associate PM", missingSkills: ["Backlog grooming", "PRD writing"] },
  { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
  { id: "ops-analyst", label: "Ops Analyst", missingSkills: ["Excel", "Process mapping"] },
];


export async function fetchDecision(body: Record<string, unknown>) {
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to fetch /api/decision");
  return res.json();
}



// convert server density to cumulative % (0..100)
function toCDF(ttfo: { week: number; Safe: number; Aggressive: number }[]) {
  const sumA = ttfo.reduce((s, d) => s + d.Safe, 0) || 1;
  const sumB = ttfo.reduce((s, d) => s + d.Aggressive, 0) || 1;
  let accA = 0, accB = 0;
  return ttfo.map(d => {
    accA += d.Safe;
    accB += d.Aggressive;
    return { week: d.week, pathA: Math.min(100, (accA / sumA) * 100), pathB: Math.min(100, (accB / sumB) * 100) };
  });
}

export function DecisionDuel({
  hours,
  location,
  pathTargets,
  onEvidence
}: {
  hours: number;
  location: string;
  pathTargets?: PathTarget[];
  onEvidence?: (e: EvidenceBuckets) => void;
}) {
  const targets = pathTargets?.length ? pathTargets : FALLBACK_TARGETS;

  // pick two distinct defaults
  const [targetA, setTargetA] = useState(targets[0]?.label ?? "Associate PM");
  const [targetB, setTargetB] = useState(targets[1]?.label ?? "Business Analyst");
  const [approachA, setApproachA] = useState(APPROACHES[0]);
  const [approachB, setApproachB] = useState(APPROACHES[1]);

  const [server, setServer] = useState<DecisionResponse | null>(null);

  const missingFor = (label: string) =>
    targets.find(t => t.label === label)?.missingSkills ?? [];

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchDecision({
          hours,
          location,
          targetRoleA: targetA,
          targetRoleB: targetB,
          approachA,
          approachB,
          missingSkillsA: missingFor(targetA),
          missingSkillsB: missingFor(targetB),
        });
        if (active) {
          setServer(data);
          // NEW: bubble evidence up
          if (data?.evidence) onEvidence?.(data.evidence);
        }
      } catch {
        if (active) setServer(null);
        // also clear evidence if fetch fails
        onEvidence?.({ comparableOutcomes: [], alumniStories: [], marketNotes: [] });
      }
    })();
    return () => { active = false; };
  }, [hours, location, targetA, targetB, approachA, approachB]);
  const cdf = useMemo(
    () => toCDF(server?.ttfo ?? []),
    [server?.ttfo]
  );

  const mA = server?.metricsA ?? { firstOffer: "—", comp1y: "—", comp3y: "—", risk: "—", burnout: "—" };
  const mB = server?.metricsB ?? { firstOffer: "—", comp1y: "—", comp3y: "—", risk: "—", burnout: "—" };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Left: path pickers with plain language */}
<div className="space-y-4">
          <div className="text-sm font-semibold">Choose two paths to compare</div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-xs font-medium mb-1">Path A — Target role</div>
            <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900"
              value={targetA} onChange={(e) => setTargetA(e.target.value)}>
              {targets.map(t => <option key={t.id}>{t.label}</option>)}
            </select>
            <div className="mt-2 text-xs font-medium mb-1">Approach</div>
            <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900"
              value={approachA} onChange={(e) => setApproachA(e.target.value)}>
              {APPROACHES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>

          <div className="border-t pt-3 dark:border-gray-800" />

          <div>
            <div className="text-xs font-medium mb-1">Path B — Target role</div>
            <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900"
              value={targetB} onChange={(e) => setTargetB(e.target.value)}>
              {targets.map(t => <option key={t.id}>{t.label}</option>)}
            </select>
            <div className="mt-2 text-xs font-medium mb-1">Approach</div>
            <select className="w-full rounded-lg border bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-900"
              value={approachB} onChange={(e) => setApproachB(e.target.value)}>
              {APPROACHES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
          <Info size={14} className="mt-0.5" />
          We estimate how long it may take to get your first offer and what you could earn in year-1 if you land the chosen role in {location}.
        </div>
      </div>

      {/* Right: metrics + clearer chart */}
      <div className="space-y-3 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Offer timeline (weeks)" value={`${mA.firstOffer} / ${mB.firstOffer}`} hint="A / B" />
          <Metric label={`Year-1 pay (${targetA} / ${targetB})`} value={`${mA.comp1y} / ${mB.comp1y}`} />
          <Metric label="3-yr pay potential" value={`${mA.comp3y} / ${mB.comp3y}`} />
          <Metric label="Burnout risk" value={`${mA.burnout} / ${mB.burnout}`} />
        </div>

        <div className="rounded-2xl border p-3 dark:border-gray-800">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <LineChartIcon size={16} /> Chance of having an offer (by week)
          </div>
          <p className="mb-2 text-xs text-gray-500">
            Higher line earlier = faster. Values show % likelihood you’d have at least one offer by that week.
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <LineChart data={cdf} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} label={{ value: "Week", position: "insideBottom", offset: -5 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v)}%`} />
                <Tooltip formatter={(v: number) => `${Math.round(v)}%`} />
                <Legend />
                <Line type="monotone" dataKey="pathA" name={`Path A (${targetA}, ${approachA})`} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pathB" name={`Path B (${targetB}, ${approachB})`} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
