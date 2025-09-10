import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    // @ts-ignore - NextRequest is compatible here if you prefer it
    const token = (req as any).cookies?.get?.("auth_token")?.value 
      ?? (globalThis as any).__EDGE_PREV?.cookies?.get?.("auth_token")?.value;

    // If the above looks odd in your runtime, use NextRequest instead:
    // export async function GET(req: NextRequest) { const token = req.cookies.get("auth_token")?.value; }

    // Simpler & reliable version if you switch to NextRequest:
    // import { NextRequest } from "next/server";
    // export async function GET(req: NextRequest) { const token = req.cookies.get("auth_token")?.value; }

    if (!token) return NextResponse.json({ user: null }, { status: 200 });

    const payload = await verifyJwt(token);
    const user = { id: String(payload.sub), email: payload.email, name: payload.name };
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
