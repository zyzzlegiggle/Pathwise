// lib/serpapi.ts
type SerpApiResult = {
  organic_results?: Array<{ link?: string }>;
};

export async function serpSearchUrls(query: string, num = 4): Promise<string[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      num: String(num),        // ↓ default 4 instead of 8
      hl: "en",
      gl: "us",
      api_key: process.env.SERPAPI_KEY!,
    });

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SerpApiResult;
    const links = (data.organic_results ?? []).map(r => r.link).filter(Boolean) as string[];
    const dedup = Array.from(new Set(links));
    return dedup.filter(u => !/\.(pdf|pptx?)$/i.test(u));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
