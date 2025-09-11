// lib/auth.ts
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev_secret_change_me");
const ISSUER = "career-agent";
const AUDIENCE = "career-agent-users";
const COOKIE_NAME = "auth_token";

// 7 days (adjust as you like)
const EXP_SECONDS = 60 * 60 * 24 * 7;

export async function signJwt(payload: Record<string, any>) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${EXP_SECONDS}s`)
    .sign(secret);
}

export async function verifyJwt(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return payload;
}


const DEFAULT_EXP_SECONDS = 60 * 60 * 24 * 7;      // 7 days
const LONG_EXP_SECONDS = 60 * 60 * 24 * 30;        // 30 days

export function getAuthCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // If remember=false -> session cookie (no maxAge)
    ...(remember ? { maxAge: LONG_EXP_SECONDS } : {}),
  };
}

export const authCookie = {
  name: "auth_token",
};
