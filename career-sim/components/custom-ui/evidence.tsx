'use client'

import { Info, ListChecks } from "lucide-react";

// --- Evidence / Receipts ---
export function Evidence() {
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