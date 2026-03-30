/**
 * Vector memory — Supabase pgvector for semantic recall.
 *
 * Supabase table required (run once in Supabase SQL editor):
 *
 *   create extension if not exists vector;
 *
 *   create table agent_memory_vectors (
 *     id          uuid primary key default gen_random_uuid(),
 *     fid         integer not null,
 *     content     text not null,
 *     category    text not null default 'general',
 *     importance  integer not null default 5,
 *     embedding   vector(1536),
 *     created_at  timestamptz default now() not null
 *   );
 *
 *   create index on agent_memory_vectors
 *     using ivfflat (embedding vector_cosine_ops)
 *     with (lists = 100);
 *
 *   create index on agent_memory_vectors (fid);
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/features/agent/lib/supabase";
import { generateEmbedding } from "@/features/agent/lib/embeddings";
import { saveMemory, getMemories } from "@/db/actions/chat-actions";

export const MEMORY_TABLE = "agent_memory_vectors";

export interface MemoryRecord {
  id: string;
  fid: number;
  content: string;
  category: string;
  importance: number;
  similarity?: number;
  created_at: string;
}

/**
 * Save a memory with its vector embedding.
 * Falls back to Postgres-only if Supabase is not configured.
 */
export async function saveMemoryWithEmbedding(params: {
  fid: number;
  content: string;
  category: string;
  importance: number;
}): Promise<void> {
  // Always save to our primary Postgres DB
  await saveMemory(params);

  // Also save to Supabase with vector embedding if configured
  if (!isSupabaseConfigured()) return;

  const embedding = await generateEmbedding(params.content);

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from(MEMORY_TABLE).insert({
      fid: params.fid,
      content: params.content,
      category: params.category,
      importance: params.importance,
      embedding: embedding ? JSON.stringify(embedding) : null,
    });

    if (error) {
      // Table may not exist yet — log but don't crash
      console.warn("Supabase memory insert failed:", error.message);
    }
  } catch (err) {
    console.warn("Supabase memory save error:", err);
  }
}

/**
 * Semantic recall — finds memories most similar to the query.
 * Falls back to keyword search if Supabase/embeddings aren't available.
 */
export async function recallMemoriesSemantic(params: {
  fid: number;
  query: string;
  category?: string;
  limit?: number;
}): Promise<MemoryRecord[]> {
  const { fid, query, category, limit = 5 } = params;

  // Try semantic search via Supabase pgvector
  if (isSupabaseConfigured()) {
    const queryEmbedding = await generateEmbedding(query);

    if (queryEmbedding) {
      try {
        const supabase = getSupabaseAdmin();

        // Use pgvector cosine similarity via RPC function
        const { data, error } = await supabase.rpc("match_memories", {
          query_embedding: JSON.stringify(queryEmbedding),
          match_fid: fid,
          match_category: category && category !== "all" ? category : null,
          match_count: limit,
          match_threshold: 0.3,
        });

        if (!error && data && Array.isArray(data) && data.length > 0) {
          return data as MemoryRecord[];
        }

        // RPC not available — fall back to direct query with similarity
        if (error?.message?.includes("match_memories")) {
          // Function doesn't exist yet — use fallback
          console.warn("match_memories RPC not found, using fallback");
        } else if (error) {
          console.warn("Supabase recall error:", error.message);
        }
      } catch (err) {
        console.warn("Supabase semantic recall failed:", err);
      }
    }
  }

  // Fallback: keyword search on primary Postgres DB
  return keywordFallback({ fid, query, category, limit });
}

/**
 * Keyword-based fallback when pgvector isn't available
 */
async function keywordFallback(params: {
  fid: number;
  query: string;
  category?: string;
  limit: number;
}): Promise<MemoryRecord[]> {
  const memories = await getMemories(params.fid, 50);

  const filtered =
    params.category && params.category !== "all"
      ? memories.filter((m) => m.category === params.category)
      : memories;

  const queryLower = params.query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  // Score by keyword overlap
  const scored = filtered
    .map((m) => {
      const contentLower = m.content.toLowerCase();
      const exactMatch = contentLower.includes(queryLower) ? 3 : 0;
      const wordMatches = queryWords.filter((w) => contentLower.includes(w)).length;
      const score = exactMatch + wordMatches + m.importance * 0.1;
      return { ...m, similarity: score / 10, created_at: m.createdAt.toISOString() };
    })
    .filter((m) => m.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, params.limit);

  return scored;
}

/**
 * Get all memories for a user (for context injection)
 * Returns from primary DB — no embedding needed
 */
export async function getAllMemoriesForContext(
  fid: number,
  limit = 20,
): Promise<Array<{ content: string; category: string; importance: number }>> {
  const memories = await getMemories(fid, limit);
  return memories.map((m) => ({
    content: m.content,
    category: m.category,
    importance: m.importance,
  }));
}

/**
 * SQL to run in Supabase to set up the pgvector match function.
 * Exported as a constant so it can be displayed to the user.
 */
export const SUPABASE_SETUP_SQL = `
-- Enable pgvector
create extension if not exists vector;

-- Memory vectors table
create table if not exists agent_memory_vectors (
  id          uuid primary key default gen_random_uuid(),
  fid         integer not null,
  content     text not null,
  category    text not null default 'general',
  importance  integer not null default 5,
  embedding   vector(1536),
  created_at  timestamptz default now() not null
);

-- Vector similarity index
create index if not exists agent_memory_vectors_embedding_idx
  on agent_memory_vectors
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- FID index for fast per-user queries
create index if not exists agent_memory_vectors_fid_idx
  on agent_memory_vectors (fid);

-- Semantic search function
create or replace function match_memories(
  query_embedding vector(1536),
  match_fid       integer,
  match_category  text,
  match_count     integer default 5,
  match_threshold float default 0.3
)
returns table (
  id          uuid,
  fid         integer,
  content     text,
  category    text,
  importance  integer,
  similarity  float,
  created_at  timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    amv.id,
    amv.fid,
    amv.content,
    amv.category,
    amv.importance,
    1 - (amv.embedding <=> query_embedding) as similarity,
    amv.created_at
  from agent_memory_vectors amv
  where
    amv.fid = match_fid
    and (match_category is null or amv.category = match_category)
    and amv.embedding is not null
    and 1 - (amv.embedding <=> query_embedding) > match_threshold
  order by amv.embedding <=> query_embedding
  limit match_count;
end;
$$;
`.trim();
