'use client'
import { DbUserProfile, PathApiProfile, PathExplorerData, UIUserProfile } from "@/types/path-explorer-data";
import { UserProfile } from "@prisma/client";
import { useMemo, useState, useEffect } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import { Modal } from "./modal";

const nodeBase =
  "rounded-xl border bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900";

function toPathApiProfile(p: UIUserProfile| DbUserProfile): PathApiProfile {
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

  return { targets, bridges, edges, meta: raw?.meta };
}

export function PathExplorer({ data }: { planMode?: string; data?: PathExplorerData }) {
  const [showAllFoundational, setShowAllFoundational] = useState(false);
  const [showAllPortfolio, setShowAllPortfolio] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!data) {
      setLoading(true);
      // simulate async loading fallback (optional, in case parent doesn’t pass data yet)
      const t = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(t);
    }
  }, [data]);

   

  const allTargets = data?.targets ?? [
    { id: "associate-pm", label: "Associate PM", missingSkills: ["PRD writing", "Backlog grooming"] },
    { id: "business-analyst", label: "Business Analyst", missingSkills: ["SQL", "Dashboards"] },
    { id: "ops-analyst", label: "Ops Analyst", missingSkills: ["Excel", "Process mapping"] },
  ];
  const bridges = data?.bridges ?? [
    { id: "bridge-foundational", label: "Learn foundational skills", resources: [] },
    { id: "bridge-portfolio", label: "Practice your skills", resources: [] },
  ];
  const topGapsAll = data?.meta?.topGaps ?? allTargets.flatMap(t => t.missingSkills);
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

  const edges = useMemo(() => {
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

  const foundational = bridges.find(b => b.id === "bridge-foundational")?.resources ?? [];
  const portfolio = bridges.find(b => b.id === "bridge-portfolio")?.resources ?? [];

  if (loading) {
    return (
      <div className="rounded-xl border p-4 animate-pulse dark:border-gray-800">
        <div className="h-[220px] md:h-[260px] rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="mt-3 h-5 w-40 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="h-20 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-20 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  return (
<div className="rounded-xl border overflow-hidden dark:border-gray-800">      {/* shorter graph */}
      <div className="h-[220px] md:h-[260px] overflow-hidden">
        <ReactFlow nodes={nodes as any} edges={edges as any} fitView>
          <MiniMap zoomable pannable />
          <Controls />
          <Background gap={16} />
        </ReactFlow>
      </div>

      {/* compact summary row */}
      <div className="flex flex-wrap items-center gap-2 border-t p-3 text-xs dark:border-gray-800">
        <span className="font-medium">Your top gaps:</span>
        {topGapsLimited.map((s, i) => (
          <span key={i} className="rounded-full border px-2 py-0.5 transition hover:-translate-y-[0.5px] dark:border-gray-800">{s}</span>
        ))}
        {moreGapsCount > 0 && (
          <span className="rounded-full border px-2 py-0.5 dark:border-gray-800">+{moreGapsCount} more</span>
        )}
      </div>

      {/* two compact resource strips (max 3 each) */}
      <div className="grid gap-4 p-3 md:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Learn foundational skills</h3>
            {foundational.length > 3 && (
<button onClick={() => setShowAllFoundational(true)} className="text-xs underline underline-offset-2 transition hover:opacity-80">View all</button>            )}
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {foundational.slice(0, 3).map(r => (
              <li key={r.id} className="rounded-lg border p-2 text-xs dark:border-gray-800">
                <div className="line-clamp-1 font-medium">
                  {r.url ? <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
                </div>
              </li>
            ))}
            {foundational.length === 0 && <li className="text-xs text-gray-500">No modules yet </li>}
          </ul>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Practice your skills</h3>
            {portfolio.length > 3 && (
              <button onClick={() => setShowAllPortfolio(true)} className="text-xs underline">View all</button>
            )}
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {portfolio.slice(0, 3).map(r => (
              <li key={r.id} className="rounded-lg border p-2 text-xs dark:border-gray-800">
                <div className="line-clamp-1 font-medium">{r.title}</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
                </div>
              </li>
            ))}
            {portfolio.length === 0 && <li className="text-xs text-gray-500">No projects yet</li>}
          </ul>
        </section>
      </div>

      {/* modals for "View all" */}
      <Modal
        open={showAllFoundational}
        onClose={() => setShowAllFoundational(false)}
        title="All foundational modules"
      >
        <ul className="space-y-2">
          {foundational.map(r => (
            <li key={r.id} className="rounded-lg border p-2 text-xs dark:border-gray-800">
              <div className="font-medium">
                {r.url ? <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "self-paced"} · {r.cost ? `≈$${r.cost}` : "free"}
              </div>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={showAllPortfolio}
        onClose={() => setShowAllPortfolio(false)}
        title="All portfolio & practice projects"
      >
        <ul className="space-y-2">
          {portfolio.map(r => (
            <li key={r.id} className="rounded-lg border p-2 text-xs dark:border-gray-800">
              <div className="font-medium">{r.title}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                {r.provider ?? "—"} · {r.hours ? `${r.hours}h` : "weekend project"} · {r.cost ? `≈$${r.cost}` : "free"}
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
