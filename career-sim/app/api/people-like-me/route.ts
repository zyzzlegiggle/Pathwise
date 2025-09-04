
import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { structuredOutput, structuredConfig } from "@/lib/llm";
import type { UserProfile } from "@/types/user-profile";
import { prisma } from "@/lib/db";


export type SimilarPerson = {
  name: string;            // e.g., "A., 26" (anonymized initial + age if provided by model)
  from: string;            // prior role/title
  to: string;              // new role/title
  time: string;            // duration, e.g., "5 months"
  pay: string;             // compact pay summary, e.g., "$38k → $48k"
  note?: string;           // short tactic, e.g., "Portfolio + referral"
  sources?: { label: string; url?: string }[]; // optional
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId: bigint | number | string | undefined = body?.userId;
    const targets: Array<{ id: string; label: string }> | undefined = body?.targets;

    if (!userId) {
      return NextResponse.json({ error: "Missing required: userId" }, { status: 400 });
    }

    // Build optional role filter
    const roleHints = (targets ?? []).map(t => t.label).slice(0, 4);
    const whereClause = roleHints.length
      ? "WHERE " + roleHints.map(() => "p.to_role LIKE ?").join(" OR ")
      : "";
    const whereParams = roleHints.map(h => `%${h}%`);

    // Choose your distance: L2_DISTANCE or COSINE_DISTANCE
    const distanceFn = "VEC_COSINE_DISTANCE"; // or "COSINE_DISTANCE" if you store normalized vectors

    // Single raw SQL: subquery pulls the candidate's embedding from user_profile
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        p.name,
        p.from_role,
        p.to_role,
        p.time_to_offer,
        p.pay_from,
        p.pay_to,
        p.currency,
        p.note,
        p.sources
      FROM people p
      ${whereClause}
      ORDER BY ${distanceFn}(
        p.resume_embedding,
        (SELECT up.resume_embedding FROM user_profile up WHERE up.user_id = ?)
      ) ASC
      LIMIT 6
      `,
      ...whereParams,
      BigInt(userId as any)
    );

    const people: SimilarPerson[] = (rows ?? []).map((r) => {
      const format = (n: number, cur: string) =>
        new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);

      const currency = r.currency || "USD";
      const pay =
        r.pay_from && r.pay_to ? `${format(r.pay_from, currency)} → ${format(r.pay_to, currency)}` : "—";

      return {
        name: String(r.name ?? "Anon"),
        from: String(r.from_role ?? ""),
        to: String(r.to_role ?? ""),
        time: String(r.time_to_offer ?? "—"),
        pay,
        note: r.note ? String(r.note) : undefined,
        sources: Array.isArray(r.sources) ? r.sources : undefined,
      };
    });

    return NextResponse.json({ people });
  } catch (e: any) {
    console.error("People-like-me API error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
