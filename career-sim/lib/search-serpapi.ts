type SerpApiResult = {
  organic_results?: Array<{ link?: string }>;
};

export async function serpSearchUrls(query: string, num = 6): Promise<string[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    num: String(num),
    hl: "en",
    gl: "us",
    api_key: process.env.SERPAPI_KEY!,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as SerpApiResult;
  const links = (data.organic_results ?? []).map(r => r.link).filter(Boolean) as string[];
  // unique + basic noise filter
  const dedup = Array.from(new Set(links));
  return dedup.filter(u => !/\.(pdf|pptx?)$/i.test(u));
}