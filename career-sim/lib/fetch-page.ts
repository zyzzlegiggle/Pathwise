// lib/fetch-page.ts
import * as cheerio from "cheerio";

export type PageSnapshot = { url: string; title?: string; text: string };

export async function fetchSnapshot(url: string): Promise<PageSnapshot | null> {
  // Be polite: simple UA and short timeout via AbortController
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PathExplorerBot/1.0 (+contact@example.com)" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    const title = $("title").first().text().trim();
    const text = ($("main").text() || $("body").text() || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { url, title, text: text.slice(0, 50_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}
