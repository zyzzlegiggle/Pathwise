'use client'
import { DbUserProfile, PathApiProfile, PathExplorerData, UIUserProfile } from "@/types/path-explorer-data";
import { UserProfile } from "@prisma/client";
import { useMemo, useState, useEffect } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import { Modal } from "./modal";
import { usePushData } from "../system/session-provider";

const nodeBase =
  "rounded-xl border bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900";

function toPathApiProfile(p: UIUserProfile | DbUserProfile): PathApiProfile {
  if ("years_experience" in p) {
    // DB row → API
    return {
      resume: p.resume,
      years_experience: p.years_experience ?? null,
      education: p.education ?? null,
    };
  }
  // UI model → API
  return {
    resume: p.resume,
    years_experience: p.yearsExp ?? null,
    education: p.education ?? null,
  };
}

// --- Small skeleton helpers -------------------------------------------------
function SectionSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-2 animate-pulse">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-lg border p-2 text-xs dark:border-gray-800">
          <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
        </li>
      ))}
    </ul>
  );
}

function ChipSkeletonRow() {
  return (
    <div className="flex gap-2 animate-pulse">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  );
}

function DiagramSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50/60 dark:bg-gray-900/40">
      <div
        className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-transparent animate-spin"
        aria-label="Loading diagram"
      />
      <span className="text-xs text-gray-600 dark:text-gray-400">Building your path…</span>
    </div>
  );
}

