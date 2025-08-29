'use client'
import { Shield } from "lucide-react";

// --- Risks & Mitigations ---
export function Risks() {
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