/**
 * URL fetcher for the fetch_url agent tool.
 *
 * Fetches a URL, strips HTML to clean readable text, and enforces a
 * character limit so it fits cleanly in an LLM context window.
 */

const MAX_CONTENT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 10_000;

export interface FetchUrlResult {
  url: string;
  title?: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  contentType: string;
  fetchedAt: string;
}

export async function fetchUrl(url: string): Promise<FetchUrlResult> {
  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  // Block private/internal IPs (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Fetching internal/private network addresses is not allowed.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "AgentKit/1.0 (summarizer bot; +https://agentkit.neynar.app)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${parsed.toString()}`);
  }

  const contentType = res.headers.get("content-type") ?? "text/html";
  const rawBody = await res.text();

  let content: string;
  let title: string | undefined;

  if (contentType.includes("application/json")) {
    // Pretty-print JSON — LLM can read it directly
    try {
      content = JSON.stringify(JSON.parse(rawBody), null, 2);
    } catch {
      content = rawBody;
    }
  } else if (contentType.includes("text/plain")) {
    content = rawBody;
  } else {
    // HTML → strip to readable text
    const extracted = htmlToText(rawBody);
    title = extracted.title;
    content = extracted.text;
  }

  const truncated = content.length > MAX_CONTENT_CHARS;
  const finalContent = truncated ? content.slice(0, MAX_CONTENT_CHARS) + "\n\n[... content truncated]" : content;

  return {
    url: parsed.toString(),
    title,
    content: finalContent,
    contentLength: content.length,
    truncated,
    contentType: contentType.split(";")[0]?.trim() ?? "text/html",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── HTML → plain text ────────────────────────────────────────────────────────

function htmlToText(html: string): { text: string; title?: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  // Remove script, style, nav, footer, header, aside blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Block-level elements → newlines
  text = text
    .replace(/<\/?(h[1-6]|p|div|section|article|main|li|tr|br|blockquote)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody|thead|tfoot)[^>]*>/gi, "\n");

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");

  // Collapse excessive whitespace / blank lines
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (arr[i - 1]?.length ?? 1) > 0) // keep single blank lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, title };
}
