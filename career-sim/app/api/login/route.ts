import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authCookie, signJwt } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { user_id: true, email: true, name: true, passwordHash: true },
  });

  const ok = user && user.passwordHash && await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });

  const safeUser = {
    user_id: user!.user_id.toString(),
    email: user!.email,
    name: user!.name,
  };

  const token = await signJwt({ sub: safeUser.user_id, email: safeUser.email, name: safeUser.name });

  const res = NextResponse.json({ ok: true, user: safeUser });
  res.cookies.set(authCookie.name, token, authCookie.options);
  return res;

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
