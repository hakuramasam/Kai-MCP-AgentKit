import { NextRequest } from "next/server";
import { ORCHESTRATOR_CONFIG } from "@/features/agent/orchestrator";
import { runAgentStream } from "@/features/agent/lib/agent-runner";
import { getMemories, saveMessage, touchSession } from "@/db/actions/chat-actions";
import {
  saveMemoryWithEmbedding,
  recallMemoriesSemantic,
  getAllMemoriesForContext,
} from "@/features/agent/lib/vector-memory";
import type { LLMMessage, StreamEvent } from "@/features/agent/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messages: Array<{ role: string; content: string }>;
      sessionId: string;
      fid: number;
    };

    const { messages, sessionId, fid } = body;

    if (!messages || !sessionId || !fid) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check for API key
    if (!process.env.OPENROUTER_API_KEY) {
      // Return a helpful demo response when no key is configured
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const demoMsg = "AgentKit is ready! To activate the AI agent, add your OPENROUTER_API_KEY to the environment variables. Get a free key at openrouter.ai — it supports 200+ models including GPT-4o, Claude, Gemini, and more.";
          const words = demoMsg.split(" ");
          let i = 0;
          const interval = setInterval(() => {
            if (i >= words.length) {
              const done: StreamEvent = { type: "done" };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
              controller.close();
              clearInterval(interval);
              return;
            }
            const evt: StreamEvent = { type: "token", text: (i === 0 ? "" : " ") + words[i] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
            i++;
          }, 40);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Load memories for context injection (top memories by importance)
    const contextMemories = await getAllMemoriesForContext(fid, 15);
    const memoryContext =
      contextMemories.length > 0
        ? `\n\nUser memories:\n${contextMemories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
        : "";

    // Build LLM messages with memory context injected into the latest user message
    const llmMessages: LLMMessage[] = messages.map((m, i) => ({
      role: m.role as LLMMessage["role"],
      content:
        i === messages.length - 1 && m.role === "user" && memoryContext
          ? `${m.content}${memoryContext}`
          : m.content,
    }));

    // Stream response
    const encoder = new TextEncoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        function emit(event: StreamEvent) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            if (event.type === "token") {
              fullContent += event.text;
            }
          } catch {
            // controller already closed
          }
        }

        try {
          await runAgentStream(
            ORCHESTRATOR_CONFIG,
            llmMessages,
            {
              fid,
              memories: contextMemories,
              // Semantic save — embeds content and stores in Supabase + Postgres
              onMemorySave: async (content, category, importance) => {
                await saveMemoryWithEmbedding({ fid, content, category, importance });
              },
              // Semantic recall — pgvector similarity search with keyword fallback
              onMemoryRecall: async (query, category) => {
                const results = await recallMemoriesSemantic({
                  fid,
                  query,
                  category: category === "all" ? undefined : category,
                  limit: 5,
                });
                return results.map((r) => ({
                  content: r.content,
                  category: r.category,
                  similarity: r.similarity,
                }));
              },
            },
            emit,
          );

          // Persist assistant message
          if (fullContent) {
            await saveMessage({
              sessionId,
              fid,
              role: "assistant",
              content: fullContent,
            });
            await touchSession(sessionId);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          emit({ type: "error", message: msg });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
