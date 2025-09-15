# 🌟 Pathwise

Pathwise is a **career-planning agent** that simulates counterfactual career paths—rooted in real data, transparent about uncertainty, and tailored to each user’s skill profile, constraints, and goals.

👉 **[Live Demo](https://your-deployed-url.com)**

---

## 🚀 Project Overview

Pathwise helps individuals **navigate career decisions with data-driven insights**.
It answers four key questions:

* ✨ **Show me the path.** Trace a route from current skills to potential roles, with salary and impact forecasts over 1–5 years.
* ⚖️ **Compare choices.** Evaluate options side-by-side (bootcamp vs. CS minor, internal transfer vs. new company, MBA vs. staying).
* 🔍 **Tell me why.** Surface evidence and similar profiles (“people like me who did X ended up in Y”), with citations.
* 🛠️ **Make it doable.** Generate a concrete study and work plan with courses, projects, networking moves, and timelines.

---

## ⚙️ How It Works

1. 📝 **Profile & Constraints Intake**
   Collects skills, experience, interests, geography, visa status, time budget, financial runway, and risk tolerance.

2. 📈 **Outcome Model (Counterfactuals)**
   Projects earnings, seniority, job-offer likelihood, promotion timing, happiness proxies, and risk bands.

3. 🧩 **Intervention Planner**
   Recommends a sequence of actions—courses, projects, certifications, internships, conferences—with effort estimates.

4. 📚 **Evidence Retrieval (TiDB + Vector Search + RAG)**

   * **Storage & Indexing:** TiDB Cloud indexes ESCO skills data, anonymized career trajectories, job descriptions, salary surveys, and alumni stories.
   * **Retrieval:** Vector search finds similar profiles/resources; RAG pipelines ground LLM outputs in retrieved documents.

5. 🔎 **Explainable Trade-offs**
   Surfaces which actions most influence outcomes (e.g., “an open-source data-viz project improves interview rates more than a generic SQL cert”).

---

## 🌟 Main Features

* **Path Explorer** – Interactive graph: current skills → bridge skills → target roles, with confidence bands.
* **Decision Duel** – Compare 2–3 strategies with projected offer timing, compensation, ceiling, and burnout risk.
* **Week-by-Week Plan** – Adaptive 12-week schedule respecting time/money constraints, with auto-adjustments.
* **“People Like Me” Receipts** – Real anonymized trajectories from similar professionals, via vector search.

---

## 🛠️ Run Instructions

### ✅ Prerequisites

* Node.js 18+
* MySQL or TiDB instance
* API keys for **Google Gemini** and **SerpAPI**

### 📦 1. Install dependencies

```bash
npm install
```

### ⚙️ 2. Configure environment

Create a `.env` file with at least:

```bash
DATABASE_URL="mysql://user:pass@host:port/db"
AUTH_SECRET="dev_secret_change_me"
GOOGLE_API_KEY="your_gemini_key"
SERPAPI_KEY="your_serpapi_key"

# Optional Google Calendar OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI=""
ENCRYPTION_SECRET=""
```

### ▶️ 3. Start the dev server

```bash
npm run dev
```

App runs at 👉 [http://localhost:3000](http://localhost:3000)

---

## 🔄 Data Flow & Integrations

* 👤 **User Profile & Auth** – Users register/login → signed JWT cookie. Skills/profile stored via Prisma in MySQL/TiDB.
* 🧭 **Path Explorer** – `/api/path` pulls skills/resume → predicts target roles (vector search + Gemini) → fetches role requirements & resources via SerpAPI → results saved to session.
* ⚖️ **Decision Duel & Trade-offs** – LLM compares strategies, highlights efficient skill investments, merges evidence, saves to session.
* 👥 **People Like Me** – Vector similarity on anonymized people table; Gemini may summarize surfaced profiles.
* 📅 **Week Plan** – Builds a 12-week schedule from Path Explorer outputs; Gemini fills task details into structured JSON.
* 💬 **Chat** – LangChain graph ties Gemini to callable tools (path, duel, tradeoffs, people, week plan) for grounded responses.

**External Services**

* LLM & APIs: **Google Gemini** (`@google/genai`), **SerpAPI**
* Auth & Scheduling (optional): **Google OAuth/Calendar**
* Database & ORM: **TiDB/MySQL + Prisma**
* Orchestration: **LangChain**

---

## 📂 File Structure

```plaintext
career-sim/
├── app/
│   ├── api/                # API routes
│   │   ├── chat/
│   │   ├── decision/
│   │   ├── evidence/
│   │   ├── extract-profile/
│   │   ├── google/
│   │   ├── login/
│   │   ├── logout/
│   │   ├── me/
│   │   ├── path/
│   │   ├── people-like-me/
│   │   ├── profile/
│   │   ├── register/
│   │   ├── session-data/
│   │   ├── tradeoffs/
│   │   └── week-plan/
│   ├── app/page.tsx
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── protected/page.tsx
│   └── register/page.tsx
├── components/             # Reusable components
│   ├── custom-ui/…         # chat-widget, decision-duel, profile-editor, etc.
│   ├── system/session-provider.tsx
│   └── ui/…                # badge, button, card, dialog, slider, etc.
├── lib/                    # Core logic (auth, db, llm, query-builder, etc.)
├── prisma/schema.prisma    # Database schema
├── public/                 # Static assets
├── types/                  # TypeScript types
├── middleware.ts
├── next.config.ts
├── tsconfig.json
├── package.json
└── README.md
```
