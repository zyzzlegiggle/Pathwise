/* scripts/seed_resources.ts
 * Seed resources from free catalogs:
 * - edX Discovery API (public)
 * - Coursera sitemap (public; shallow scrape of <title> & meta)
 * - (optional) YouTube Data API v3 for curated queries
 *
 * Run:  npx ts-node scripts/seed_resources.ts
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { prisma } from '@/lib/db';
import { embedText } from '@/lib/embed';

type ResRow = {
  title: string;
  provider: string;
  url: string;
  hours_estimate?: number | null;
  description?: string | null;
  skill_targets?: string[];
};

async function upsertWithEmbedding(r: ResRow) {
  // dedupe by URL
  const existing = await prisma.resource.findFirst({ where: { url: r.url }, select: { resource_id: true }});
  const rec = existing
    ? await prisma.resource.update({
        where: { resource_id: existing.resource_id },
        data: {
          title: r.title,
          provider: r.provider,
          hours_estimate: r.hours_estimate ?? null,
          description: r.description ?? null,
          skill_targets: r.skill_targets ?? [],
          url: r.url,
        },
      })
    : await prisma.resource.create({
        data: {
          title: r.title,
          provider: r.provider,
          url: r.url,
          hours_estimate: r.hours_estimate ?? null,
          description: r.description ?? null,
          cost: 0 as any,
          skill_targets: r.skill_targets ?? [],
        },
      });

  // embed once
  try {
    const vec = await embedText([r.title, r.description || ''].join('\n'));
    await prisma.$executeRawUnsafe(
      `UPDATE resources SET embedding = CAST(? AS VECTOR) WHERE resource_id = ?`,
      JSON.stringify(vec),
      rec.resource_id.toString()
    );
  } catch (e) {
    console.warn('Embed failed for', r.url, e);
  }
}

// load canonical skills to tag resources
async function loadSkillLexicon() {
  const skills = await prisma.skillCatalog.findMany({ select: { skill_name: true, aliases: true }});
  return skills.map(s => ({
    canonical: s.skill_name,
    tokens: [s.skill_name, ...((Array.isArray(s.aliases) ? s.aliases : []) as string[])].map(x => x.toLowerCase()),
  }));
}
function tagSkills(text: string, lex: {canonical: string; tokens: string[]}[]) {
  const t = text.toLowerCase();
  const out = new Set<string>();
  for (const s of lex) if (s.tokens.some(tok => t.includes(tok))) out.add(s.canonical);
  return Array.from(out).slice(0, 8);
}

/* -------- edX Discovery (public) -------- */
async function seedEdx(limit = 60) {
  // public discovery (page_size capped; we page twice)
  const urls = [
    'https://www.edx.org/api/catalog/v1/courses/?page_size=50',
    'https://www.edx.org/api/catalog/v1/courses/?page_size=50&page=2',
  ];
  const lex = await loadSkillLexicon();
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) { console.warn('edX fetch failed', u, res.status); continue; }
    const j: any = await res.json();
    for (const c of (j?.results || []).slice(0, limit)) {
      const title = c?.name || c?.title;
      const url = c?.marketing_url || c?.course_about || c?.associated_programs_url || '';
      if (!title || !url) continue;
      const desc = c?.short_description || c?.full_description || '';
      // edX "effort" often like "5–7 hours per week"; fallback 8h
      const effort = typeof c?.effort === 'string' ? c.effort : '';
      const hours = /(\d+)\s*-\s*(\d+)/.test(effort)
        ? Math.round((Number(RegExp.$1) + Number(RegExp.$2)) / 2)
        : (/(\d+)/.test(effort) ? Number(RegExp.$1) : 8);
      const skills = tagSkills(`${title}\n${desc}`, lex);
      await upsertWithEmbedding({
        title,
        provider: 'edX',
        url,
        hours_estimate: Number.isFinite(hours) ? hours : 8,
        description: desc?.slice(0, 600) ?? '',
        skill_targets: skills,
      });
    }
  }
}

/* -------- Coursera sitemap (public) -------- */
async function seedCourseraFromSitemap(maxCourses = 40) {
  const sm = 'https://www.coursera.org/sitemap~www~courses.xml';
  const r = await fetch(sm);
  if (!r.ok) { console.warn('Coursera sitemap fetch failed'); return; }
  const xml = await r.text();
  const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map(m => m[1]).filter(u => /coursera\.org\/learn\//.test(u));
  const pick = locs.slice(0, maxCourses);
  const lex = await loadSkillLexicon();

  for (const url of pick) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (seed script)' }});
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const desc = $('meta[name="description"]').attr('content') || '';
      // try to estimate hours from page text; fallback 10
      const txt = $('body').text();
      const m = txt.match(/(\d+)\s*(hours|hrs|hour)/i);
      const hours = m ? Number(m[1]) : 10;
      const skills = tagSkills(`${title}\n${desc}`, lex);
      if (title) {
        await upsertWithEmbedding({
          title,
          provider: 'Coursera',
          url,
          hours_estimate: Number.isFinite(hours) ? hours : 10,
          description: desc?.slice(0, 600) ?? '',
          skill_targets: skills,
        });
      }
    } catch (e) {
      console.warn('Coursera parse fail', url, e);
    }
  }
}


async function main() {
  console.log('Seeding resources…');
  await seedEdx(60);
  await seedCourseraFromSitemap(40);
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
