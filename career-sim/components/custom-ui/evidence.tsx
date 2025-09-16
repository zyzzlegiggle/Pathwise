/* eslint-disable react-hooks/rules-of-hooks */
// components/custom-ui/evidence.tsx
'use client';

import * as React from 'react';
import { Info, ArrowUpRight } from 'lucide-react';

export type Confidence = 'Strong' | 'Moderate' | 'Preliminary';
export type EvidenceItem = { text: string; weight: number; source?: string; url?: string };
export type EvidenceBuckets = {
  comparableOutcomes: EvidenceItem[];
  alumniStories: EvidenceItem[];
  marketNotes: EvidenceItem[];
};

function toConfidence(weight?: number): Confidence {
  const w = typeof weight === 'number' ? weight : 0;
  if (w >= 0.7) return 'Strong';
  if (w >= 0.4) return 'Moderate';
  return 'Preliminary';
}
function confidenceClasses(level: Confidence) {
  if (level === 'Strong')   return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200';
  if (level === 'Moderate') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200';
  return 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200';
}
function domainFromUrl(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}
function sortByConfidence(items: EvidenceItem[]) {
  return [...items].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}
function useClamp(initial = true) {
  const [expanded, setExpanded] = React.useState(!initial);
  return { expanded, toggle: () => setExpanded((s) => !s) };
}
function TextClamp({ text, clampChars = 220 }: { text: string; clampChars?: number }) {
  const { expanded, toggle } = useClamp(true);
  const isLong = text.length > clampChars;
  const shown = expanded || !isLong ? text : text.slice(0, clampChars).trimEnd() + '…';
  return (
    <div className="leading-snug">
      {shown}{' '}
      {isLong && (
        <button className="inline text-xs underline underline-offset-2 opacity-70 hover:opacity-100" onClick={toggle}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function Bucket({ title, items, defaultLimit = 3 }: { title: string; items: EvidenceItem[]; defaultLimit?: number; }) {
  const sorted = sortByConfidence(items);
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? sorted : sorted.slice(0, defaultLimit);
  if (!items?.length) return null;

  return (
    <div className="rounded-xl border p-3 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold">
        <div>{title}</div>
        {sorted.length > defaultLimit && (
          <button
            className="rounded-full border px-2 py-1 text-[11px] opacity-80 hover:opacity-100 dark:border-gray-700"
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? 'Show less' : `Show all ${sorted.length}`}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {visible.map((it, i) => {
          const conf = toConfidence(it.weight);
          const dom = domainFromUrl(it.url);
          return (
            <li key={i} className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0 opacity-70" />
              <div className="text-sm w-full">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${confidenceClasses(conf)}`}>
                    {conf} confidence
                  </span>
                  {it.source && <span className="text-xs opacity-70">• {it.source}</span>}
                  {dom && !it.source && <span className="text-xs opacity-70">• {dom}</span>}
                  {it.url && (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                    >
                      Open <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
                <TextClamp text={it.text} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Evidence({
  location,
  roleA,
  roleB,
  approachA,
  approachB,
  limitPerBucket = 5,
}: {
  location: string;
  roleA?: string;
  roleB?: string;
  approachA?: string;
  approachB?: string;
  limitPerBucket?: number;
}) {
  const [data, setData] = React.useState<EvidenceBuckets | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ location, roleA, roleB, approachA, approachB, limitPerBucket }),
        });
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        if (alive) setData({ comparableOutcomes: [], alumniStories: [], marketNotes: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [location, roleA, roleB, approachA, approachB, limitPerBucket]);

  // existing skeletons
  const hasLive = !!data && (data.comparableOutcomes?.length || data.alumniStories?.length || data.marketNotes?.length);
  if (loading && !hasLive) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => (
          <div key={i} className="rounded-xl border p-3 dark:border-gray-800 animate-pulse">
            <div className="mb-2 h-3 w-40 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="space-y-2">
              <div className="h-4 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!hasLive) {
    return <div className="text-xs text-gray-500">No external evidence found right now.</div>;
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 [scrollbar-gutter:stable] motion-safe:scroll-smooth">
      <div className="grid grid-cols-1 gap-3">
        <Bucket title="Comparable outcomes" items={data!.comparableOutcomes} />
        <Bucket title="Alumni stories" items={data!.alumniStories} />
        <Bucket title="Market notes" items={data!.marketNotes} />
      </div>
    </div>
  );
}
