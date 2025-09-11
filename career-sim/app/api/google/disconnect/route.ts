import { getUserFromRequest } from "@/lib/current-user";
import { clearTokens } from "@/lib/user-store";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req : NextRequest) {
const user = await getUserFromRequest(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
await clearTokens(Number(user.id));
return NextResponse.json({ ok: true });
}