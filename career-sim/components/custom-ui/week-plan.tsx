'use client'
import { clamp } from "@/lib/utils";
import { Calendar } from "lucide-react";

// --- Week-by-Week Plan ---
export function WeekPlan({ hours }: { hours: number }) {
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