import { prisma } from "./db";

export async function setVector(table: "Resume" | "JobText", idField: string, id: number | string, vec: number[]) {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET embedding = VECTOR_FROM_JSON(?) WHERE ${idField} = ?`,
    JSON.stringify(vec), id
  );
}

export async function similarJobs(vec: number[], limit = 20) {
  return prisma.$queryRawUnsafe(`
    SELECT j.id, j.title, j.company, j.location,
           (1 - COSINE_DISTANCE(jt.embedding, VECTOR_FROM_JSON(?))) AS score
    FROM JobText jt JOIN Job j ON j.id = jt.jobId
    ORDER BY score DESC LIMIT ${limit}
  `, JSON.stringify(vec));
}
