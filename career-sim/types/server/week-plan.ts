import { ResourceLite } from "./path-explorer-data";

export type WeekItem = {
  week: number;
  title: string;            // e.g. "Resume & profile revamp"
  focusSkills: string[];    // skills to emphasize this week
  tasks: string[];          // 2–6 bullet tasks
  targetHours: number;      // suggested hours this week
  resources?: ResourceLite[]; // zero or more suggested learning/project items
};

export type WeekPlanResponse = {
    role: string;
  weeks: WeekItem[];
  echo?: Record<string, unknown>;
};