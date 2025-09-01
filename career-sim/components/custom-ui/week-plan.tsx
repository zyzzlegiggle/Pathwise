// components/custom-ui/week-plan.tsx
'use client'
import { useEffect, useState } from "react";
import { Calendar, Link as LinkIcon } from "lucide-react";
import { clamp } from "@/lib/utils";
import { UserProfile } from "@/types/server/user-profile";
import { PathExplorerData } from "@/types/server/path-explorer-data";
import { WeekItem } from "@/types/server/week-plan";


export function WeekPlan({
  hours,
  profile,
  pathData
}: {
  hours: number;
  profile?: UserProfile | null;
  pathData?: PathExplorerData | null;
}) {
  const [weeks, setWeeks] = useState<WeekItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const perWeek = clamp(Math.round(hours), 4, 20);

  useEffect(() => {
    let active = true;
    setErr(null);
    setWeeks(null); // trigger loading state

    (async () => {
      try {
        const res = await fetch("/api/week-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            hours,
            location: "Singapore", // or lift from page state if user can pick it
            profile: profile ?? undefined,
            pathData: pathData ?? undefined,
          }),
        });
        if (!res.ok) throw new Error(`week-plan: ${res.status}`);
        const json = await res.json();
        if (!active) return;
        setWeeks(Array.isArray(json.weeks) ? json.weeks : []);
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message ?? "Failed to fetch /api/week-plan");
        setWeeks([]);
      }
    })();

    return () => { active = false; };
  }, [hours, profile, pathData]);

  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Calendar size={16} />
        Week-by-Week Plan (12 weeks)
      </div>

      {weeks === null && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {err && (
        <div className="mb-3 rounded-lg border border-red-300/50 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {err}
        </div>
      )}

      {Array.isArray(weeks) && weeks.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {weeks.map((w) => (
            <li key={w.week} className="flex items-start gap-3 rounded-xl border p-3 text-sm dark:border-gray-800">
              <div className="mt-1 h-6 w-6 shrink-0 rounded-lg border text-center text-xs font-semibold leading-6 dark:border-gray-700">
                {w.week}
              </div>
              <div className="min-w-0">
                <div className="font-medium">{w.title}</div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  Target {w.targetHours ?? perWeek} hours · Focus: {w.focusSkills?.join(", ") || "—"}
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-gray-600 dark:text-gray-300">
                  {w.tasks?.map((t, i) => <li key={i}>{t}</li>)}
                </ul>

                {w.resources?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {w.resources.map(r => (
                      <a
                        key={r.id}
                        href={r.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] hover:underline dark:border-gray-700"
                      >
                        <LinkIcon size={12} />
                        {r.title}
                        {r.provider ? <span className="opacity-60">· {r.provider}</span> : null}
                        {r.hours ? <span className="opacity-60">· ~{r.hours}h</span> : null}
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-1 text-[11px] text-gray-500">
                  Shift tasks if you fall behind — plan auto-adjusts next render.
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
