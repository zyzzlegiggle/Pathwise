'use client'
import React, { useEffect, useMemo, useState } from "react";import {
  ArrowRight,
  BarChart3,
  Calendar,
  CircleDollarSign,
  Clock,
  GitBranch,
  Layers,
  ListChecks,
  Map,
  RefreshCw,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import "reactflow/dist/style.css";
import { Chip } from "@/components/custom-ui/chip";
import { Section } from "@/components/custom-ui/section";
import { UserProfile } from "../types/user-profile";
import { OnboardingForm } from "@/components/custom-ui/on-boarding-form";
import { SidebarProfile } from "@/components/custom-ui/sidebar-profile";
import { PathExplorerData } from "@/types/path-explorer-data";
import { DecisionDuel } from "@/components/custom-ui/decision-duel";
import { fetchPathExplorerData, PathExplorer } from "@/components/custom-ui/path-explorer";
import { Tradeoffs } from "@/components/custom-ui/tradeoffs";
import { Evidence } from "@/components/custom-ui/evidence";
import { Risks } from "@/components/custom-ui/risks";
import { WeekPlan } from "@/components/custom-ui/week-plan";
import { PeopleLikeMe } from "@/components/custom-ui/people-like-me";


// --- Main App ---
export default function CareerAgentUI() {
  const [hours, setHours] = useState(10);
  const [risk, setRisk] = useState("Balanced");
  const [location, setLocation] = useState("Singapore");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pathData, setPathData] = useState<PathExplorerData | null>(null);

  const basePay = location === "Singapore" ? 82000 : 70000;

  
  // Load PathExplorer data whenever profile is set or plan mode changes
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const data = await fetchPathExplorerData(profile, risk)
      if (!cancelled) setPathData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, risk]);

  if (!profile) {
    return <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 dark:from-gray-950 dark:to-gray-900">
      <OnboardingForm onComplete={(p) => {
        setProfile(p);
      }} />
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="rounded-3xl border bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Sparkles className="h-6 w-6" /> Career Strategy Studio
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                Explore realistic paths, compare choices, and get a weekly plan for your career. Clear numbers, simple language, and sources.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip><Map className="mr-1 inline h-3 w-3" /> Path Explorer</Chip>
              <Chip><GitBranch className="mr-1 inline h-3 w-3" /> Decision Duel</Chip>
              <Chip><Calendar className="mr-1 inline h-3 w-3" /> Week Plan</Chip>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <SidebarProfile profile={profile} />

          <div className="space-y-6 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto pr-1">
            {/* Path Explorer */}
            <Section
              title="Path Explorer"
              icon={<Layers className="h-5 w-5" />}
              actions={null}   // ← or keep your select if you like it
            >
              <PathExplorer data={pathData ?? undefined} />
            </Section>

            {/* Decision Duel */}
            <Section title="Decision Duel" icon={<GitBranch className="h-5 w-5" />}>
              <DecisionDuel hours={hours} location={location} />
            </Section>

            {/* Tradeoffs + Evidence */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Explainable trade‑offs" icon={<BarChart3 className="h-5 w-5" />}>
                <Tradeoffs />
              </Section>
              <Section title="Receipts (evidence)" icon={<ListChecks className="h-5 w-5" />}>
                <Evidence />
              </Section>
            </div>

            {/* Week Plan + People Like Me */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Week‑by‑Week Plan" icon={<Calendar className="h-5 w-5" />} actions={<div className="flex items-center gap-2 text-xs"><Clock size={14} /> Target {hours} h/week</div>}>
                <WeekPlan hours={hours} />
              </Section>
              <Section title="People like me" icon={<Users className="h-5 w-5" />}>
                <PeopleLikeMe />
              </Section>
            </div>

            {/* Footer / Risk cards */}
            <Section title="Risks & safeguards" icon={<Shield className="h-5 w-5" />}>
              <Risks />
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <RefreshCw size={14} />
                We decay old data, show uncertainty clearly, and let you choose plan style.
              </div>
            </Section>

            {/* CTA */}
            <div className="rounded-2xl border bg-white p-5 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mx-auto max-w-2xl">
                <h3 className="text-lg font-semibold">Ready to plug in real data?</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Connect your resume, pick sources (job boards, salary surveys), and turn on live estimates.
                </p>    
                <button className="mt-3 inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white shadow-sm transition hover:opacity-90 dark:bg-white dark:text-gray-900">
                  <CircleDollarSign size={16} /> Continue to data setup <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
