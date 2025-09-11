import { getUserFromRequest } from "@/lib/current-user";
import { loadTokens } from "@/lib/user-store";
import { NextRequest, NextResponse } from "next/server";





export async function GET(req: NextRequest) {
const user = await getUserFromRequest(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const tokens = await loadTokens(Number(user.id));
return NextResponse.json({ connected: !!tokens });
}