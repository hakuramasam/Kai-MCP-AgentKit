/**
 * AI-powered tools via OpenRouter:
 *   - text_analysis: deep NLP (sentiment, entities, summary, keywords, readability)
 *   - code_review: static analysis + security + best-practice feedback
 *   - image_caption: vision AI description of an image URL
 *
 * All calls use OpenRouter with model auto-selection (fast + cost-efficient models).
 */

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

function getApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  maxTokens = 1024,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentkit.app",
      "X-Title": "AgentKit",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message.content ?? "";
}

// ─── Text Analysis ────────────────────────────────────────────────────────────

export type TextAnalysisType =
  | "sentiment"
  | "entities"
  | "summarize"
  | "keywords"
  | "full";

export interface TextAnalysisResult {
  analysisType: TextAnalysisType;
  inputLength: number;
  result: unknown;
  model: string;
}

export async function analyzeTextWithAI(
  text: string,
  analysisType: TextAnalysisType = "full",
): Promise<TextAnalysisResult> {
  const truncated = text.slice(0, 8000);

  const prompts: Record<TextAnalysisType, string> = {
    sentiment: `Analyze the sentiment of the following text. Return a JSON object with: sentiment ("positive"|"neutral"|"negative"), confidence (0-1), score (-1 to 1), tone (array of descriptors like "enthusiastic", "cautious", etc.), and a one-sentence explanation.\n\nText:\n${truncated}`,
    entities: `Extract named entities from the following text. Return a JSON object with arrays for: people, organizations, locations, dates, products, technologies, and other (anything notable that doesn't fit above). Each entry should be a string.\n\nText:\n${truncated}`,
    summarize: `Summarize the following text. Return a JSON object with: summary (2-4 sentences), keyPoints (array of 3-5 bullet strings), wordCount (integer), readingTimeSeconds (integer), and mainTopic (string).\n\nText:\n${truncated}`,
    keywords: `Extract the most important keywords and phrases from the following text. Return a JSON object with: keywords (array of strings, ordered by importance), topics (array of broader topic categories), and dominantTheme (string).\n\nText:\n${truncated}`,
    full: `Perform a comprehensive analysis of the following text. Return a JSON object with:
- sentiment: { label: "positive"|"neutral"|"negative", score: -1 to 1, confidence: 0-1 }
- entities: { people: [], organizations: [], locations: [], technologies: [] }
- summary: string (2-3 sentences)
- keywords: string[] (top 8)
- readability: { level: "elementary"|"intermediate"|"advanced"|"expert", avgSentenceLength: number }
- wordCount: number
- mainTopic: string

Text:\n${truncated}`,
  };

  const systemPrompt =
    "You are a precise text analysis engine. Always return valid JSON only — no markdown, no explanation, no code fences. Output raw JSON that can be directly parsed.";

  const raw = await callOpenRouter(
    "anthropic/claude-haiku-4",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompts[analysisType] },
    ],
    1024,
  );

  let parsed: unknown;
  try {
    // Strip possible markdown code fences
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { rawOutput: raw };
  }

  return {
    analysisType,
    inputLength: text.length,
    result: parsed,
    model: "claude-haiku-4",
  };
}

// ─── Code Review ──────────────────────────────────────────────────────────────

export type ReviewFocus = "security" | "quality" | "performance" | "all";

export interface CodeReviewResult {
  language: string;
  linesOfCode: number;
  overallScore: number;        // 1-10
  summary: string;
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low" | "info";
    category: string;
    description: string;
    suggestion?: string;
    line?: number;
  }>;
  strengths: string[];
  improvements: string[];
  securityFlags: string[];
  model: string;
}

