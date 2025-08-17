"use client";

import { useState } from "react";

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
  const [location, setLocation] = useState("Singapore"); // or "Kuala Lumpur"
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

      <section className="space-y-2">
        <label className="block font-medium">Paste Resume</label>
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          className="w-full h-40 border rounded p-2"
          placeholder="Paste resume text here..."
        />
        <button
          onClick={uploadResume}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Upload Resume
        </button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Role / Keyword</label>
          <input
            className="w-full border rounded p-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g., backend developer"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Location</label>
          <input
            className="w-full border rounded p-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Kuala Lumpur"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="remoteOnly"
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
          />
          <label htmlFor="remoteOnly">Remote only</label>
        </div>
      </section>

      <div className="flex gap-4">
        <button
          onClick={fetchJobs}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Fetch JSearch
        </button>

        <button
          onClick={findSimilar}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Find Similar Jobs
        </button>
      </div>

      {message && <p className="text-gray-700">{message}</p>}

      {jobs.length > 0 && (
        <table className="w-full border mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Title</th>
              <th className="p-2 border">Company</th>
              <th className="p-2 border">Location</th>
              <th className="p-2 border">Score</th>
              <th className="p-2 border">Link</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              
              <tr key={job.id}>
                <td className="p-2 border">{job.title}</td>
                <td className="p-2 border">{job.company}</td>
                <td className="p-2 border">{job.location}</td>
                <td className="p-2 border">{(job.score * 100).toFixed(1)}%</td>
                <td className="p-2 border">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    View
                  </a>
                </td>
            </tr>

            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
