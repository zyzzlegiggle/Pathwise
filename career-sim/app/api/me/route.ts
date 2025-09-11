import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { getUserFromRequest } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    return NextResponse.json({ user }, { status: 200 });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