export async function reviewCodeWithAI(
  code: string,
  language = "auto-detect",
  focus: ReviewFocus = "all",
): Promise<CodeReviewResult> {
  const truncated = code.slice(0, 12_000);
  const lines = truncated.split("\n").length;

  const focusInstructions: Record<ReviewFocus, string> = {
    security: "Focus heavily on security vulnerabilities: injection attacks, hardcoded secrets, insecure dependencies, unsafe deserialization, XSS, CSRF, authentication flaws.",
    quality: "Focus on code quality: readability, naming conventions, DRY principles, complexity, test coverage considerations, documentation.",
    performance: "Focus on performance: algorithmic complexity (Big-O), memory leaks, N+1 queries, unnecessary computation, caching opportunities.",
    all: "Cover security vulnerabilities, code quality, performance concerns, and best practices equally.",
  };

  const prompt = `Review the following ${language} code. ${focusInstructions[focus]}

Return a JSON object with:
- language: string (detected or given)
- overallScore: number (1-10, where 10 is production-ready)
- summary: string (2-3 sentence overall assessment)
- issues: array of { severity: "critical"|"high"|"medium"|"low"|"info", category: string, description: string, suggestion: string, line?: number }
- strengths: string[] (what's done well, max 5)
- improvements: string[] (top recommendations, max 5)
- securityFlags: string[] (list any security concerns, empty array if none)

Code:
\`\`\`${language}
${truncated}
\`\`\``;

  const raw = await callOpenRouter(
    "anthropic/claude-sonnet-4-5",
    [
      {
        role: "system",
        content:
          "You are a senior software engineer specializing in code security and quality. Return only valid JSON — no markdown, no explanation outside the JSON.",
      },
      { role: "user", content: prompt },
    ],
    2048,
  );

  let parsed: Partial<CodeReviewResult>;
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned) as Partial<CodeReviewResult>;
  } catch {
    // Return a degraded result if JSON parsing fails
    parsed = {
      summary: raw.slice(0, 500),
      issues: [],
      strengths: [],
      improvements: [],
      securityFlags: [],
      overallScore: 0,
    };
  }

  return {
    language: parsed.language ?? language,
    linesOfCode: lines,
    overallScore: parsed.overallScore ?? 0,
    summary: parsed.summary ?? "Analysis unavailable",
    issues: parsed.issues ?? [],
    strengths: parsed.strengths ?? [],
    improvements: parsed.improvements ?? [],
    securityFlags: parsed.securityFlags ?? [],
    model: "claude-sonnet-4-5",
  };
}

// ─── Image Captioning ─────────────────────────────────────────────────────────

export interface ImageCaptionResult {
  imageUrl: string;
  caption: string;
  description: string;
  detectedObjects: string[];
  detectedText: string | null;
  colors: string[];
  mood: string;
  categories: string[];
  contentWarning: boolean;
  model: string;
}

export async function captionImageWithAI(
  imageUrl: string,
): Promise<ImageCaptionResult> {
  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Image URL must use http or https");
  }

  const prompt = `Analyze this image in detail. Return a JSON object with:
- caption: string (one concise sentence describing the image)
- description: string (detailed 2-4 sentence description)
- detectedObjects: string[] (list of identified objects/subjects)
- detectedText: string | null (any visible text in the image, null if none)
- colors: string[] (dominant colors, e.g. ["deep blue", "white", "gold"])
- mood: string (overall mood/atmosphere, e.g. "serene", "energetic", "dark")
- categories: string[] (e.g. ["nature", "landscape", "photography"])
- contentWarning: boolean (true if image contains potentially sensitive content)

Return only valid JSON.`;

  const raw = await callOpenRouter(
    "google/gemini-2.0-flash-001",
    [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
    1024,
  );

  let result: Partial<ImageCaptionResult>;
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    result = JSON.parse(cleaned) as Partial<ImageCaptionResult>;
  } catch {
    result = {
      caption: raw.slice(0, 200),
      description: raw,
      detectedObjects: [],
      detectedText: null,
      colors: [],
      mood: "unknown",
      categories: [],
      contentWarning: false,
    };
  }

  return {
    imageUrl,
    caption: result.caption ?? "No caption available",
    description: result.description ?? "",
    detectedObjects: result.detectedObjects ?? [],
    detectedText: result.detectedText ?? null,
    colors: result.colors ?? [],
    mood: result.mood ?? "unknown",
    categories: result.categories ?? [],
    contentWarning: result.contentWarning ?? false,
    model: "gemini-2.0-flash",
  };
}
