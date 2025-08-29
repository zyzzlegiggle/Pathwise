'use client'
import { PathExplorerData } from "@/types/path-explorer-data";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";

// --- Path Explorer Graph (React Flow) ---
const nodeBase = "rounded-xl border bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900";


export function PathExplorer({ planMode, data }: { planMode: string; data?: PathExplorerData }) {
  const nodes = useMemo(() => {
    const targets = data?.targets ?? [
      { id: "target1", label: "Target role A" },
      { id: "target2", label: "Target role B" },
      { id: "target3", label: "Target role C" },
    ];
    const bridges = data?.bridges ?? [
      { id: "bridge1", label: "Bridge: foundational skills" },
      { id: "bridge2", label: "Bridge: portfolio & practice" },
    ];
    return [
      { id: "you", position: { x: 0, y: 120 }, data: { label: "You now" }, type: "input", style: { width: 150 }, className: nodeBase },
      { id: bridges[0].id, position: { x: 240, y: 40 }, data: { label: bridges[0].label }, className: nodeBase },
      { id: bridges[1].id, position: { x: 240, y: 200 }, data: { label: bridges[1].label }, className: nodeBase },
      { id: targets[0].id, position: { x: 500, y: 0 }, data: { label: targets[0].label }, className: nodeBase },
      { id: targets[1].id, position: { x: 520, y: 150 }, data: { label: targets[1].label }, className: nodeBase },
      { id: targets[2].id, position: { x: 520, y: 300 }, data: { label: targets[2].label }, className: nodeBase },
    ];
  }, [data]);

  const edges = useMemo(() => {
    const strength = planMode === "Aggressive" ? 0.85 : planMode === "Safe" ? 0.55 : 0.7;
    const base = data?.edges ?? [
      { source: "you", target: "bridge1", confidence: 0.65 },
            { source: "you", target: "bridge1", confidence: 0.65 },
      { source: "you", target: "bridge2", confidence: 0.5 },
      { source: "bridge1", target: "target1", confidence: 0.6 },
      { source: "bridge2", target: "target2", confidence: 0.55 },
      { source: "bridge2", target: "target3", confidence: 0.45 },
    ];

        return base.map((e, i) => ({
      id: `e${i  }`,
      source: e.source,
      target: e.target,
      label: `${Math.round(strength * e.confidence * 100)}%`,
      markerEnd: { type: "arrowclosed" as const },
    }));
  }, [planMode, data]);

  return (
    <div className="h-[280px] overflow-hidden rounded-xl border dark:border-gray-800">
      <ReactFlow nodes={nodes as any} edges={edges as any} fitView>
        <MiniMap zoomable pannable />
        <Controls />
        <Background gap={16} />
      </ReactFlow>
      <div className="p-3 text-xs text-gray-500 dark:text-gray-400">
        Confidence on arrows shows how likely each step is, given your plan mode and study time. Examples on hover (mock).
      </div>
    </div>
  );
}
