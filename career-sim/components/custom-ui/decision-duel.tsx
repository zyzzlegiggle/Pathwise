'use client'
import { clamp, gaussian } from "@/lib/utils";
import { Info, LineChart } from "lucide-react";
import { useMemo, useState } from "react";
import { Metric } from "./metric";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Create a simple distribution for time-to-first-offer (in weeks)
function makeTTFO(mean: number, sd: number) {
  const data = [] as { week: number; Safe: number; Aggressive: number }[];
  for (let w = 2; w <= 40; w++) {
    data.push({ week: w, Safe: gaussian(mean + 2, sd, w), Aggressive: gaussian(mean - 3, sd * 0.8, w) });
  }
  return data;
}

// --- Decision Duel ---
export function DecisionDuel({ hours, location }: { hours: number; location: string }) {
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