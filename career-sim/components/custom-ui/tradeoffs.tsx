'use client';

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  HelpCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UserProfile } from "@/types/server/user-profile";

type PathTarget = { id: string; label: string; missingSkills?: string[] };
type TradeoffItem = { factor: string; lift: number; rationale?: string };
type ApiResponse = { tradeoffs: TradeoffItem[] };

type Props = {
  profile?: UserProfile | null;
  pathTargets?: PathTarget[] | null;
};

export function Tradeoffs({ profile, pathTargets }: Props) {
  const [items, setItems] = useState<TradeoffItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // UI toggles
  const [showAll, setShowAll] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const hasProfile =
    !!profile &&
    typeof profile.resume === "string" &&
    profile.resume.trim().length > 0;

  const load = async () => {
    if (!hasProfile) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/tradeoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, targets: pathTargets ?? [] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ApiResponse = await res.json();
      setItems(data.tradeoffs ?? null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load recommendations.");
      setItems(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasProfile) load();
    else {
      setItems(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasProfile,
    profile?.userName,
    profile?.resume,
    profile?.yearsExp,
    JSON.stringify(profile?.skills ?? []),
    JSON.stringify(pathTargets ?? []),
  ]);

  const chartData = useMemo(
    () =>
      (items ?? []).map((d) => ({
        factor: d.factor,
        pct: Math.round((d.lift ?? 0) * 100),
      })),
    [items]
  );

  const visible = useMemo(() => {
    const arr = items ?? [];
    return showAll ? arr : arr.slice(0, 3);
  }, [items, showAll]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
    <button
           onClick={() => setShowHelp((s) => !s)}
           className="inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
           aria-expanded={showHelp}
         >
           <HelpCircle size={14} />+          What does “% bump” mean?
           {showHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
         </button>
         <button
           onClick={load}
           className="inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
           aria-label="Refresh"
         >
           <RefreshCw size={14} />
           Refresh
         </button>
       </div>


      {/* Tiny explainer */}
      {showHelp && (
        <div className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <div className="font-semibold">“Estimated bump” in interview chances</div>
          If an average application gives you a ~10% chance of an interview, a
          <span className="mx-1 rounded-md bg-gray-200 px-1 py-0.5 text-[11px] font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100">
            +15% bump
          </span>
          means your chance becomes ~11.5% for similar applications. It’s an estimate to help you prioritize.
        </div>
      )}

      {/* Guards */}
      {!hasProfile ? (
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          Add your resume to get personalized recommendations.
        </div>
      ) : loading ? (
        <div className="h-40 w-full animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      ) : err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      ) : items && items.length ? (
        <>
          {/* Compact list (Top 3 by default) */}
          <ul className="space-y-2">
            {visible.map((it, idx) => {
              const pct = Math.max(0, Math.min(100, Math.round((it.lift ?? 0) * 100)));
              const impact =
                idx === 0 ? "High impact" : idx === 1 ? "Strong" : idx === 2 ? "Notable" : "Helpful";

              return (
                <li
                  key={it.factor}
                  className="rounded-xl border p-3 dark:border-gray-800"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-gray-900">
                        {impact}
                      </span>
                      <span className="text-sm font-semibold">{it.factor}</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      +{pct}% estimated bump
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all dark:bg-white"
                      style={{ width: `${pct}%` }}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      role="progressbar"
                    />
                  </div>

                  {/* Collapsible rationale */}
                  {it.rationale && (
                    <details className="text-xs text-gray-700 dark:text-gray-200">
                      <summary className="cursor-pointer list-none py-1 text-xs text-gray-600 hover:underline dark:text-gray-300">
                        Why this helps
                      </summary>
                      <div className="mt-1 leading-relaxed">{it.rationale}</div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Controls: Show all / Show chart */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {items.length > 3 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                aria-expanded={showAll}
              >
                {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAll ? "Show top 3" : `Show all (${items.length})`}
              </button>
            )}
            <button
              onClick={() => setShowChart((s) => !s)}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-expanded={showChart}
            >
              <BarChart3 size={14} />
              {showChart ? "Hide chart" : "Show chart"}
            </button>
          </div>

          {/* Optional chart (tucked behind a toggle) */}
          {showChart && (
            <div className="mt-3 h-64 w-full">
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="factor" width={180} />
                  <Tooltip
                    formatter={(v: number) => [`${v}% estimated bump`, "Factor"]}
                  />
                  <Bar dataKey="pct" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-2 text-[11px] text-gray-500">
            These are personalized suggestions based on your resume and target roles. Numbers are directional estimates to help you prioritize.
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">No recommendations yet.</p>
      )}
    </div>
  );
}
