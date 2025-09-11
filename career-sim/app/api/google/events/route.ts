import { NextRequest, NextResponse } from "next/server";
import { upsertEvent, deleteEvent } from "@/lib/google";
import { loadTokens } from "@/lib/user-store";
import { getUserFromRequest } from "@/lib/current-user";


const CALENDAR_ID = "primary"; // or store per-user


export async function POST(req: NextRequest) {
// body: { eventId?, title, description?, startISO, endISO, timezone?, idempotencyKey? }
const user = await getUserFromRequest(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const body = await req.json();
const tokens = await loadTokens(Number(user.id));
if (!tokens) return NextResponse.json({ error: "Not connected" }, { status: 401 });
const res = await upsertEvent(tokens, CALENDAR_ID, body, body.eventId);
return NextResponse.json({ id: res.data.id });
}


export async function DELETE(req: NextRequest) {
const user = await getUserFromRequest(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const { searchParams } = new URL(req.url);
const id = searchParams.get("id");
if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
const tokens = await loadTokens(Number(user.id));
if (!tokens) return NextResponse.json({ error: "Not connected" }, { status: 401 });
await deleteEvent(tokens, CALENDAR_ID, id);
return NextResponse.json({ ok: true });
}