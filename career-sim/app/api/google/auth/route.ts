import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";


export async function GET() {
    const state = randomUUID();
    const cookieStore = await cookies(); // await the cookies() Promise
    cookieStore.set("g_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/" });
    const url = getAuthUrl(state);
    return NextResponse.json({ url });
}