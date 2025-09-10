'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const r = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pwStrength, setPwStrength] = useState<0 | 1 | 2 | 3>(0);

  function calcStrength(pw: string): 0 | 1 | 2 | 3 {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
    return s as 0 | 1 | 2 | 3;
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-sm rounded-2xl border bg-white/90 p-6 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">      <h1 className="text-xl font-semibold mb-4">Create account</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setLoading(true);
            if (form.password.length < 8) {
              setErr("Password must be at least 8 characters.");
              setLoading(false);
              return;
            }
            if (form.password !== confirm) {
              setErr("Passwords do not match.");
              setLoading(false);
              return;
            }
            const res = await fetch("/api/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: form.email, password: form.password }),
            });
            const data = await res.json();
            setLoading(false);
            if (!res.ok) { setErr(data.error || "Something went wrong"); return; }
            r.push("/app"); // go to protected area
          }}
          className="space-y-3"
        >
          <input className="w-full border rounded p-2" placeholder="Email" type="email"
                value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />

         {/* Password with toggle */}
          <div className="relative">
            <input
              className="w-full border rounded p-2 pr-10"
              placeholder="Password (min 8 chars)"
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={(e) => {
                const v = e.target.value;
                setForm({ ...form, password: v });
                setPwStrength(calcStrength(v));
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          {/* Confirm password */}
          <div className="relative mt-3">
            <input
              className="w-full border rounded p-2"
              placeholder="Confirm password"
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {confirm && confirm !== form.password && (
            <p className="text-xs text-red-600">Passwords do not match.</p>
          )}

          {/* Strength bar */}
          <div className="mt-2">
            <div className="h-1 w-full rounded bg-gray-200 overflow-hidden">
              <div
                className={`h-1 transition-all ${
                  pwStrength === 0
                    ? "w-0"
                    : pwStrength === 1
                    ? "w-1/3"
                    : pwStrength === 2
                    ? "w-2/3"
                    : "w-full"
                } ${pwStrength <= 1 ? "bg-red-500" : pwStrength === 2 ? "bg-yellow-500" : "bg-green-500"}`}
              />
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {pwStrength <= 1 ? "Weak" : pwStrength === 2 ? "Okay" : "Strong"}
            </p>
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            disabled={loading}
            className={`w-full rounded-lg bg-black text-white px-4 py-2 transition ${
              loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            {loading ? "Creating..." : "Create account"}
          </button>
          <p className="mt-3 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <a href="/login" className="text-blue-600 hover:underline">
              Log in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
