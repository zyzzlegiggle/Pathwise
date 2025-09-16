'use client'
import { UserProfile } from "@/types/user-profile";
import { ArrowRight, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";

export async function extractProfileFromText(text: string): Promise<UserProfile> {
  const res = await fetch("/api/extract-profile", {      // ← keep this path consistent
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),                      // ← no userId
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed");

  return {
    userName: data.userName,
    resume: text,
    yearsExp: data.yearsExperience,
    skills: data.skills,
    education: data.education,
    resumeNotes: data.resumeNotes ?? undefined,
  };
}

function validateClient(text: string): string | null {
  const clean = text.replace(/\0/g, " ").replace(/<[^>]*>/g, " ").trim();
  if (clean.length < 200) return "Please provide at least 200 characters describing your background.";
  if (clean.length > 20_000) return "That’s too long (over 20,000 characters). Please trim it down.";
  const looksLikeUrlOnly = /^(https?:\/\/|www\.)\S+$/i.test(clean);
  if (looksLikeUrlOnly) return "Please paste the *text* of your background, not only a link.";
  const letterCount = (clean.match(/[A-Za-z]/g) || []).length;
  const wordCount = (clean.match(/\b\w+\b/g) || []).length;
  if (letterCount < 50 || wordCount < 30) return "Add more detail about roles, skills, and education.";
  return null;
}

export function OnboardingForm({ onComplete }: { onComplete: (p: UserProfile) => void }) {
   const [resume, setResume] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [showExample, setShowExample] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const suggestions = React.useMemo(
    () => [
      "Type your background or resume",
      "Tell us your years of experience and notable roles.",
      "List your top skills.",
      "Include your education: degree, school, and graduation year.",
      "Add achievements",
    ],
    []
  );
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % suggestions.length), 3500);
    return () => clearInterval(id);
  }, [suggestions.length]);

  // live validation
  React.useEffect(() => {
    if (!resume.trim()) { setError(null); return; }
    setError(validateClient(resume));
  }, [resume]);

  const canSubmit = !!resume.trim() && !error && !isSubmitting;


return (
    <div className="mx-auto max-w-2xl rounded-3xl border bg-white/90 p-6 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 motion-safe:animate-fadeIn">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        We’ll use this to provide you with the best experiences.
      </p>

      <button
        type="button"
        className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700 transition-all duration-200 hover:scale-105 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:ring-gray-700 cursor-pointer"
        aria-label="Insert suggestion"
        title="Click to insert this suggestion"
      >
        <Sparkles size={14} />
        <span key={idx} className="line-clamp-1 motion-safe:animate-fadeInUp">
          {suggestions[idx]}
        </span>
      </button>

      <textarea
        className={`mb-2 w-full rounded-lg border bg-white p-3 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-gray-700 ${error ? 'border-red-500 focus-visible:ring-red-300 dark:focus-visible:ring-red-700' : ''}`}
        rows={8}
        placeholder="Paste your resume/background here (roles, skills, education, achievements)…"
        value={resume}
        onChange={(e) => setResume(e.target.value)}
      />

      {/* helper row */}
      <div className="mb-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{resume.trim().length.toLocaleString()} characters</span>
        {error ? (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        ) : (
          <span>Tip: include years of experience, key skills, and education.</span>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">Need inspiration?</span>
        <button
          type="button"
          onClick={() => setShowExample(true)}
          className="text-sm text-blue-600 transition-all duration-200 hover:scale-105 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
        >
          See Example
        </button>
      </div>

      {/* existing example + submitting overlays unchanged */}
      {showExample && createPortal(
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm motion-safe:animate-fadeIn"
    onClick={() => setShowExample(false)}
    role="dialog"
    aria-modal="true"
  >
    <div
      className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg motion-safe:animate-scaleUp dark:bg-gray-900"
      onClick={(e) => e.stopPropagation()}
    >
       <h3 className="mb-3 text-lg font-semibold">Example Background</h3>
            <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
              I’m Jane Smith, and I recently graduated from the University of Michigan
              with a degree in Business Administration. Over the past 4 years, I’ve worked
              in customer service and project coordination, where I developed strong
              communication and organizational skills. I enjoy working with teams, solving
              problems creatively, and helping projects run smoothly from start to finish.
              Some of my strengths include leadership, adaptability, and attention to detail.
            </p>
            <button
              onClick={() => setShowExample(false)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition-all duration-200 
                        hover:scale-105 hover:bg-gray-800
                        dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 cursor-pointer"
            >
              Close
            </button>
    </div>
  </div>,
  document.body
)}

      {isSubmitting && createPortal(
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" aria-live="polite">
    <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm shadow-lg dark:bg-gray-900">
      <RefreshCw className="h-4 w-4 animate-spin" />
      <span>Analyzing&hellip;</span>
    </div>
  </div>,
  document.body
)}

      <button
        onClick={async () => {
          if (!canSubmit) return;
          try {
            setIsSubmitting(true);
            const parsed = await extractProfileFromText(resume);
            // Try to hydrate from /api/profile if available
            try {
              const res = await fetch("/api/profile", { cache: "no-store" });
              if (res.ok) {
                const data = await res.json();
                onComplete({
                  userName: data.userName ?? parsed.userName,
                  resume: data.resume ?? parsed.resume,
                  yearsExp: data.yearsExperience ?? parsed.yearsExp,
                  skills: Array.isArray(data.skills) ? data.skills : parsed.skills,
                  education: data.education ?? parsed.education,
                });
                return;
              }
            } catch {}
            onComplete(parsed);
          } catch (e: any) {
            setError(e?.message || "Something went wrong. Please try again.");
          } finally {
            setIsSubmitting(false);
          }
        }}
        disabled={!canSubmit}
        className={`inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white transition-all duration-200 ${!canSubmit ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300'} dark:bg白 dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-gray-700`}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (<><RefreshCw className="h-4 w-4 animate-spin" /> Submitting&hellip;</>) : (<>Continue <ArrowRight size={16} /></>)}
      </button>
    </div>
  );
}