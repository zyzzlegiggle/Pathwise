/* eslint-disable react-hooks/rules-of-hooks */
'use client'

import { useEffect, useState } from 'react';
import { Users, MapPin, Link as LinkIcon } from 'lucide-react';
import type { TablePerson } from '@/app/api/people-like-me/route';
import { UserProfile } from '@/types/user-profile';
import { usePushData } from '../system/session-provider';

export function PeopleLikeMe({
  profile,
  pathTargets,
  userId
}: {
  profile: UserProfile;
  pathTargets?: Array<{ id: string; label: string }>;
  userId: string
}) {
  const [items, setItems] = useState<TablePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);

  useEffect(() => { setVisibleCount(3); }, [items?.length]);

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
          body: JSON.stringify({ profile, targets: pathTargets, userId }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
        const res: any = await resp.json();
        if (active) setItems(Array.isArray(res?.people) ? (res.people as TablePerson[]) : []);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (active) setError(e?.message || 'Failed to load');
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [profile, JSON.stringify(pathTargets ?? []), userId]);

  const push = usePushData();
  useEffect(() => { push("peopleLikeMe", items ?? []); }, [JSON.stringify(items ?? []), push]);

  return (
    <div>
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

      {items && items.length === 0 && !error && (
        <p className="text-xs text-gray-500">No similar people found.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {items && (
        <>
          <div className={`space-y-3 ${ (items?.length ?? 0) > 3 ? 'max-h-[420px] overflow-y-auto pr-1 [scrollbar-gutter:stable]' : '' }`}>
            {items.slice(0, visibleCount).map((p, i) => (
              <div key={i} className="rounded-xl border p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md dark:border-gray-800">
                <div className="mb-1 text-base font-semibold">
                  {p.name?.trim() || "Anonymous"}
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {[p.title, p.workplace].filter(Boolean).join(' @ ') || '—'}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                  {p.location && (
                    <span className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                      <MapPin size={12} /><span>{p.location}</span>
                    </span>
                  )}
                  {typeof p.connections === 'number' && (
                    <span className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                      <Users size={12} /><span>{p.connections} connections</span>
                    </span>
                  )}
                  {typeof p.followers === 'number' && (
                    <span className="inline-flex items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 dark:border-gray-700 dark:bg-gray-950/50">
                      <Users size={12} /><span>{p.followers} followers</span>
                    </span>
                  )}
                </div>

                {p.blurb && (
                  <div className="mt-3 rounded-xl border bg-gray-50/60 p-3 text-xs dark:border-gray-800 dark:bg-gray-900/40">
                    {p.blurb}
                  </div>
                )}

                {Array.isArray(p.topSkills) && p.topSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.topSkills.slice(0, 6).map((s, idx) => (
                      <span key={idx} className="rounded border px-2 py-0.5 text-[11px] dark:border-gray-700">{s}</span>
                    ))}
                  </div>
                )}

                {Array.isArray(p.sources) && p.sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {p.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] text-blue-600 underline underline-offset-2 hover:opacity-80"
                      >
                        <LinkIcon size={12} className="inline mr-1" />
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
                onClick={() => setVisibleCount(c => Math.min(items.length, c + 3))}
              >
                Show more ({items.length - visibleCount} left)
             </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
