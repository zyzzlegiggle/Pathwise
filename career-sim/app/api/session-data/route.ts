// app/api/session-data/route.ts
import { upsertSessionData } from "@/lib/session-store";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { threadId, data } = await req.json();
  if (!threadId || typeof data !== "object") {
    return NextResponse.json({ error: "threadId and data required" }, { status: 400 });
  }
  upsertSessionData(threadId, data);
  return NextResponse.json({ ok: true });
}
