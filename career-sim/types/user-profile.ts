export type UserProfile = {
  userName: string,
  resume: string,
  yearsExp: number;
  education: string;
  skills: string[];
  resumeNotes?: ResumeNotes;
};
export type ResumeNotes = {
  summary: string;             // 1–3 sentence overview (<= 300 chars)
  strengths: string[];         // 3–7 bullets
  gaps: string[];              // 0–5 bullets (missing skills/experience)
  improvements: string[];      // 3–7 concrete resume edits
  topAchievements: string[];   // 3–5 quantifiable wins
  keywords: string[];          // 6–12 ATS-friendly keywords
  suggestedTitles: string[];   // 3–6 target role titles
};