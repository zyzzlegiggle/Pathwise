/* eslint-disable react-hooks/rules-of-hooks */
// components/custom-ui/profile-editor.tsx
'use client';

import React from "react";
import { X, Save } from "lucide-react";
import { UserProfile } from "@/types/user-profile";

type Props = {
  open: boolean;
  initial: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
  userId?: string | number | bigint; // defaults to "1"
};

export function ProfileEditor({ open, initial, onClose, onSaved, userId = "1" }: Props) {
  const [userName, setUserName] = React.useState(initial.userName || "");
  const [yearsExperience, setYearsExperience] = React.useState<number>(initial.yearsExp ?? 0);
  const [education, setEducation] = React.useState(initial.education || "");
  const [skillsInput, setSkillsInput] = React.useState((initial.skills ?? []).join(", "));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setUserName(initial.userName || "");
    setYearsExperience(initial.yearsExp ?? 0);
    setEducation(initial.education || "");
    setSkillsInput((initial.skills ?? []).join(", "));
    setErr(null);
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit profile</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {err && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            {err}
          </div>
        )}

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block font-medium">Name</span>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full rounded-lg border bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
              placeholder="Your name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium">Years of experience</span>
            <input
              type="number"
              min={0}
              max={50}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(Number(e.target.value))}
              className="w-full rounded-lg border bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
              placeholder="0"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium">Education</span>
            <input
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="w-full rounded-lg border bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
              placeholder="e.g., BSc Computer Science, NUS (2022)"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium">Skills</span>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              className="w-full rounded-lg border bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
              placeholder="Type skills, separated by commas"
            />
            <p className="mt-1 text-xs text-gray-500">
              Example: Attention to detail, communication, sales
            </p>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                setErr(null);

                const skills = skillsInput
                  .split(",")
                  .map(s => s.trim())
                  .filter(Boolean);

                const res = await fetch("/api/profile", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId,
                    userName,
                    yearsExperience,
                    education,
                    skills,
                  }),
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "Failed to save profile");

                // lift updated profile up in your app's shape (UserProfile)
                onSaved({
                  userName,
                  yearsExp: yearsExperience,
                  education,
                  skills,
                  resume: initial.resume, // keep existing
                  resumeNotes: initial.resumeNotes,
                });
                onClose();
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setSaving(false);
              }
            }}
            className={`inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white transition-all duration-200 ${saving ? "opacity-70 cursor-not-allowed" : "hover:scale-105 hover:bg-gray-800"} dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100`}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
