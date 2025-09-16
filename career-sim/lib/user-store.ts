import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { GoogleTokens } from "./google";


export async function saveTokens(userId: number, tokens: GoogleTokens, accountEmail?: string, scope?: string) {
  await prisma.user.update({
    where: { user_id: userId },
    data: {
      googleTokens: tokens as any,
      googleAccountEmail: accountEmail ?? undefined,
      googleScope: scope ?? tokens.scope ?? undefined,
      googleTokenUpdatedAt: new Date(),
    },
  });
}

export async function loadTokens(userId: number): Promise<GoogleTokens | null> {
  const u = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { googleTokens: true },
  });
  return (u?.googleTokens ?? null) as any;
}

export async function setCalendarId(userId: bigint, calendarId: string) {
  await prisma.user.update({
    where: { user_id: userId },
    data: { googleCalendarId: calendarId },
  });
}

export async function getCalendarId(userId: bigint): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { googleCalendarId: true },
  });
  return u?.googleCalendarId ?? null;
}

export async function clearTokens(userId: number) {
  await prisma.user.update({
    where: { user_id: userId },
    data: {
      googleTokens: Prisma.DbNull,
      googleCalendarId: null,
      googleAccountEmail: null,
      googleScope: null,
      googleTokenUpdatedAt: null,
    },
  });
}
