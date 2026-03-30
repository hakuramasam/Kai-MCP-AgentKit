// ─── OpenRouter / LLM types ───────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: MessageRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ─── Agent types ──────────────────────────────────────────────────────────────

export type AgentRole = "orchestrator" | "weather" | "analyst" | "memory";

export interface AgentConfig {
  id: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // tool names this agent can use
  model?: string;
}

export interface AgentRunResult {
  content: string;
  toolCallCount: number;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// ─── Streaming event types ────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: string }
  | { type: "tool_result"; name: string; result: string }
  | { type: "memory_saved"; content: string }
  | { type: "agent_switch"; from: AgentRole; to: AgentRole }
  | { type: "done"; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: "error"; message: string };

// ─── UI types ─────────────────────────────────────────────────────────────────

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivity?: ToolActivity[];
  isStreaming?: boolean;
  createdAt: Date;
}

export interface ToolActivity {
  name: string;
  status: "running" | "done" | "error";
  args?: string;
  result?: string;
}
