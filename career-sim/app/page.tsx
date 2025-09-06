"use client";
import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  GitBranch,
  Layers,
  Map,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
  Github,
  Linkedin
} from "lucide-react";

/*
  How to use
  -----------
  1) Place this file at: app/page.tsx (marketing homepage)
  2) Keep your existing CareerAgentUI page at /app (e.g., app/app/page.tsx) or any route you prefer.
     The CTA buttons below point to "/app" by default. Adjust if needed.
  3) TailwindCSS + Framer Motion required. No other deps.

  Design
  ------
  • Sticky translucent navbar with blur
  • Hero with animated gradient blobs + subtle parallax
  • Feature grid with hover/tilt effects
  • Product preview section with animated tabs (Path Explorer, Decision Duel, Week Plan)
  • Testimonials (People like me vibe)
  • Pricing/Trust ribbons
  • Final CTA strip + footer
*/

export default function MarketingHome() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-gradient-to-b from-gray-50 via-white to-white text-gray-900 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 dark:text-gray-100">
      <NavBar />
      <Hero />
      <LogosStrip />
      <Features />
      <Preview />
      <Testimonials />
      <Safety />
      <CTA />
      <Footer />
      <AnimatedBackground />
    </main>
  );
}

// ————— Components —————

function NavBar() {
  return (
    <div className="sticky top-0 z-40 w-full">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <motion.nav
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-center justify-between rounded-2xl border bg-white/70 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/60"
          role="navigation"
        >
          <Link href="#" className="flex items-center gap-2 font-semibold tracking-tight">
            <Sparkles className="h-5 w-5" /> Career Strategy Studio
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-gray-700 hover:opacity-80 dark:text-gray-300">Features</a>
            <a href="#preview" className="text-sm text-gray-700 hover:opacity-80 dark:text-gray-300">Preview</a>
            <a href="#testimonials" className="text-sm text-gray-700 hover:opacity-80 dark:text-gray-300">Stories</a>
            <a href="#pricing" className="text-sm text-gray-700 hover:opacity-80 dark:text-gray-300">Pricing</a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-xl border bg-gray-900 px-3 py-2 text-sm text-white transition-all duration-200 hover:scale-[1.02] hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Launch app <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </motion.nav>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-7xl px-4 pt-12 md:pt-20">
      <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl"
          >
            Navigate your career with <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">clarity</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 max-w-xl text-pretty text-base text-gray-600 dark:text-gray-300"
          >
            Paste your background once. We’ll map realistic paths, compare choices, and turn it into a week-by-week plan—backed by transparent trade‑offs and sources.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-2xl border bg-gray-900 px-4 py-2 text-sm text-white shadow-sm transition-all duration-200 hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#preview"
              className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm text-gray-800 transition-all hover:scale-105 dark:border-gray-800 dark:text-gray-200"
            >
              See how it works
            </a>
          </motion.div>
          <motion.ul
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.35 }}
            className="mt-6 grid max-w-xl grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300"
          >
            {[
              { icon: <Map className="h-4 w-4" />, label: "Path Explorer" },
              { icon: <GitBranch className="h-4 w-4" />, label: "Decision Duel" },
              { icon: <BarChart3 className="h-4 w-4" />, label: "Explainable trade‑offs" },
              { icon: <Calendar className="h-4 w-4" />, label: "Week-by-week plan" }
            ].map((i) => (
              <li key={i.label} className="flex items-center gap-2 rounded-xl border bg-white/60 p-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
                <span className="rounded-md border p-1 dark:border-gray-700">{i.icon}</span>
                <span>{i.label}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative"
          aria-hidden
        >
          <div className="relative rounded-3xl border bg-white/80 p-2 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
            {/* Faux app frame */}
            <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white p-3 dark:from-gray-950 dark:to-gray-900">
              <div className="flex items-center gap-2 rounded-xl border bg-white/60 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/60">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-2">Career Strategy Studio</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Card title="Path Explorer" icon={<Layers className="h-4 w-4" />} />
                <Card title="Decision Duel" icon={<GitBranch className="h-4 w-4" />} />
                <Card title="Trade‑offs" icon={<BarChart3 className="h-4 w-4" />} />
                <Card title="Week Plan" icon={<Calendar className="h-4 w-4" />} />
              </div>
            </div>
          </div>

          {/* floating badges */}
          <motion.div
            className="pointer-events-none absolute -left-6 -top-6 hidden select-none md:block"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            <Badge>Zero fluff, only numbers</Badge>
          </motion.div>
          <motion.div
            className="pointer-events-none absolute -right-6 bottom-10 hidden select-none md:block"
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 1 }}
          >
            <Badge>Explainable, source‑backed</Badge>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function LogosStrip() {
  return (
    <section className="mx-auto mt-16 w-full max-w-7xl px-4">
      <div className="rounded-2xl border bg-white/60 px-4 py-3 text-xs text-gray-600 backdrop-blur dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
        Trusted by curious planners from startups to Fortune 500s
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      title: "Path Explorer",
      icon: <Map className="h-5 w-5" />,
      desc: "Explore realistic target roles with compensation ranges, growth outlook, and effort required.",
    },
    {
      title: "Decision Duel",
      icon: <GitBranch className="h-5 w-5" />,
      desc: "A side‑by‑side, number‑first comparison when you're torn between options.",
    },
    {
      title: "Explainable trade‑offs",
      icon: <BarChart3 className="h-5 w-5" />,
      desc: "Transparent assumptions, adjustable weights, and clear sensitivity analysis.",
    },
    {
      title: "Week‑by‑week plan",
      icon: <Calendar className="h-5 w-5" />,
      desc: "A realistic schedule mapped to your available hours and milestones.",
    },
    {
      title: "People like me",
      icon: <Users className="h-5 w-5" />,
      desc: "See trajectories from similar backgrounds and what actually worked.",
    },
    {
      title: "Private by default",
      icon: <ShieldCheck className="h-5 w-5" />,
      desc: "Your inputs stay private. Export or delete your data anytime.",
    },
  ];

  return (
    <section id="features" className="mx-auto mt-20 w-full max-w-7xl px-4">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-balance text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Designed to make hard choices feel easy
      </motion.h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <motion.div
            key={it.title}
            whileHover={{ y: -4 }}
            className="group rounded-2xl border bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:from-gray-950 dark:to-gray-900"
          >
            <div className="mb-2 inline-flex items-center gap-2 rounded-xl border bg-white/70 px-2 py-1 text-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
              <span className="rounded-md border p-1 text-gray-700 dark:border-gray-700 dark:text-gray-200">{it.icon}</span>
              <span className="font-medium">{it.title}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{it.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Preview() {
  const tabs = [
    { key: "path", title: "Path Explorer", icon: <Layers className="h-4 w-4" /> },
    { key: "duel", title: "Decision Duel", icon: <GitBranch className="h-4 w-4" /> },
    { key: "plan", title: "Week Plan", icon: <Calendar className="h-4 w-4" /> },
  ] as const;
  const [active, setActive] = React.useState<(typeof tabs)[number]["key"]>("path");

  return (
    <section id="preview" className="mx-auto mt-20 w-full max-w-7xl px-4">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-balance text-3xl font-semibold tracking-tight md:text-4xl"
      >
        See it in action
      </motion.h2>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all hover:scale-105 dark:border-gray-800 ${
              active === t.key
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-white/60 text-gray-800 backdrop-blur dark:bg-gray-900/60 dark:text-gray-200"
            }`}
          >
            {t.icon}
            {t.title}
          </button>
        ))}
        <Link
          href="/app"
          className="group ml-auto inline-flex items-center gap-2 rounded-xl border bg-gray-900 px-3 py-1.5 text-sm text-white transition-all hover:scale-105 dark:bg-white dark:text-gray-900"
        >
          Launch app <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-6 rounded-3xl border bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60"
      >
        <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white p-4 dark:from-gray-950 dark:to-gray-900">
          {active === "path" && <PreviewCard title="Explore paths with real data" bullets={["Market growth & comp", "Required skills & gaps", "Effort vs. payoff"]} />}
          {active === "duel" && <PreviewCard title="Compare options side‑by‑side" bullets={["Weighted criteria", "Sensitivity sliders", "Evidence you can audit"]} />}
          {active === "plan" && <PreviewCard title="A plan you can actually follow" bullets={["Hours‑aware schedule", "Weekly milestones", "Adjust & re‑generate"]} />}
        </div>
      </motion.div>
    </section>
  );
}

function Testimonials() {
  const quotes = [
    {
      name: "Maya • PM → PM Lead",
      text: "It stopped the analysis paralysis. I finally picked a path and shipped work that mattered.",
    },
    {
      name: "Rahul • Data → MLE",
      text: "The duel made my trade‑offs obvious. The plan fit around my 8‑to‑6 and kids.",
    },
    {
      name: "Elena • Ops → Product",
      text: "The ‘people like me’ section was the confidence boost I needed to apply.",
    },
  ];
  return (
    <section id="testimonials" className="mx-auto mt-20 w-full max-w-7xl px-4">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-balance text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Real people. Real progress.
      </motion.h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {quotes.map((q) => (
          <motion.blockquote
            key={q.name}
            whileHover={{ y: -4 }}
            className="rounded-2xl border bg-white/70 p-4 text-sm text-gray-700 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200"
          >
            “{q.text}”
            <footer className="mt-3 text-xs text-gray-500 dark:text-gray-400">— {q.name}</footer>
          </motion.blockquote>
        ))}
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section id="pricing" className="mx-auto mt-20 w-full max-w-7xl px-4">
      <div className="rounded-3xl border bg-gradient-to-b from-white to-gray-50 p-6 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:to-gray-900">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Private by default, export anytime</h3>
            <p className="mt-1 max-w-xl text-sm text-gray-600 dark:text-gray-300">
              Your background stays on your device until you launch the app. No selling data. Toggle anonymized analytics off with one click.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border bg-white/70 px-3 py-2 text-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
              <span className="inline-flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4"/> Export & delete</span>
            </div>
            <div className="rounded-xl border bg-white/70 px-3 py-2 text-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
              <span className="inline-flex items-center gap-2 font-medium"><Zap className="h-4 w-4"/> Free to start</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto my-20 w-full max-w-7xl px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="rounded-3xl border bg-gray-900 p-6 text-white shadow-sm dark:border-gray-800 dark:bg-white dark:text-gray-900"
      >
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">Ready to make your next move?</h3>
            <p className="mt-1 text-sm opacity-90">Paste your background and get a plan you can follow tonight.</p>
          </div>
          <Link
            href="/app"
            className="group inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm text-gray-900 transition-all hover:scale-105 dark:bg-gray-900 dark:text-white"
          >
            Launch app <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto mb-10 mt-10 w-full max-w-7xl px-4">
      <div className="rounded-2xl border bg-white/60 p-4 text-sm text-gray-600 backdrop-blur dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Career Strategy Studio</p>
          <div className="flex items-center gap-3">
            <a href="#" className="inline-flex items-center gap-1 hover:opacity-80"><Github className="h-4 w-4"/> GitHub</a>
            <a href="#" className="inline-flex items-center gap-1 hover:opacity-80"><Linkedin className="h-4 w-4"/> LinkedIn</a>
            <a href="#" className="inline-flex items-center gap-1 hover:opacity-80">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ————— Small building blocks —————

function Card({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="rounded-2xl border bg-white/70 p-3 shadow-sm backdrop-blur transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900/60"
    >
      <div className="mb-1 inline-flex items-center gap-2 rounded-xl border bg-white/70 px-2 py-1 text-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
        <span className="rounded-md border p-1 text-gray-700 dark:border-gray-700 dark:text-gray-200">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <div className="h-24 rounded-lg border border-dashed dark:border-gray-800" />
    </motion.div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200">
      <Zap className="h-4 w-4" /> {children}
    </div>
  );
}

function PreviewCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-gray-900 dark:bg-white" /> {b}
            </li>
          ))}
        </ul>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border bg-white/70 px-3 py-2 text-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
          <Sparkles className="h-4 w-4" /> Works with your existing data
        </div>
      </div>
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-56 rounded-2xl border border-dashed dark:border-gray-800"
      />
    </div>
  );
}

function AnimatedBackground() {
  return (
    <>
      {/* radial glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15),transparent_60%)] blur-2xl" />
      </div>
      {/* grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)]"
      />
    </>
  );
}
