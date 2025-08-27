import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Utility: normalize a skill name for comparisons */
function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Utility: build a safe regex from a literal string */
function escapeRegex(lit: string) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Utility: pick a nice snippet window around a match */
function snippet(text: string, start: number, end: number, radius = 60) {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  const raw = text.slice(s, e);
  return (s > 0 ? "…" : "") + raw + (e < text.length ? "…" : "");
}

/** Dedupe by key while keeping first occurrence */
function uniqueBy<T>(arr: T[], key: (t: T) => string | number) {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = BigInt(url.searchParams.get("userId") || "1");
    const jobId  = BigInt(url.searchParams.get("jobId")  || "1");
    const mode   = url.searchParams.get("mode") || "keyword"; // "keyword" | "embedding" (optional)

    // 1) Load user's declared skills
    const userSkillRows = await prisma.userSkill.findMany({
      where: { user_id: userId },
      select: { skill_name: true },
    });
    const userSkillsNorm = new Set(userSkillRows.map(s => norm(s.skill_name)));

    // 2) Load job description
    const job = await prisma.jobText.findUnique({
      where: { job_id: jobId },
      select: { description: true },
    });
    if (!job?.description) {
      return NextResponse.json(
        { error: `No job description found for job_id=${jobId.toString()}` },
        { status: 404 }
      );
    }
    const text = job.description;

    // 3) Load skill taxonomy (names + aliases + parent)
    const allSkills = await prisma.skillNode.findMany({
      select: { id: true, name: true, aliases: true, parent_id: true },
    });

    // Build a list of (skillId, label) strings to match (name + aliases[])
    type SkillLabel = { id: bigint; name: string; label: string; parent_id: bigint | null };
    const labels: SkillLabel[] = [];
    for (const s of allSkills) {
      labels.push({ id: s.id, name: s.name, label: s.name, parent_id: s.parent_id ?? null });
      if (Array.isArray(s.aliases)) {
        for (const alias of s.aliases as string[]) {
          if (alias && typeof alias === "string") {
            labels.push({ id: s.id, name: s.name, label: alias, parent_id: s.parent_id ?? null });
          }
        }
      } else if (s.aliases && typeof s.aliases === "object") {
        // Some people store aliases as object {alts: [...]} – try to read plain arrays too
        const maybeArr = (s.aliases as any).alts;
        if (Array.isArray(maybeArr)) {
          for (const alias of maybeArr) {
            if (alias && typeof alias === "string") {
              labels.push({ id: s.id, name: s.name, label: alias, parent_id: s.parent_id ?? null });
            }
          }
        }
      }
    }

    // Optional: a quick map from skillId -> parent_id
    const parentById = new Map<string, bigint | null>();
    for (const s of allSkills) parentById.set(s.id.toString(), s.parent_id ?? null);

    // 4) Find mentions of skills in the job description (case-insensitive, word boundaries)
    type Mention = {
      skillId: string; // keep as string for JSON friendliness
      name: string;    // canonical skill name (from SkillNode.name)
      start: number;
      end: number;
      snippet: string;
      parent_id: bigint | null;
    };
    const mentions: Mention[] = [];

    // Tokenize-once approach using regex per label (simple & clear)
    for (const L of labels) {
      // \b is OK for most ASCII skills; for symbols like "C++", fall back to plain match.
      // We'll try word boundaries unless label contains non-word chars.
      const hasNonWord = /[^A-Za-z0-9_]/.test(L.label);
      const body = hasNonWord
        ? new RegExp(escapeRegex(L.label), "gi")
        : new RegExp(`\\b${escapeRegex(L.label)}\\b`, "gi");

      let m: RegExpExecArray | null;
      while ((m = body.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        mentions.push({
          skillId: L.id.toString(),
          name: L.name,
          start,
          end,
          snippet: snippet(text, start, end),
          parent_id: L.parent_id ?? null,
        });
      }
    }

    // Dedupe mentions by skillId (keep first occurrence for clean citations)
    const dedupedMentions = uniqueBy(mentions, (m) => m.skillId);

    // 5) Compute "missing" = skills in job description but NOT in user's set
    const missing = dedupedMentions
      .filter(m => !userSkillsNorm.has(norm(m.name)))
      .map(m => m.name);

    // 6) Basic similarity heuristic (coverage of mentioned skills the user already has)
    const totalMentionedUnique = dedupedMentions.length || 1;
    const userHasCount = dedupedMentions.filter(m => userSkillsNorm.has(norm(m.name))).length;
    const sim = Number((userHasCount / totalMentionedUnique).toFixed(2));

    // 7) Pick a simple "cluster" by most-common parent among mentioned skills (if available)
    let cluster = { id: "", name: "General", sim };
    if (dedupedMentions.length > 0) {
      const counts = new Map<string, number>();
      for (const m of dedupedMentions) {
        const key = (m.parent_id ?? -1n).toString();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const parentId = BigInt(top[0]);
        if (parentId !== -1n) {
          // fetch parent node name (one query)
          const parent = await prisma.skillNode.findUnique({
            where: { id: parentId },
            select: { id: true, name: true },
          });
          if (parent) cluster = { id: parent.id.toString(), name: parent.name, sim };
        }
      }
    }

    // 8) Prepare citations (for missing ones first, then others if you want all)
    const missingSet = new Set(missing.map(norm));
    const citations = [
      // missing-first citations
      ...dedupedMentions
        .filter(m => missingSet.has(norm(m.name))),
      // then the rest (not strictly necessary; comment out if you only want missing citations)
      // ...dedupedMentions.filter(m => !missingSet.has(norm(m.name))),
    ].map(m => ({
      skillId: m.skillId,
      name: m.name,
      start: m.start,
      end: m.end,
      snippet: m.snippet,
    }));

    // 9) (Optional) Embedding-mode example via raw SQL (TiDB). Keep it simple.
    // If you want to enrich "missing" with top-k similar skills to the job embedding,
    // uncomment and call with ?mode=embedding
    //
    // NOTE: This assumes you have an `embedding` VECTOR column on both tables,
    // and TiDB supports <=> as a distance operator. Adjust names as needed.
    //
    if (mode === "embedding") {
      try {
        const similar = await prisma.$queryRawUnsafe<
          Array<{ id: bigint; name: string; sim: number }>
        >(
          `
          SELECT sn.id, sn.name,
                 1 - (sn.embedding <=> (SELECT jt.embedding FROM job_texts jt WHERE jt.job_id = ?)) AS sim
          FROM skill_node sn
          ORDER BY sim DESC
          LIMIT 50
          `,
          jobId.toString()
        );

        // add the top-N similar skills that are not in user's skills and not already in missing
        const already = new Set(missing.map(norm));
        const extra = similar
          .map(r => r.name)
          .filter(n => !userSkillsNorm.has(norm(n)) && !already.has(norm(n)));

        // tack on a few (limit to 5 to keep it tidy)
        for (const x of extra.slice(0, 5)) missing.push(x);
      } catch (e) {
        // swallow embedding errors silently so keyword flow still works
        // console.error("Embedding mode error:", e);
      }
    }

    // 10) Return
    return NextResponse.json({
      cluster,
      missing: [...uniqueBy(missing, s => norm(s))].slice(0, 25), // cap list
      citations, // first occurrence per skill for clean UX
    });
  } catch (err) {
    // console.error(err);
    return NextResponse.json(
      { error: "Unexpected error resolving skill gaps." },
      { status: 500 }
    );
  }
}
