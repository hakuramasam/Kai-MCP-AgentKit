import { callOpenRouter } from "@/features/agent/lib/openrouter";
import { TOOL_DEFINITIONS, executeTool, type ToolExecutorContext } from "@/features/agent/lib/tools";
import type {
  LLMMessage,
  ToolCall,
  AgentRunResult,
  StreamEvent,
  AgentConfig,
} from "@/features/agent/types";

const MAX_TOOL_ROUNDS = 8; // prevent infinite loops

/**
 * Run an agent to completion (non-streaming, used by worker agents)
 */
export async function runAgent(
  config: AgentConfig,
  userMessages: LLMMessage[],
  ctx: ToolExecutorContext,
): Promise<AgentRunResult> {
  const allowedTools = TOOL_DEFINITIONS.filter((t) =>
    config.tools.includes(t.function.name),
  );

  const messages: LLMMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...userMessages,
  ];

  let toolCallCount = 0;
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callOpenRouter({
      model: config.model ?? "openrouter/auto",
      messages,
      tools: allowedTools.length > 0 ? allowedTools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No choices in response");

    if (response.usage) {
      totalUsage.prompt_tokens += response.usage.prompt_tokens;
      totalUsage.completion_tokens += response.usage.completion_tokens;
    }

    const assistantMsg = choice.message;
    messages.push({
      role: "assistant",
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    });

    // If no tool calls, we're done
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        content: assistantMsg.content ?? "",
        toolCallCount,
        usage: totalUsage,
      };
    }

    // Execute all tool calls
    const toolResults = await Promise.all(
      assistantMsg.tool_calls.map(async (tc: ToolCall) => {
        toolCallCount++;
        const result = await executeTool(tc.function.name, tc.function.arguments, ctx);
        return {
          role: "tool" as const,
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        };
      }),
    );

    messages.push(...toolResults);
  }

  // Exceeded max rounds — return last content or fallback
  const last = messages.filter((m) => m.role === "assistant").at(-1);
  return {
    content: last?.content ?? "I reached the maximum number of tool calls.",
    toolCallCount,
    usage: totalUsage,
  };
}

/**
 * Streaming agent runner — emits StreamEvents via callback
 */
export async function runAgentStream(
  config: AgentConfig,
  userMessages: LLMMessage[],
  ctx: ToolExecutorContext,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const allowedTools = TOOL_DEFINITIONS.filter((t) =>
    config.tools.includes(t.function.name),
  );

  const messages: LLMMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...userMessages,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Use non-streaming for tool-calling rounds, stream final response
    const response = await callOpenRouter({
      model: config.model ?? "openrouter/auto",
      messages,
      tools: allowedTools.length > 0 ? allowedTools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      emit({ type: "error", message: "No response from model" });
      return;
    }

    const msg = choice.message;

    // No tool calls — stream the final content token by token
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const content = msg.content ?? "";
      // Simulate token streaming for smooth UX
      const words = content.split(" ");
      for (let i = 0; i < words.length; i++) {
        const token = i === 0 ? words[i] : " " + words[i];
        emit({ type: "token", text: token });
        // Small yield to allow the stream to flush
        await new Promise((r) => setTimeout(r, 0));
      }
      emit({ type: "done", usage: response.usage });
      return;
    }

    // Execute tool calls
    messages.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
    });

    const toolResults: LLMMessage[] = [];

    for (const tc of msg.tool_calls) {
      emit({ type: "tool_start", name: tc.function.name, args: tc.function.arguments });

      try {
        // Handle delegation specially
        if (tc.function.name === "delegate_to_agent") {
          const args = JSON.parse(tc.function.arguments) as {
            agent: "weather" | "analyst";
            task: string;
            context?: string;
          };
          emit({ type: "agent_switch", from: config.id, to: args.agent });

          const { WORKER_AGENTS } = await import("@/features/agent/orchestrator");
          const workerConfig = WORKER_AGENTS[args.agent];
          if (workerConfig) {
            const workerMessages: LLMMessage[] = [
              { role: "user", content: `${args.task}${args.context ? `\n\nContext: ${args.context}` : ""}` },
            ];
            const workerResult = await runAgent(workerConfig, workerMessages, ctx);
            emit({ type: "tool_result", name: tc.function.name, result: workerResult.content });
            toolResults.push({
              role: "tool",
              content: workerResult.content,
              tool_call_id: tc.id,
              name: tc.function.name,
            });
          }
        } else {
          const result = await executeTool(tc.function.name, tc.function.arguments, ctx);

          // Emit memory events
          if (tc.function.name === "save_memory") {
            try {
              const args = JSON.parse(tc.function.arguments) as { content: string };
              emit({ type: "memory_saved", content: args.content });
            } catch {
              // ignore
            }
          }

          emit({ type: "tool_result", name: tc.function.name, result });
          toolResults.push({
            role: "tool",
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emit({ type: "tool_result", name: tc.function.name, result: `Error: ${errMsg}` });
        toolResults.push({
          role: "tool",
          content: `Error: ${errMsg}`,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
    }

    messages.push(...toolResults);
  }

  emit({ type: "error", message: "Exceeded maximum tool call rounds" });
}
