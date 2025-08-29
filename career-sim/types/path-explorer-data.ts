export type PathExplorerData = {
  targets: { id: string; label: string }[];
  bridges: { id: string; label: string }[];
  edges: { source: string; target: string; confidence: number }[]; // 0..1
};