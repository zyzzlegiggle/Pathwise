'use client'
import { UserProfile } from "@/types/user-profile";
import { ArrowRight, Sparkles, RefreshCw } from "lucide-react";
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

export function OnboardingForm({ onComplete }: { onComplete: (p: UserProfile) => void }) {
  const [resume, setResume] = React.useState("");
  const [showExample, setShowExample] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false); 


  // Rotating suggestions (array of strings)
  const suggestions = React.useMemo(
    () => [
      "Paste your resume text or a link to it.",
      "Tell us your years of experience and notable roles.",
      "List your top skills (comma-separated works!).",
      "Include your education: degree, school, and graduation year.",
      "Add achievements with metrics (e.g., “cut costs by 15%”).",
    ],
    []
  );

  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % suggestions.length);
    }, 3500); // rotate every 3.5s
    return () => clearInterval(id);
  }, [suggestions.length]);


  return (
<div className="mx-auto max-w-2xl rounded-3xl border bg-white/90 p-6 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 motion-safe:animate-fadeIn">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        We’ll use this to provide you with the best experiences.
      </p>

      {/* Rotating suggestion pill */}
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


      {/* Single textarea */}
      <textarea
        className="mb-5 w-full rounded-lg border bg-white p-3 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-gray-700"
        rows={8}
        placeholder="Paste your resume, experience, education, and skills here…"
        value={resume}
        onChange={(e) => setResume(e.target.value)}
      />


      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Need inspiration?
        </span>
        <button
          type="button"
          onClick={() => setShowExample(true)}
          className="text-sm text-blue-600 transition-all duration-200 hover:scale-105 hover:text-blue-700 
                    dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
        >
          See Example
        </button>
      </div>

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
          try {
            setIsSubmitting(true);
            const parsed = await extractProfileFromText(resume);
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
          } catch (e) {
            // noop – could toast if you have one
            console.error(e);
          } finally {
            setIsSubmitting(false);
          }
        }}
        disabled={isSubmitting || !resume.trim()}
        className={`inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white transition-all duration-200 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300'} dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-gray-700`}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Submitting&hellip;
          </>
        ) : (
          <>
            Continue 
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}