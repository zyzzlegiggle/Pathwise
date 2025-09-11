import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/google";
import { cookies } from "next/headers";
import { saveTokens } from "@/lib/user-store";
import { getUserFromRequest } from "@/lib/current-user";



export async function GET(req: NextRequest) {
const url = new URL(req.url);
const code = url.searchParams.get("code");
const state = url.searchParams.get("state");
const cookieStore = await cookies(); // await the cookies() Promise
const stored = cookieStore.get("g_oauth_state")?.value;
if (!code || !state || state !== stored) {
return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
}
const client = getOAuthClient();
const { tokens } = await client.getToken(code);
const user = await getUserFromRequest(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const userId = user?.id ?? "";
await saveTokens(Number(userId), tokens as any);
// Optionally redirect to UI page
return NextResponse.redirect(new URL("/app", req.url));
}