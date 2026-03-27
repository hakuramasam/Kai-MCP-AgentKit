import type { LLMMessage, ToolDefinition, ToolCall } from "@/features/agent/types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/auto";

export interface OpenRouterRequest {
  model?: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return key;
}

/**
 * Non-streaming OpenRouter call — returns full response
 */
export async function callOpenRouter(req: OpenRouterRequest): Promise<OpenRouterResponse> {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentkit.app",
      "X-Title": "AgentKit",
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      messages: req.messages,
      tools: req.tools,
      tool_choice: req.tools ? (req.tool_choice ?? "auto") : undefined,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.max_tokens ?? 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  return response.json() as Promise<OpenRouterResponse>;
}

/**
 * Streaming OpenRouter call — yields token chunks via ReadableStream
 */
export async function callOpenRouterStream(
  req: OpenRouterRequest,
  onToken: (text: string) => void,
  onToolCall: (toolCall: ToolCall) => void,
  onDone: (usage?: { prompt_tokens: number; completion_tokens: number }) => void,
): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentkit.app",
      "X-Title": "AgentKit",
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      messages: req.messages,
      tools: req.tools,
      tool_choice: req.tools ? (req.tool_choice ?? "auto") : undefined,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.max_tokens ?? 2048,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter stream error ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullContent = "";
  const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        onDone();
        return fullContent;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string;
          }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        const delta = parsed.choices?.[0]?.delta;
        const finishReason = parsed.choices?.[0]?.finish_reason;

        if (delta?.content) {
          fullContent += delta.content;
          onToken(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = pendingToolCalls.get(tc.index) ?? {
              id: "",
              name: "",
              args: "",
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            pendingToolCalls.set(tc.index, existing);
          }
        }

        if (finishReason === "tool_calls") {
          for (const [, tc] of pendingToolCalls) {
            onToolCall({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args } });
          }
          onDone(parsed.usage);
          return fullContent;
        }

        if (finishReason === "stop" && parsed.usage) {
          onDone(parsed.usage);
          return fullContent;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  onDone();
  return fullContent;
}
