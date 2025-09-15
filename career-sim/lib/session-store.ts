import { prisma } from "./db";

export async function getSessionData(threadId: string) {
  if (!threadId) return {};
  const row = await prisma.sessionData.findUnique({ where: { threadId } });
  return row?.data ?? {};
}

/** Shallow merge (object-level). If you need deep merge, do it before calling. */
export async function mergeSessionData(threadId: string, patch: Record<string, unknown>) {
  if (!threadId) throw new Error('threadId required');
  const existing = await getSessionData(threadId);
  const next = { ...(existing as any), ...(patch ?? {}) };
  await prisma.sessionData.upsert({
    where: { threadId },
    create: { threadId, data: next },
    update: { data: next },
  });
  return next;
}

/** Replace the entire JSON blob */
export async function setSessionData(threadId: string, data: Record<string, unknown>) {
  if (!threadId) throw new Error('threadId required');
  await prisma.sessionData.upsert({
    where: { threadId },
    create: { threadId, data },
    update: { data },
  });
  return data;
}
