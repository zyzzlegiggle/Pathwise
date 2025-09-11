import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authCookie, getAuthCookieOptions, signJwt } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password, name, country, remember } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name, country, passwordHash },
      select: { user_id: true, email: true, name: true },
    });

    // make it JSON-safe
    const safeUser = { ...user, user_id: user.user_id.toString() };

    // sign with a string sub (you already do this)
    const token = await signJwt({ sub: safeUser.user_id, email: safeUser.email, name: safeUser.name });

    const res = NextResponse.json({ ok: true, user: safeUser });
    res.cookies.set(authCookie.name, token, getAuthCookieOptions(Boolean(remember)));
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
