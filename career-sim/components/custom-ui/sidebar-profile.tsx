// components/custom-ui/sidebar-profile.tsx
'use client'

import { UserProfile } from "@/types/user-profile";
import { Chip } from "./chip";
import { Section } from "./section";
import { Info, Pencil } from "lucide-react";

export function SidebarProfile({ profile, onEdit }: { profile: UserProfile; onEdit?: () => void }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-5">
      <Section
        title="Your profile"
        icon={<Info className="h-5 w-5" />}
        actions={
          onEdit ? (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null
        }
      >
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
    </aside>
  );
}
