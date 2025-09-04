'use client'

import { UserProfile } from "@/types/user-profile";
import { Chip } from "./chip";
import { Section } from "./section";
import { Info, ListChecks } from "lucide-react";

export function SidebarProfile({ profile }: { profile: UserProfile }) {
  const notes = profile.resumeNotes;

  return (
    <aside className="sticky top-5 space-y-4">
      <Section title="Your profile" icon={<Info className="h-5 w-5" />}>
        <div className="space-y-3 text-sm">
          <div className="font-medium">{profile.userName}</div>
          <div><span className="font-medium">Experience:</span> {profile.yearsExp} year(s)</div>
          <div><span className="font-medium">Education:</span> {profile.education || "—"}</div>
          <div>
            <span className="font-medium">Skills:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.skills?.length
                ? profile.skills.map((s, i) => <Chip key={i}>{s}</Chip>)
                : <span className="text-gray-500">—</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* <Section title="Resume notes" icon={<ListChecks className="h-5 w-5" />}>
        {!notes ? (
          <p className="text-xs text-gray-600 dark:text-gray-300">No notes yet.</p>
        ) : (
          <div className="space-y-3 text-xs">
            {notes.summary && (
              <p className="text-gray-700 dark:text-gray-300">{notes.summary}</p>
            )}

            {notes.strengths?.length ? (
              <div>
                <div className="mb-1 font-medium">Strengths</div>
                <ul className="ml-4 list-disc space-y-1">
                  {notes.strengths.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ) : null}

            {notes.gaps?.length ? (
              <div>
                <div className="mb-1 font-medium">Gaps</div>
                <ul className="ml-4 list-disc space-y-1">
                  {notes.gaps.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ) : null}

            {notes.improvements?.length ? (
              <div>
                <div className="mb-1 font-medium">Improvements</div>
                <ul className="ml-4 list-disc space-y-1">
                  {notes.improvements.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ) : null}

            {notes.topAchievements?.length ? (
              <div>
                <div className="mb-1 font-medium">Top achievements</div>
                <ul className="ml-4 list-disc space-y-1">
                  {notes.topAchievements.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ) : null}

            {notes.keywords?.length ? (
              <div>
                <div className="mb-1 font-medium">Keywords</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {notes.keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}
                </div>
              </div>
            ) : null}

            {notes.suggestedTitles?.length ? (
              <div>
                <div className="mb-1 font-medium">Suggested titles</div>
                <ul className="ml-4 list-disc space-y-1">
                  {notes.suggestedTitles.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Section> */}
    </aside>
  );
}
