'use client'

import { useEffect, useState } from 'react';
import { Users, Clock, CircleDollarSign, Sparkles } from 'lucide-react';
import { Chip } from './chip';
import type { SimilarPerson } from '@/app/api/people-like-me/route';
import { UserProfile } from '@/types/user-profile';

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

  // Reset the visible count whenever the number of results changes
  useEffect(() => {
    setVisibleCount(3);
  }, [items?.length]);

  // Load data (note: effect is NOT async)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        setError(null);
        setItems(null);

        const resp = await fetch('/api/people-like-me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ profile, targets: pathTargets, userId: 1 }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Request failed: ${resp.status}`);
        }

        const res: any = await resp.json();
        if (active) {
          setItems(Array.isArray(res?.people) ? (res.people as SimilarPerson[]) : []);
        }
      } catch (e: any) {
        // Ignore abort errors; surface real ones
        if (e?.name === 'AbortError') return;
        if (active) setError(e?.message || 'Failed to load');
      }
    })();

    // Cleanup on dependency change/unmount
    return () => {
      active = false;
      controller.abort();
    };
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
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Results */}
      {items && (
        <>
          <div
            className={`space-y-3 ${ (items?.length ?? 0) > 3 ? 'max-h-[420px] overflow-y-auto pr-1 [scrollbar-gutter:stable]' : '' }`}
          >
            {items.slice(0, visibleCount).map((p, i) => (
              <div key={i} className="rounded-xl border p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md dark:border-gray-800">

                <div className="mb-1 text-base font-semibold">{p.name}</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {p.from} → {p.to}
                </div>

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
className="block text-[11px] text-blue-600 underline underline-offset-2 hover:opacity-80"                      >
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
