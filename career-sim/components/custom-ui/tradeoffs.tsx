'use client'

import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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




// --- Explainable Trade-offs ---
export function Tradeoffs() {
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