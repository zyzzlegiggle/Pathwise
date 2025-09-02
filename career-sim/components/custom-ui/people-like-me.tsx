
'use client'

import { useEffect, useState } from 'react';
import { Users, Clock, CircleDollarSign, Sparkles } from 'lucide-react';
import { Chip } from './chip';
import type { SimilarPerson } from '@/app/api/people-like-me/route';
import { UserProfile } from '@/types/server/user-profile';


export function PeopleLikeMe({
  profile,
  pathTargets,
}: {
  profile: UserProfile;
  pathTargets?: Array<{ id: string; label: string }>;
}) {
  const [items, setItems] = useState<SimilarPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
   const [visibleCount, setVisibleCount] = useState(3);

  useEffect(() => {
    setVisibleCount(3); // reset when new data arrives
  }, [items?.length]);

  async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

    async function fetchJsonWithRetry(
      input: RequestInfo,
      init?: RequestInit,
      { retries = 3, baseDelay = 600 }: { retries?: number; baseDelay?: number } = {}
    ) {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(input, init);
        if (res.ok) return res.json();

        // Retry on rate limit / transient errors
        if (attempt < retries && (res.status === 429 || (res.status >= 500 && res.status < 600))) {
          const jitter = Math.floor(Math.random() * 200);
          const delay = baseDelay * Math.pow(2, attempt) + jitter; // 600ms, ~1200ms, ~2400ms...
          await sleep(delay);
          continue;
        }
        throw new Error(`Request failed (${res.status})`);
      }
    }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        setItems(null);

        // Stagger start so other API calls fire first
        await sleep(1200 + Math.floor(Math.random() * 600)); // 1.2–1.8s

        const data = await fetchJsonWithRetry('/api/people-like-me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ profile, targets: pathTargets }),
        });

        if (active) setItems(Array.isArray(data?.people) ? data.people : []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load');
      }
    })();
    return () => { active = false; };
  }, [profile, JSON.stringify(pathTargets ?? [])]);


  return (
      <div>

      {/* Loading state */}
      {!items && !error && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border p-4 shadow-sm dark:border-gray-800">
              <div className="mb-2 h-4 w-24 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-3 h-8 rounded-xl border bg-gray-200/60 dark:border-gray-800 dark:bg-gray-900/40" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Results */}
      {items && (
        <>
          <div
            className={`space-y-3 ${
              (items?.length ?? 0) > 3 ? "max-h-[420px] overflow-y-auto pr-1 [scrollbar-gutter:stable]" : ""
            }`}
          >
            {items.slice(0, visibleCount).map((p, i) => (
               <div key={i} className="animate-pulse rounded-xl border p-4 shadow-sm dark:border-gray-800">                <div className="mb-1 text-base font-semibold">{p.name}</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{p.from} → {p.to}</div>

                {/* NEW: compact stat container */}
                <div className="mt-3 rounded-xl border bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                      <Clock size={14} className="opacity-80" />
                      <span className="font-medium">Time:</span>
                      <span>{p.time}</span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                      <CircleDollarSign size={14} className="opacity-80" />
                      <span className="font-medium">Pay:</span>
                      <span>{p.pay}</span>
                    </div>
                    {p.note && (
                      <div className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                        <Sparkles size={14} className="opacity-80" />
                        <span className="font-medium">Tactic:</span>
                        <span>{p.note}</span>
                      </div>
                    )}
                  </div>
                </div>

                {Array.isArray(p.sources) && p.sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {p.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] text-blue-600 underline"
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {items.length > visibleCount && (
            <div className="mt-2">
              <button
                className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                onClick={() => setVisibleCount((c) => Math.min(items.length, c + 3))}
              >
                Show more ({items.length - visibleCount} left)
              </button>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-500">
            Examples are anonymized and simplified. In the real app, each card links to sources and proof.
          </p>
        </>
      )}

    </div>
  );
}


