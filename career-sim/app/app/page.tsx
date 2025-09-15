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
import { UserProfile } from "../../types/user-profile";
import { OnboardingForm } from "@/components/custom-ui/on-boarding-form";
import { SidebarProfile } from "@/components/custom-ui/sidebar-profile";
import { fetchPathExplorerData, PathExplorer } from "@/components/custom-ui/path-explorer";
import { Tradeoffs } from "@/components/custom-ui/tradeoffs";
import { Evidence } from "@/components/custom-ui/evidence";
import { WeekPlan } from "@/components/custom-ui/week-plan";
import { PeopleLikeMe } from "@/components/custom-ui/people-like-me";
import { DecisionDuel } from "@/components/custom-ui/decision-duel";
import { PathExplorerData } from "@/types/path-explorer-data";
import { EvidenceBuckets } from "@/types/evidence-types";
import { ChatWidget } from "@/components/custom-ui/chat-widget";
import { v4 as uuidv4 } from "uuid";
import { SessionProvider, useThreadId, usePushData } from "@/components/system/session-provider";
import { ProfileEditor } from "@/components/custom-ui/profile-editor";



// --- Main App ---
export default function CareerAgentUI() {
  const [hours, setHours] = useState(10);
  const [location, setLocation] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pathData, setPathData] = useState<PathExplorerData | null>(null);
  const [evidence, setEvidence] = useState<EvidenceBuckets | null>(null);
  const [threadId,setThreadId] = useState(() => uuidv4());   // ← single chat session id
  const [editing, setEditing] = useState(false);
  const [me, setMe] = useState<{ id: string; email?: string; name?: string } | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [approachA, setApproachA] = useState<string | null>(null);
  const [approachB, setApproachB] = useState<string | null>(null);

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
  useEffect(() => {
      let cancelled = false;

      (async () => {
        setBootstrapping(true);
        try {
          // 1) Who am I?
          const meRes = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
          const meJson = meRes && meRes.ok ? await meRes.json() : { user: null };
          const user = meJson?.user ?? null;
          if (cancelled) return;

          setMe(user);

          // 2) If logged in, load profile
          if (user) {
            try {
              const profRes = await fetch("/api/profile", { cache: "no-store" });
              if (cancelled) return;

              if (profRes.status === 204) {
                // new user—no profile yet
                setProfile(null);
              } else if (profRes.ok) {
                const data = await profRes.json();
                if (cancelled) return;
                setProfile({
                  userName: data.userName ?? "",
                  resume: data.resume ?? "",
                  yearsExp: data.yearsExperience ?? 0,
                  skills: Array.isArray(data.skills) ? data.skills : [],
                  education: data.education ?? "",
                });
              } else {
                setProfile(null);
              }
            } catch {
              if (!cancelled) setProfile(null);
            }
          } else {
            // not logged in — no profile to show
            setProfile(null);
          }
        } finally {
          if (!cancelled) setBootstrapping(false);
        }
      })();

      return () => { cancelled = true; };
    }, []);
// Load the data for components
  useEffect(() => {
    if (!profile || !location) return;
    let cancelled = false;
    (async () => {
      const data = await fetchPathExplorerData(profile)
      if (!cancelled) {
        setPathData(data);
        
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [profile,location]);


 if (bootstrapping || me === undefined) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  // If logged in but has no profile yet → Onboarding
  if (me && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 dark:from-gray-950 dark:to-gray-900">
        <div className="animate-fadeIn">
          <OnboardingForm onComplete={(p) => { setProfile(p); }} />
        </div>
      </div>
    );
  }

   
  
  return (
    <SessionProvider threadId={threadId}>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-5 text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
<div className="mx-auto max-w-7xl motion-safe:animate-fadeIn">
          {/* Header */}
        <header
          role="banner"
          className="rounded-3xl border bg-white/80 p-6 shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/70"
        >
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Sparkles className="h-6 w-6" /> Career Strategy Studio
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                Explore realistic paths, compare choices, and get a weekly plan for your career. Clear numbers, simple language, and sources.
              </p>
            </div>

            {/* chips: wrap on small screens */}
            <div className="flex flex-wrap items-center gap-2">
              <Chip><Map className="mr-1 inline h-3 w-3" /> Path Explorer</Chip>
              <Chip><GitBranch className="mr-1 inline h-3 w-3" /> Decision Duel</Chip>
              <Chip><Calendar className="mr-1 inline h-3 w-3" /> Week Plan</Chip>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <div className="space-y-4 lg:sticky lg:top-5">
              <ChatWidget profile={profile} variant="compact" threadId={threadId}/>
              <SidebarProfile profile={profile} onEdit={() => setEditing(true)} />
            </div>
            <div className="space-y-6 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:[scrollbar-gutter:stable] pr-1 lg:pr-2 lg:pl-1 motion-safe:scroll-smooth">
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
                onApproachesChange={(a, b) => {
                  setApproachA(a);
                  setApproachB(b);
                }}
              />
            </Section>

            {/* Tradeoffs + Evidence */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Explainable trade-offs" icon={<BarChart3 className="h-5 w-5" />}>
                <Tradeoffs profile={profile} pathTargets={pathData?.targets} />
              </Section>
              <Section title="Analysis" icon={<ListChecks className="h-5 w-5" />}>
              <Evidence
                location={location}
                roleA={pathData?.targets?.[0]?.label}
                roleB={pathData?.targets?.[1]?.label}
                approachA={approachA ?? undefined}
                approachB={approachB ?? undefined}
              />
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
                <PeopleLikeMe profile={profile} pathTargets={pathData?.targets} userId={me?.id ?? ""}   />
            </Section>
            </div>
          </div>
        </div>
      </div>
    </div>

  <ProfileEditor
    open={editing}
    initial={profile}
    onClose={() => setEditing(false)}
    onSaved={(updated) => {
      setProfile(updated);
      setPathData(null);
    }}
    userId={me?.id ?? ""}   
  />
    </SessionProvider>
  );
}
