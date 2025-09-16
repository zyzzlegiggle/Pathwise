// db.ts (unchanged where you export `prisma`)
// import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function getSessionData(threadId: string): Promise<Prisma.JsonObject> {
  if (!threadId) return {};
  const row = await prisma.sessionData.findUnique({ where: { threadId } });
  // Prisma returns JsonValue; we only store objects, so coerce to JsonObject
  return (row?.data ?? {}) as Prisma.JsonObject;
}

/** Shallow merge (object-level). If you need deep merge, do it before calling. */
export async function mergeSessionData(
  threadId: string,
  patch: Prisma.InputJsonObject // <- accepts plain JS objects
) {
  if (!threadId) throw new Error("threadId required");
  const existing = await getSessionData(threadId); // JsonObject
  const next: Prisma.InputJsonObject = { ...(existing as Prisma.InputJsonObject), ...(patch ?? {}) };

  await prisma.sessionData.upsert({
    where: { threadId },
    create: { threadId, data: next },  // <- InputJsonValue/Object is valid here
    update: { data: next },
  });
  return next;
}

/** Replace the entire JSON blob */
export async function setSessionData(
  threadId: string,
  data: Prisma.InputJsonValue // <- can be object/array/primitive/null
) {
  if (!threadId) throw new Error("threadId required");
  await prisma.sessionData.upsert({
    where: { threadId },
    create: { threadId, data },
    update: { data },
  });
  return data;
}
