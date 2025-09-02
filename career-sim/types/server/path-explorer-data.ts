export type ResourceLite = {
  id: string;                // stringified resource_id or placeholder id
  title: string;
  provider?: string;
  url?: string;
  hours?: number | null;
  cost?: number | null;
  skills: string[];          // which gaps it addresses
  kind: "learn" | "project"; // foundational module vs portfolio project
};

export type PathTarget = {
  id: string;
  label: string;
  missingSkills: string[];   // user-visible gaps for this target
};

export type PathBridge = {
  id: string;                // "bridge-foundational" | "bridge-portfolio"
  label: string;
  resources: ResourceLite[]; // learning modules / projects
};

export type PathEdge = { source: string; target: string };

export type PathExplorerData = {
  targets: PathTarget[];
  bridges: PathBridge[];
  edges: PathEdge[];         // unlabeled, kept simple
  meta?: {
    userSkills: string[];
    topGaps: string[];       // union of frequent gaps across targets
  };
};

export type DbUserProfile = {
  user_id: bigint;
  resume: string;
  years_experience: number | null;
  education: string | null;
  updated_at: Date;
};

export type UIUserProfile = {
  userName: string;
  resume: string;
  yearsExp: number;
  education: string;
  skills: string[];
};

export type PathApiProfile = {
  resume: string;
  years_experience: number | null;
  education: string | null;
};