import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embed";

// POST body:
// { nodes: [{name, esco_id?, onet_id?, parent_esco_id?, aliases?:string[]}],
//   clusters: [{name, jd_samples?: string[], required_skill_esco_ids: string[], weights?: number[]}] }
export async function POST(req: NextRequest) {
  const { nodes = [], clusters = [] } = await req.json();

  // 1) Upsert SkillNode tree
  //    First pass: create nodes without parent_id; second pass: set parent_id
  const byEsc: Record<string, bigint> = {};
  for (const n of nodes) {
    const rec = await prisma.skillNode.upsert({
      where: n.esco_id ? { esco_id: n.esco_id } : { id: BigInt(0) }, // dummy when no esco_id
      create: { name: n.name, esco_id: n.esco_id ?? null, onet_id: n.onet_id ?? null, aliases: n.aliases ?? [] },
      update: { name: n.name, onet_id: n.onet_id ?? null, aliases: n.aliases ?? [] },
      select: { id: true, esco_id: true },
    });
    if (rec.esco_id) byEsc[rec.esco_id] = rec.id;
    // embed name + aliases
    const text = [n.name, ...(n.aliases ?? [])].join(" / ");
    const vec = await embedText(text);
    await prisma.$executeRawUnsafe(
      `UPDATE skill_node SET embedding = CAST(? AS VECTOR) WHERE id = ?`,
      JSON.stringify(vec),
      rec.id.toString()
    );
  }
  // parents
  for (const n of nodes) {
    if (!n.esco_id || !n.parent_esco_id) continue;
    const id = byEsc[n.esco_id], pid = byEsc[n.parent_esco_id];
    if (id && pid) {
      await prisma.skillNode.update({ where: { id }, data: { parent_id: pid } });
    }
  }

  // 2) Create role clusters + centroid & required skills
  for (const c of clusters) {
    const rc = await prisma.roleCluster.upsert({
      where: { name: c.name },
      create: { name: c.name },
      update: {},
    });
    // centroid from JD samples (optional)
    if (Array.isArray(c.jd_samples) && c.jd_samples.length) {
      const embs: number[][] = [];
      for (const s of c.jd_samples) embs.push(await embedText(s));
      const dim = embs[0]?.length || 0;
      const mean = Array.from({ length: dim }, (_, i) => embs.reduce((a, v) => a + v[i], 0) / embs.length);
      await prisma.$executeRawUnsafe(
        `UPDATE role_cluster SET centroid = CAST(? AS VECTOR) WHERE cluster_id = ?`,
        JSON.stringify(mean),
        rc.cluster_id.toString()
      );
    }
    // required skills
    const weights = c.weights ?? [];
    for (let i = 0; i < c.required_skill_esco_ids.length; i++) {
      const esco = c.required_skill_esco_ids[i];
      const sid = byEsc[esco];
      if (!sid) continue;
      await prisma.roleClusterSkill.upsert({
        where: { cluster_id_skill_id: { cluster_id: rc.cluster_id, skill_id: sid } },
        create: { cluster_id: rc.cluster_id, skill_id: sid, weight: weights[i] ?? 1.0 },
        update: { weight: weights[i] ?? 1.0 },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
