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
import { UserProfile } from "../types/server/user-profile";
import { OnboardingForm } from "@/components/custom-ui/on-boarding-form";
import { SidebarProfile } from "@/components/custom-ui/sidebar-profile";
import { fetchPathExplorerData, PathExplorer } from "@/components/custom-ui/path-explorer";
import { Tradeoffs } from "@/components/custom-ui/tradeoffs";
import { Evidence } from "@/components/custom-ui/evidence";
import { Risks } from "@/components/custom-ui/risks";
import { WeekPlan } from "@/components/custom-ui/week-plan";
import { PeopleLikeMe } from "@/components/custom-ui/people-like-me";
import { PathExplorerData } from "@/types/client/path-explorer-data";
import { EvidenceBuckets } from "@/types/client/evidence-types";
import { DecisionDuel } from "@/components/custom-ui/decision-duel";


// --- Main App ---
export default function CareerAgentUI() {
  const [hours, setHours] = useState(10);
  const [location, setLocation] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pathData, setPathData] = useState<PathExplorerData | null>(null);
  const [evidence, setEvidence] = useState<EvidenceBuckets | null>(null);
  

  // get location
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (data?.country_name) {
          setLocation(data.country_name); // e.g., "Singapore"
        }
      } catch (e) {
        console.error("Failed to fetch location", e);
      }
    })();
  }, []);

  
  // Load the data for components
  useEffect(() => {
    if (!profile || !location) return;
    let cancelled = false;
    (async () => {
      const data = await fetchPathExplorerData(profile)
      if (!cancelled) setPathData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

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

<div className="space-y-6 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:[scrollbar-gutter:stable] pr-1">            {/* Path Explorer */}
            <Section
              title="Path Explorer"
              icon={<Layers className="h-5 w-5" />}
              actions={null}   // ← or keep your select if you like it
            >
              <PathExplorer data={pathData ?? undefined} />
            </Section>

            {/* Decision Duel */}
            <Section title="Decision Duel" icon={<GitBranch className="h-5 w-5" />}>
              <DecisionDuel
                hours={hours}
                location={location}
                pathTargets={pathData?.targets}
                onEvidence={setEvidence}
    
              />
            </Section>

            {/* Tradeoffs + Evidence */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Explainable trade-offs" icon={<BarChart3 className="h-5 w-5" />}>
                <Tradeoffs profile={profile} pathTargets={pathData?.targets} />
              </Section>
              <Section title="Receipts (evidence)" icon={<ListChecks className="h-5 w-5" />}>
                <Evidence data={evidence ?? undefined} />  {/* ← NEW */}
              </Section>
            </div>

            {/* Week Plan + People Like Me */}
            <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Week-by-Week Plan"
              icon={<Calendar className="h-5 w-5" />}
            >
              <WeekPlan hours={hours} profile={profile} pathData={pathData ?? undefined} />
            </Section>
            <Section title="People like me" icon={<Users className="h-5 w-5" />}>
                <PeopleLikeMe profile={profile} pathTargets={pathData?.targets} />
            </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
