'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-sm rounded-2xl border bg-white/90 p-6 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <h1 className="text-xl font-semibold mb-4">Log in</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setLoading(true);
            const res = await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password, remember }),
            });
            const data = await res.json();
            setLoading(false);
            if (!res.ok) { setErr(data.error || "Invalid credentials"); return; }
            r.push("/app"); // go to protected area
          }}
          className="space-y-3"
        >
          <input className="w-full border rounded p-2" placeholder="Email" type="email"
                value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"  />
          <div className="relative">
            <input
              className="w-full border rounded p-2 pr-10"
              placeholder="Password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            disabled={loading}
            className={`w-full rounded-lg bg-black text-white px-4 py-2 transition ${
              loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>
          <a href="/register" className="text-sm text-blue-600 hover:underline">
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}
