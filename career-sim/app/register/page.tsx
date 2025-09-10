'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const r = useRouter();
  const [form, setForm] = useState({ email: "", password: "", name: "", country: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">Create account</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          setLoading(true);
          const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
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
        <input className="w-full border rounded p-2" placeholder="Password" type="password"
               value={form.password} onChange={e=>setForm({...form, password:e.target.value})} />
        <input className="w-full border rounded p-2" placeholder="Name (optional)"
               value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <input className="w-full border rounded p-2" placeholder="Country (optional)"
               value={form.country} onChange={e=>setForm({...form, country:e.target.value})} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button disabled={loading} className="rounded bg-black text-white px-4 py-2">
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}
