

'use client'
export type EvidenceItem = { text: string; weight: number; source?: string; url?: string };
export type EvidenceBuckets = {
  comparableOutcomes: EvidenceItem[];
  alumniStories: EvidenceItem[];
  marketNotes: EvidenceItem[];
};