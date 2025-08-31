'use client';

import * as React from 'react';
import { Info, ListChecks, ArrowUpRight, HelpCircle } from 'lucide-react';
import type { EvidenceBuckets, EvidenceItem } from './decision-duel';

type Confidence = 'Strong' | 'Moderate' | 'Preliminary';

function toConfidence(weight?: number): Confidence {
  const w = typeof weight === 'number' ? weight : 0;
  if (w >= 0.7) return 'Strong';
  if (w >= 0.4) return 'Moderate';
  return 'Preliminary';
}

function confidenceClasses(level: Confidence) {
  // subtle chips that work in dark/light
  if (level === 'Strong')
    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200';
  if (level === 'Moderate')
    return 'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200';
  return 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200';
}

function domainFromUrl(url?: string) {
  try {
    if (!url) return '';
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
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
        <button
          className="inline text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
          onClick={toggle}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function Bucket({
  title,
  items,
  defaultLimit = 3,
}: {
  title: string;
  items: EvidenceItem[];
  defaultLimit?: number;
}) {
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
                  {dom && <span className="text-xs opacity-70">• {dom}</span>}
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

export function Evidence({ data }: { data?: EvidenceBuckets }) {
  const hasLive =
    !!data &&
    (data.comparableOutcomes?.length ||
      data.alumniStories?.length ||
      data.marketNotes?.length);

  if (!hasLive) {
    // concise placeholder layout
    const items = [
      { k: 'Salary survey (region, 2024)', v: 'Median comp by level & function' },
      { k: 'Job posts (target roles)', v: 'Common requirements & keywords' },
      { k: 'Alumni stories', v: 'Typical pivot timelines' },
      { k: 'Program outcomes', v: 'Portfolio impact on interviews' },
    ];
    return (
      <div className="rounded-2xl border p-4 dark:border-gray-800">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ListChecks size={16} />
          Receipts (why we think this)
        </div>
        <ul className="space-y-2 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0 opacity-70" />
              <div>
                <div className="font-medium">{it.k}</div>
                <div className="text-xs text-gray-500">
                  {it.v} · With links and cohort sizes in the full product.
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <ListChecks size={16} />
        Receipts (why we think this)
        <span className="ml-1 inline-flex items-center gap-1 text-xs opacity-70">
          <HelpCircle size={14} />
          Confidence = how reliable this source is for your situation.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Bucket title="Comparable outcomes" items={data!.comparableOutcomes} />
        <Bucket title="Alumni stories" items={data!.alumniStories} />
      </div>

      <Bucket title="Market notes" items={data!.marketNotes} />
    </div>
  );
}
