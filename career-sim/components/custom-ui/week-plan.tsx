'use client'
import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Link as LinkIcon, Sparkles } from "lucide-react";
import { clamp } from "@/lib/utils";
import { WeekItem } from "@/types/server/week-plan";
import { UserProfile } from "@/types/server/user-profile";
import { PathExplorerData } from "@/types/server/path-explorer-data";

type APIResponse = {
  role: string;
  weeks: WeekItem[];
  phases?: { label: string; start: number; end: number }[];
};

const PRESETS = [6, 8, 10, 12, 15, 20];

export function WeekPlan({
  hours: hoursProp,
  profile,
  pathData,
  location = "Singapore",
  onHoursChange,
}: {
  hours: number;
  profile?: UserProfile | null;
  pathData?: PathExplorerData | null;
  location?: string;
  onHoursChange?: (h: number) => void;
}) {
  const [localHours, setLocalHours] = useState(hoursProp);
  const [selectedRole, setSelectedRole] = useState<string>(() => pathData?.targets?.[0]?.label ?? "Associate PM");
  const [compact, setCompact] = useState(true);
  const [openPhase, setOpenPhase] = useState<string | null>("Foundation");

  const [data, setData] = useState<APIResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const perWeek = clamp(Math.round(localHours), 4, 20);

  useEffect(() => setLocalHours(hoursProp), [hoursProp]);

  useEffect(() => {
    let active = true;
    setErr(null);
    setData(null);
    (async () => {
      try {
        const res = await fetch("/api/week-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            hours: perWeek,
            location,
            preferredRole: selectedRole,
            profile: profile ?? undefined,
            pathData: pathData ?? undefined,
          }),
        });
        if (!res.ok) throw new Error(`week-plan: ${res.status}`);
        const json: APIResponse = await res.json();
        if (!active) return;
        setData(json);
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message ?? "Failed to fetch /api/week-plan");
        setData({ role: selectedRole, weeks: [], phases: [] });
      }
    })();
    return () => { active = false; };
  }, [perWeek, selectedRole, location, profile, pathData]);

  const targets = pathData?.targets ?? [];
  const phases = useMemo(() => data?.phases ?? [
    { label: "Foundation", start: 1, end: 4 },
    { label: "Build",      start: 5, end: 8 },
    { label: "Launch",     start: 9, end: 12 },
  ], [data?.phases]);

  const weeksByPhase = useMemo(() => {
    const map: Record<string, WeekItem[]> = {};
    for (const ph of phases) {
      map[ph.label] = (data?.weeks ?? []).filter(w => w.week >= ph.start && w.week <= ph.end);
    }
    return map;
  }, [data?.weeks, phases]);

  return (
    <div className="min-w-0">
      {/* Header (flat) */}
      <div className="sticky top-0 z-10 mb-3 border-b bg-white/70 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold">
              <Calendar size={16} />
              <span className="truncate">Week Plan (12w)</span>
            </span>

            <div className="flex items-center gap-2 text-xs">
              <span className="opacity-70">Role:</span>
              <select
                className="max-w-[60vw] truncate border bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                {[data?.role, ...targets.map(t => t.label)]
                  .filter(Boolean)
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .map(r => <option key={r} className="truncate">{r}</option>)}
              </select>
            </div>

            <button
              className="border px-2 py-1 text-xs dark:border-gray-700"
              onClick={() => setCompact(v => !v)}
              title="Toggle compact view"
            >
              {compact ? "Compact" : "Full"}
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="text-xs opacity-70">Hours/week:</div>
            <input
              type="range" min={4} max={20} value={perWeek}
              onChange={(e) => {
                const h = clamp(parseInt(e.target.value, 10) || 10, 4, 20);
                setLocalHours(h); onHoursChange?.(h);
              }}
            />
            <input
              type="number"
              className="w-16 shrink-0 border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              min={4} max={20} value={perWeek}
              onChange={(e) => {
                const h = clamp(parseInt(e.target.value, 10) || 10, 4, 20);
                setLocalHours(h); onHoursChange?.(h);
              }}
            />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => (
                <button
                  key={p}
                  className={`border px-2 py-1 text-xs dark:border-gray-700 ${p === perWeek ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
                  onClick={() => { setLocalHours(p); onHoursChange?.(p); }}
                >
                  {p}h
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-1 min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
          Plan for <span className="font-medium">{data?.role ?? selectedRole}</span> in {location}. Adjust hours anytime; tasks scale to your weekly time.
        </div>
      </div>

      {/* Loading / error */}
      {data === null && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}
      {err && (
        <div className="mb-3 border border-red-300/50 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {err}
        </div>
      )}

      {/* Phases (flat) */}
      {data?.weeks?.length ? (
        <div className="divide-y dark:divide-gray-800">
          {phases.map((ph) => {
            const open = openPhase === ph.label;
            const items = weeksByPhase[ph.label] || [];
            return (
              <section key={ph.label}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
                  onClick={() => setOpenPhase(open ? null : ph.label)}
                >
                  <span>{ph.label} · Weeks {ph.start}–{ph.end}</span>
                  <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
                </button>

                {open && (
                  <ul className="divide-y px-3 dark:divide-gray-800">
                    {items.map((w) => (
                      <li key={w.week} className="flex items-start gap-3 p-3 text-sm min-w-0">
                        <div className="mt-0.5 h-6 w-6 shrink-0 border text-center text-xs font-semibold leading-6 dark:border-gray-700">
                          {w.week}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-medium break-words">{w.title}</div>
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                            Target {w.targetHours ?? perWeek}h · Focus: {w.focusSkills?.join(", ") || "—"}
                          </div>

                          {/* FULL MODE: flat two-column with scroll caps */}
                          {!compact && (
                            <div className="mt-2 grid gap-3 md:grid-cols-2">
                              <div className="max-h-40 overflow-auto pr-1">
                                <div className="mb-1 text-[11px] uppercase tracking-wide opacity-60">Tasks</div>
                                <ul className="list-disc pl-5 text-xs text-gray-600 dark:text-gray-300 [word-break:break-word]">
                                  {w.tasks?.map((t, i) => (
                                    <li key={i} className="[word-break:break-word]">{t}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="max-h-40 overflow-auto pr-1">
                                <div className="mb-1 text-[11px] uppercase tracking-wide opacity-60">Resources</div>
                                {w.resources?.length ? (
                                  <div className="flex w-full flex-wrap gap-2">
                                    {w.resources.map((r) => (
                                      <a
                                        key={r.id}
                                        href={r.url || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-full items-center gap-1 border px-2 py-1 text-[11px] hover:underline dark:border-gray-700 whitespace-normal break-words"
                                      >
                                        <LinkIcon size={12} />
                                        <span className="min-w-0 break-words">{r.title}</span>
                                        {r.provider ? <span className="opacity-60">· {r.provider}</span> : null}
                                        {r.hours ? <span className="opacity-60">· ~{r.hours}h</span> : null}
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs opacity-60">—</div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* COMPACT MODE: flat chip preview */}
                          {compact && (
                            <div className="mt-1 inline-flex max-w-full items-center gap-1 border px-2 py-1 text-[11px] opacity-70">
                              <Sparkles size={12} />
                              <span className="truncate">{w.tasks?.[0] ?? "Progress milestone"}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
