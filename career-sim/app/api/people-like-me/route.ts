import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import { prisma } from "@/lib/db";

export type TablePerson = {
  name: string;
  title?: string;
  workplace?: string;
  location?: string;
  connections?: number;
  followers?: number;
  topSkills?: string[];
  blurb?: string; // short 1-liner from about/experiences/LLM
  sources?: { label: string; url?: string }[];
};

function pluckSkillValues(skillsJson: any): string[] {
  if (!skillsJson) return [];
  try {
    const obj = typeof skillsJson === "string" ? JSON.parse(skillsJson) : skillsJson;
    if (Array.isArray(obj)) return obj.map(String).filter(Boolean);
    if (obj && typeof obj === "object") {
      // dataset shape: {'Skill 0': 'Social media', ...}
      return Object.keys(obj)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .map(k => obj[k])
        .filter(Boolean)
        .map(String);
    }
    return [];
  } catch {
    return [];
  }
}

function firstExperienceLine(expsJson: any): string {
  try {
    const obj = typeof expsJson === "string" ? JSON.parse(expsJson) : expsJson;
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj).sort((a, b) => String(a).localeCompare(String(b)));
    for (const k of keys) {
      const it = obj[k];
      if (it && typeof it === "object") {
        const role = (it.Role || it.role || "").toString().trim();
        const wp = (it.Workplace || it.workplace || "").toString().trim();
        const desc = (it.Description || it.description || "").toString().trim();
        const seg = [role, wp, desc].filter(Boolean).join(" | ");
        if (seg) return seg;
      } else if (typeof it === "string" && it.trim()) {
        return it.trim();
      }
    }
    return "";
  } catch {
    return "";
  }
}

async function llmBlurb(about?: string | null, experienceLine?: string | null): Promise<string | undefined> {
  const text = [about && `About: ${about}`, experienceLine && `Experience: ${experienceLine}`]
    .filter(Boolean)
    .join("\n");
  if (!text) return undefined;

  const config: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: { blurb: { type: Type.STRING } },
      required: ["blurb"],
      propertyOrdering: ["blurb"]
    }
  };

  try {
    const out = await structuredOutput(
      `Write a single, short, concrete line (max 18 words) summarizing this person's professional focus:\n${text}`,
      config
    );
    const val = (out as any)?.blurb?.toString()?.trim();
    return val || undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId: bigint | number | string | undefined = body?.userId;
    const targets: Array<{ id: string; label: string }> | undefined = body?.targets;

    if (!userId) {
      return NextResponse.json({ error: "Missing required: userId" }, { status: 400 });
    }

    // Ensure user has an embedding
    const userVec = await prisma.$queryRawUnsafe<any[]>(
      `SELECT resume_embedding FROM user_profile WHERE user_id = ?`,
      BigInt(userId as any)
    );
    if (!Array.isArray(userVec) || userVec[0]?.resume_embedding == null) {
      return NextResponse.json({ people: [], warning: "User has no resume embedding yet." });
    }

    // role hints prefilter
    const roleHints = (targets ?? []).map(t => t.label).slice(0, 4);
    const likeClauses: string[] = [];
    const likeParams: string[] = [];
    if (roleHints.length) {
      for (const _ of roleHints) {
        likeClauses.push(
          `(p.current_title LIKE ? OR p.workplace LIKE ? OR JSON_SEARCH(p.skills, 'all', ?) IS NOT NULL OR JSON_SEARCH(p.experiences, 'all', ?) IS NOT NULL)`
        );
      }
      for (const h of roleHints) {
        const pat = `%${h}%`;
        likeParams.push(pat, pat, pat, pat);
      }
    }
    const whereClause = likeClauses.length ? `WHERE ${likeClauses.join(" OR ")}` : "";

    // Distance fn/operator name may differ by distro; update if needed
    const distanceFn = `VEC_COSINE_DISTANCE`;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        p.full_name,
        p.current_title,
        p.workplace,
        p.location,
        p.connections,
        p.followers,
        p.skills,
        p.about,
        p.experiences,
        p.resume_summary,
        p.sources
      FROM people p
      ${whereClause}
      ORDER BY ${distanceFn}(
        p.resume_embedding,
        (SELECT up.resume_embedding FROM user_profile up WHERE up.user_id = ?)
      ) ASC
      LIMIT 12
      `,
      ...likeParams,
      BigInt(userId as any)
    );

    const people: TablePerson[] = [];
    for (const r of rows ?? []) {
      const skills = pluckSkillValues(r.skills).slice(0, 6);
      const expLine = firstExperienceLine(r.experiences);
      // choose best blurb: resume_summary > about > experience > llm
      const blurbBase: string | undefined =
        (r.resume_summary && String(r.resume_summary)) ||
        (r.about && String(r.about)) ||
        (expLine || undefined);

      const blurb =
        blurbBase && blurbBase.length <= 160
          ? blurbBase
          : await llmBlurb(r.about, expLine);

      const fullName =
  (r.full_name && String(r.full_name).trim()) || "Anon";

people.push({
  name: fullName,
  title: r.current_title ? String(r.current_title) : undefined,
  workplace: r.workplace ? String(r.workplace) : undefined,
  location: r.location ? String(r.location) : undefined,
  connections: typeof r.connections === "number" ? r.connections : undefined,
  followers: typeof r.followers === "number" ? r.followers : undefined,
  topSkills: skills,
  blurb,
  sources: Array.isArray(r.sources) ? r.sources : undefined
});
    }

    return NextResponse.json({ people });
  } catch (e: any) {
    console.error("People-like-me API error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
