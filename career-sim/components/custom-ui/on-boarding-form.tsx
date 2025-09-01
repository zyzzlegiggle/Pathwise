'use client'
import { UserProfile } from "@/types/server/user-profile";
import { ArrowRight, Sparkles } from "lucide-react";
import React from "react";

export async function extractProfileFromText(text: string): Promise<UserProfile> {
  try{
  const userId = '1';

  const res = await fetch("/api/extract-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, userId }),
  });


  const data: any = await res.json();

  // ingest user profile
  const ingestRes = await fetch("/api/ingest/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId: userId,
      userName: data.userName,
      resumeText: text,
      yearsExperience: data.yearsExperience,
      education: data.education

     }),
  });



  const userProfile: UserProfile = {
    userName: data.userName,
    resume: text,
    yearsExp: data.yearsExperience,
    skills: data.skills,
    education: data.education 
  }
  
  return userProfile;
  } catch (e: any) {
    throw new Error(e.message)
  }
}

export function OnboardingForm({ onComplete }: { onComplete: (p: UserProfile) => void }) {
  const [resume, setResume] = React.useState("");
  const [showExample, setShowExample] = React.useState(false);

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
    <div className="mx-auto max-w-2xl rounded-3xl border bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-1 text-xl font-semibold">Tell us about your background</h2>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        We’ll use this to provide you with the best experiences.
      </p>

      {/* Rotating suggestion pill */}
      <button
        type="button"
        className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700 
                  transition-all duration-200 hover:scale-105 hover:bg-gray-100 
                  dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer"
        aria-label="Insert suggestion"
        title="Click to insert this suggestion"
      >
        <Sparkles size={14} />
        <span
          key={idx} // important for triggering transition
          className="line-clamp-1 transition-all duration-500 ease-in-out opacity-0  animate-fadeInUp"
        >
          {suggestions[idx]}
        </span>
      </button>

      {/* Single textarea */}
      <textarea
        className="mb-5 w-full rounded-lg border bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900"
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

      {showExample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 
                        backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900 
                          animate-scaleUp">
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
        </div>
      )}



      <button
        onClick={async () => {
          const parsed = await extractProfileFromText(resume);
          onComplete(parsed);
        }}
        className="inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white 
                  transition-all duration-200 hover:scale-105 hover:bg-gray-800
                  dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 cursor-pointer"
      >
        Continue to dashboard
        <ArrowRight size={16} />
      </button>
    </div>
  );
}