/**
 * Brave Search API integration.
 * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 *
 * Requires BRAVE_SEARCH_API_KEY in .env
 * Free tier: 2,000 queries/month — https://api.search.brave.com/app/subscriptions
 */

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string; // e.g. "2 hours ago", "3 days ago"
  isNews?: boolean;
}

export interface BraveSearchResponse {
  query: string;
  results: BraveSearchResult[];
  searchType: "brave" | "fallback";
  totalResults?: number;
}

export function isBraveConfigured(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

export async function braveSearch(
  query: string,
  maxResults = 5,
): Promise<BraveSearchResponse> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return fallbackSearch(query, maxResults);
  }

  const url = new URL(BRAVE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(maxResults, 10)));
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("text_decorations", "false");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    // No cache — always fresh
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Brave Search API error ${res.status}: ${errorText}`);
  }

  const data = await res.json() as BraveAPIResponse;

  const results: BraveSearchResult[] = (data.web?.results ?? [])
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description ?? r.extra_snippets?.[0] ?? "",
      age: r.age ?? undefined,
      isNews: false,
    }));

  // Append news results if available and we still have room
  const newsResults = data.news?.results ?? [];
  if (newsResults.length > 0 && results.length < maxResults) {
    const remaining = maxResults - results.length;
    for (const n of newsResults.slice(0, remaining)) {
      results.push({
        title: n.title,
        url: n.url,
        description: n.description ?? "",
        age: n.age ?? undefined,
        isNews: true,
      });
    }
  }

  return {
    query,
    results,
    searchType: "brave",
    totalResults: data.query?.total_count ?? results.length,
  };
}

// ─── Fallback when no API key ─────────────────────────────────────────────────

function fallbackSearch(query: string, maxResults: number): BraveSearchResponse {
  return {
    query,
    results: [
      {
        title: `Search results for "${query}"`,
        url: `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
        description:
          "Brave Search API key not configured. Add BRAVE_SEARCH_API_KEY to .env for live results. Get a free key at api.search.brave.com (2,000 queries/month free).",
      },
    ].slice(0, maxResults),
    searchType: "fallback",
  };
}

// ─── Brave API response types ─────────────────────────────────────────────────

interface BraveAPIResponse {
  query?: {
    original?: string;
    total_count?: number;
  };
  web?: {
    results: Array<{
      title: string;
      url: string;
      description?: string;
      extra_snippets?: string[];
      age?: string;
    }>;
  };
  news?: {
    results: Array<{
      title: string;
      url: string;
      description?: string;
      age?: string;
    }>;
  };
}
