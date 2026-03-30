/**
 * Generate text embeddings using OpenAI text-embedding-3-small via OpenRouter.
 * Falls back gracefully if no API key is set.
 */

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export { EMBEDDING_DIMENSIONS };

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentkit.app",
        "X-Title": "AgentKit",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8191), // max token limit
      }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("Failed to generate embedding:", err);
    return null;
  }
}

/**
 * Cosine similarity between two vectors (fallback for keyword search)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
