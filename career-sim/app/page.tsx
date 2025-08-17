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

type JobResult = {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
};

export default function HomePage() {
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("software engineer");
  const [location, setLocation] = useState("Singapore");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [message, setMessage] = useState("");

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
            <CardFooter>
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline text-sm"
              >
                View job posting
              </a>
            </CardFooter>
          </Card>
        ))}
      </div>
    </main>
  );
}
