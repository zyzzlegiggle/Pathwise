"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type JobResult = {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
};
type ResourceHit = { title: string; provider: string; url: string; hours_estimate?: number; score?: number };
type SimStep = { week: number; score: number };

export default function HomePage() {
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("software engineer");
  const [location, setLocation] = useState("Singapore");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [message, setMessage] = useState("");
  const [gapsByJob, setGapsByJob] = useState<Record<number, string[]>>({});
  const [resourcesBySkill, setResourcesBySkill] = useState<Record<string, ResourceHit[]>>({});
  const [simSteps, setSimSteps] = useState<SimStep[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  async function uploadResume() {
    setLoading(true);
    setMessage("Uploading resume...");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "1", resumeText: resume }),
      });
      const data = await res.json();
      setMessage(data.ok ? "Resume uploaded!" : "Failed to upload resume");
    } catch {
      setMessage("Error uploading resume");
    } finally {
      setLoading(false);
    }
  }

  async function fetchJobs() {
    setLoading(true);
    setMessage("Fetching jobs...");
    try {
      const params = new URLSearchParams({
        role,
        location,
        remote: String(remoteOnly),
      }).toString();
      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setMessage(`Fetched ${data.count ?? 0} jobs`);
    } catch {
      setMessage("Error fetching jobs");
    } finally {
      setLoading(false);
    }
  }

  async function findSimilar() {
    setLoading(true);
    setMessage("Finding similar jobs...");
    try {
      const res = await fetch("/api/similar?userId=1");
      const data = await res.json();
      setJobs(data.jobs || []);
      setMessage(`Found ${data.jobs?.length || 0} jobs`);
    } catch {
      setMessage("Error finding similar jobs");
    } finally {
      setLoading(false);
    }
  }

  // analyze gaps for a job
  async function analyzeGaps(jobId: number) {
    setLoading(true);
    setMessage("Analyzing skill gaps...");
    try {
      const res = await fetch(`/api/gaps?userId=1&jobId=${jobId}`);
      const data = await res.json();
      setGapsByJob((prev) => ({ ...prev, [jobId]: data.missing ?? [] }));
      setMessage(`Found ${data.missing?.length ?? 0} gaps`);
    } catch {
      setMessage("Error analyzing gaps");
    } finally {
      setLoading(false);
    }
  }

  // fetch resources for a skill
  async function fetchResources(skill: string) {
    setLoading(true);
    setMessage(`Finding resources for ${skill}...`);
    try {
      const res = await fetch(`/api/resources?skill=${encodeURIComponent(skill)}`);
      const data = await res.json();
      setResourcesBySkill((prev) => ({ ...prev, [skill]: data.resources ?? [] }));
      setMessage(`Found ${data.resources?.length ?? 0} resources`);
    } catch {
      setMessage("Error fetching resources");
    } finally {
      setLoading(false);
    }
  }

  // run a 12-week simulation for a job
  async function simulate(jobId: number) {
    setLoading(true);
    setMessage("Simulating 12-week path...");
    setSelectedJobId(jobId);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "1", jobId, weeklyHours: 10 }),
      });
      const data = await res.json();
      setSimSteps(data.steps ?? []);
      setMessage(`Simulation ready (${data.steps?.length ?? 0} weeks)`);
    } catch {
      setMessage("Error running simulation");
    } finally {
      setLoading(false);
    }
  }


  return (
    <main className="p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Career Clone Demo</h1>

      {/* Resume uploader */}
      <section className="space-y-2">
        <label className="block font-medium">Paste Resume</label>
        <Textarea
          value={resume}
          onChange={(e: any) => setResume(e.target.value)}
          placeholder="Paste resume text here..."
          className="h-40"
        />
        <Button onClick={uploadResume} disabled={loading}>
          Upload Resume
        </Button>
      </section>

      {/* Search controls */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Role / Keyword</label>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g., backend developer"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Kuala Lumpur"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="remoteOnly"
            checked={remoteOnly}
            onCheckedChange={(v) => setRemoteOnly(Boolean(v))}
          />
          <label htmlFor="remoteOnly" className="text-sm">
            Remote only
          </label>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={fetchJobs} disabled={loading} variant="secondary">
          Fetch JSearch
        </Button>
        <Button onClick={findSimilar} disabled={loading} variant="outline">
          Find Similar Jobs
        </Button>
      </div>

      {message && <p className="text-gray-700">{message}</p>}

      {/* Job results */}
      <div className="grid gap-4 mt-6">
        {jobs.map((job) => (
          <Card key={job.id} className="shadow-sm">
            <CardHeader>
              <CardTitle>{job.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.company} • {job.location}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Match Score: <strong>{(job.score * 100).toFixed(1)}%</strong>
              </p>
            </CardContent>
            <CardFooter className="flex gap-3 flex-wrap">
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline text-sm"
              >
                View job posting
              </a>

              {/*  actions */}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => analyzeGaps(job.id)}
                disabled={loading}
              >
                Analyze gaps
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => simulate(job.id)}
                disabled={loading}
              >
                Simulate 12 weeks
              </Button>
            </CardFooter>

            {gapsByJob[job.id]?.length ? (
              <div className="px-6 pb-4">
                <Separator className="my-3" />
                <p className="text-sm font-medium mb-2">Missing skills</p>
                <div className="flex flex-wrap gap-2">
                  {gapsByJob[job.id].map((skill) => (
                    <div key={skill} className="flex items-center gap-2">
                      <Badge variant="secondary">{skill}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => fetchResources(skill)}
                        disabled={loading}
                      >
                        resources
                      </Button>
                    </div>
                  ))}
                </div>

                {/* resources for any clicked skill */}
                <div className="mt-3 space-y-3">
                  {gapsByJob[job.id].map((skill) =>
                    resourcesBySkill[skill]?.length ? (
                      <div key={`res-${skill}`} className="rounded-md border p-3">
                        <p className="text-sm font-semibold mb-1">Resources for {skill}</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {resourcesBySkill[skill].map((r, i) => (
                            <li key={`${skill}-${i}`} className="text-sm">
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                {r.title}
                              </a>{" "}
                              <span className="text-muted-foreground">
                                • {r.provider}
                                {r.hours_estimate ? ` • ~${r.hours_estimate}h` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {/* simulation chart */}
      {simSteps.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-2">
            Simulation — Qualification vs Weeks {selectedJobId ? `(Job #${selectedJobId})` : ""}
          </h2>
          <div className="w-full h-64 rounded-lg border p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simSteps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(val: any) => `${val}%`} labelFormatter={(l) => `Week ${l}`} />
                <Line type="monotone" dataKey="score" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

    </main>
  );
}