export async function fetchPathExplorerData(
  profile: UIUserProfile | DbUserProfile
): Promise<PathExplorerData> {
  try {
    const payload = { profile: toPathApiProfile(profile) };

    const res = await fetch("/api/path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(await res.text());
    const raw = await res.json();
    return normalizePathData(raw);
  } catch (err) {
    console.error("Path API failed:", err);
    return {
      targets: [
        { id: "associate-pm", label: "Associate PM", missingSkills: ["PRD writing", "Backlog grooming"] },
        { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
        { id: "ops-analyst", label: "Ops Analyst", missingSkills: ["Excel", "Process mapping"] },
      ],
      bridges: [
        { id: "bridge-foundational", label: "Learn foundational skills", resources: [] },
        { id: "bridge-portfolio", label: "Practice your skills", resources: [] },
      ],
      edges: [
        { source: "you", target: "bridge-foundational" },
        { source: "bridge-foundational", target: "bridge-portfolio" },
        { source: "bridge-portfolio", target: "associate-pm" },
        { source: "bridge-portfolio", target: "business-analyst" },
        { source: "bridge-portfolio", target: "ops-analyst" },
      ],
    };
  }
}

function normalizePathData(raw: any): PathExplorerData {
  const targets = (raw?.targets ?? []).map((t: any, i: number) => ({
    id: String(t.id ?? `target-${i}`),
    label: String(t.label ?? "Target"),
    missingSkills: Array.isArray(t.missingSkills) ? t.missingSkills : [],
  }));

  const bridges = (raw?.bridges ?? []).map((b: any, i: number) => ({
    id: String(b.id ?? `bridge-${i}`),
    label: String(b.label ?? "Bridge"),
    resources: Array.isArray(b.resources) ? b.resources : [],
  }));

  const edges = (raw?.edges ?? []).map((e: any) => ({
    source: String(e.source),
    target: String(e.target),
  }));

  // pass through top-level resources if the API returns them
  const courses = Array.isArray(raw?.courses) ? raw.courses : undefined;
  const projects = Array.isArray(raw?.projects) ? raw.projects : undefined;

  return { targets, bridges, edges, courses, projects, meta: raw?.meta };
}

export function PathExplorer({ data }: { planMode?: string; data?: PathExplorerData }) {
  const [showAllFoundational, setShowAllFoundational] = useState(false);
  const [showAllPortfolio, setShowAllPortfolio] = useState(false);
  const push = usePushData();

  // Treat missing data as the loading state. Parent controls when data arrives.
  const isLoading = !data;

  // push pathData whenever it changes
  useEffect(() => {
    if (!data) return;

    const run = async () => {
      const payload = {
        targets: data.targets,
        bridges: data.bridges,
        edges: data.edges,
        courses: data.courses,
        projects: data.projects,
      };
      try {
        await push("pathData", payload);
      } catch (e) {
        console.error("Failed to push pathData", e);
      }
    };

    run();
  }, [data, push]);

  // Use sensible fallbacks for layout sizing, but avoid showing fake content while loading.
  const targetFallback = [
    { id: "associate-pm", label: "Associate PM", missingSkills: ["PRD writing", "Backlog grooming"] },
    { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
    { id: "ops-analyst", label: "Ops Analyst", missingSkills: ["Excel", "Process mapping"] },
  ];

  const allTargets = data?.targets ?? targetFallback;
  const bridges = data?.bridges ?? [
    { id: "bridge-foundational", label: "Learn foundational skills", resources: [] },
    { id: "bridge-portfolio", label: "Practice your skills", resources: [] },
  ];

  const topGapsAll = data?.meta?.topGaps ?? [];
  const topGapsLimited = topGapsAll.slice(0, 5);
  const moreGapsCount = Math.max(topGapsAll.length - topGapsLimited.length, 0);

  const nodes = useMemo(() => {
    return [
      { id: "you", position: { x: 0, y: 120 }, data: { label: "You now" }, type: "input", style: { width: 150 }, className: nodeBase },
      { id: "bridge-foundational", position: { x: 220, y: 40 }, data: { label: "Learn foundational skills" }, className: nodeBase },
      { id: "bridge-portfolio", position: { x: 220, y: 200 }, data: { label: "Practice your skills" }, className: nodeBase },
      { id: allTargets[0].id, position: { x: 480, y: 0 }, data: { label: allTargets[0].label }, className: nodeBase },
      { id: allTargets[1].id, position: { x: 500, y: 140 }, data: { label: allTargets[1].label }, className: nodeBase },
      { id: allTargets[2].id, position: { x: 500, y: 280 }, data: { label: allTargets[2].label }, className: nodeBase },
    ];
  }, [allTargets]);

  const flowEdges = useMemo(() => {
    const base = data?.edges ?? [
      { source: "you", target: "bridge-foundational" },
      { source: "bridge-foundational", target: "bridge-portfolio" },
      { source: "bridge-portfolio", target: allTargets[0].id },
      { source: "bridge-portfolio", target: allTargets[1].id },
      { source: "bridge-portfolio", target: allTargets[2].id },
    ];
    return base.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      markerEnd: { type: "arrowclosed" as const },
    }));
  }, [data, allTargets]);

  const foundational = bridges.find((b) => b.id === "bridge-foundational")?.resources ?? [];
  const portfolio = bridges.find((b) => b.id === "bridge-portfolio")?.resources ?? [];

  return (
    <div className="rounded-xl border overflow-hidden dark:border-gray-800">
      {/* Diagram */}
      <div className="relative h-[220px] md:h-[260px] overflow-hidden">
        {isLoading ? (
          <DiagramSkeleton />
        ) : (
          <ReactFlow nodes={nodes as any} edges={flowEdges as any} fitView>
            <MiniMap zoomable pannable />
            <Controls />
            <Background gap={16} />
          </ReactFlow>
        )}
      </div>

      {/* Compact summary row */}
      <div className="flex flex-wrap items-center gap-2 border-t p-3 text-xs dark:border-gray-800">
        <span className="font-medium">Your top gaps:</span>
        {isLoading ? (
          <ChipSkeletonRow />
        ) : (
          <>
            {topGapsLimited.map((s, i) => (
              <span
                key={i}
                className="rounded-full border px-2 py-0.5 transition hover:-translate-y-[0.5px] dark:border-gray-800"
              >
                {s}
              </span>
            ))}
            {moreGapsCount > 0 && (
              <span className="rounded-full border px-2 py-0.5 dark:border-gray-800">+{moreGapsCount} more</span>
            )}
          </>
        )}
      </div>

      {/* Two compact resource strips (max 3 each) */}
      <div className="grid gap-4 p-3 md:grid-cols-2">
        {/* Learn foundational skills (courses) */}
        <section className="space-y-2" aria-busy={isLoading}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Learn foundational skills</h3>
            {isLoading && (
              <span className="text-[11px] text-gray-500 animate-pulse">loading…</span>
            )}
            {!isLoading && foundational.length > 3 && (
              <button
                onClick={() => setShowAllFoundational(true)}
                className="text-xs underline underline-offset-2 transition hover:opacity-80"
              >
                View all
              </button>
            )}
          </div>

          {isLoading ? (
            <SectionSkeleton />
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {foundational.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border text-xs dark:border-gray-800 transition hover:bg-gray-50 hover:-translate-y-[1px] dark:hover:bg-gray-800"
                >
                  {r.url ? (
                    <a
                      className="block p-2 cursor-pointer"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <div className="line-clamp-1 font-medium underline underline-offset-2">{r.title}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
                      </div>
                    </a>
                  ) : (
                    <div className="p-2">
                      <div className="line-clamp-1 font-medium">{r.title}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {!isLoading && foundational.length === 0 && (
                <li className="text-xs text-gray-500">No modules yet</li>
              )}
            </ul>
          )}
        </section>

        {/* Practice your skills (projects) */}
        <section className="space-y-2" aria-busy={isLoading}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Practice your skills</h3>
            {isLoading && <span className="text-[11px] text-gray-500 animate-pulse">loading…</span>}
            {!isLoading && portfolio.length > 3 && (
              <button onClick={() => setShowAllPortfolio(true)} className="text-xs underline underline-offset-2 transition hover:opacity-80">
                View all
              </button>
            )}
          </div>

          {isLoading ? (
            <SectionSkeleton />
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {portfolio.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border text-xs dark:border-gray-800 transition hover:bg-gray-50 hover:-translate-y-[1px] dark:hover:bg-gray-800"
                >
                  {r.url ? (
                    <a
                      className="block p-2 cursor-pointer"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${r.title}`}
                    >
                      <div className="line-clamp-1 font-medium underline underline-offset-2">{r.title}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
                      </div>
                    </a>
                  ) : (
                    <div className="p-2">
                      <div className="line-clamp-1 font-medium">{r.title}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {!isLoading && portfolio.length === 0 && (
                <li className="text-xs text-gray-500">No projects yet</li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Modals for "View all" */}
      <Modal open={showAllFoundational} onClose={() => setShowAllFoundational(false)} title="All foundational courses">
        <ul className="space-y-2">
          {(foundational ?? []).map((r) => (
            <li
              key={r.id}
              className="rounded-lg border text-xs dark:border-gray-800 transition hover:bg-gray-50 hover:-translate-y-[1px] dark:hover:bg-gray-800"
            >
              {r.url ? (
                <a className="block p-2 cursor-pointer" href={r.url} target="_blank" rel="noreferrer noopener">
                  <div className="font-medium underline underline-offset-2">{r.title}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
                  </div>
                </a>
              ) : (
                <div className="p-2">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={showAllPortfolio} onClose={() => setShowAllPortfolio(false)} title="All portfolio & practice projects">
        <ul className="space-y-2">
          {(portfolio ?? []).map((r) => (
            <li
              key={r.id}
              className="rounded-lg border text-xs dark:border-gray-800 transition hover:bg-gray-50 hover:-translate-y-[1px] dark:hover:bg-gray-800"
            >
              {r.url ? (
                <a className="block p-2 cursor-pointer" href={r.url} target="_blank" rel="noreferrer noopener">
                  <div className="font-medium underline underline-offset-2">{r.title}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
                  </div>
                </a>
              ) : (
                <div className="p-2">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
