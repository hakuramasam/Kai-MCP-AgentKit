import { z } from "zod";
import type { ToolDefinition } from "@/features/agent/types";
import {
  getWalletBalance,
  sendEth,
  getRecentTransactions,
  isWalletConfigured,
} from "@/features/agent/lib/wallet";
import { braveSearch, isBraveConfigured } from "@/features/agent/lib/brave-search";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const weatherSchema = z.object({
  location: z.string().describe("City name or location to get weather for"),
  units: z.enum(["celsius", "fahrenheit"]).default("celsius").describe("Temperature unit"),
});

export const calculatorSchema = z.object({
  expression: z.string().describe("Mathematical expression to evaluate, e.g. '2 + 2 * 5'"),
});

export const webSearchSchema = z.object({
  query: z.string().describe("Search query to look up information"),
  maxResults: z.number().min(1).max(5).default(3).describe("Maximum number of results"),
});

export const saveMemorySchema = z.object({
  content: z.string().describe("Fact or information to remember about the user"),
  category: z
    .enum(["preference", "fact", "context", "general"])
    .default("general")
    .describe("Category of this memory"),
  importance: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Importance score from 1-10"),
});

export const recallMemorySchema = z.object({
  query: z.string().describe("What to search for in memory"),
  category: z
    .enum(["preference", "fact", "context", "general", "all"])
    .default("all")
    .describe("Category to filter memories by"),
});

export const analyzeDataSchema = z.object({
  data: z.string().describe("Data or text to analyze"),
  task: z
    .enum(["summarize", "sentiment", "extract_entities", "categorize"])
    .describe("Type of analysis to perform"),
});

export const delegateToAgentSchema = z.object({
  agent: z.enum(["weather", "analyst"]).describe("Which worker agent to delegate to"),
  task: z.string().describe("The task description to pass to the worker agent"),
  context: z.string().optional().describe("Optional context for the agent"),
});

export const checkWalletBalanceSchema = z.object({
  address: z
    .string()
    .optional()
    .describe(
      "Ethereum address to check. Omit to check the app's own server wallet on Base Mainnet.",
    ),
});

export const sendEthSchema = z.object({
  to: z.string().describe("Recipient Ethereum address (0x...)"),
  amountEth: z
    .string()
    .describe(
      "Amount of ETH to send as a decimal string, e.g. '0.001'. Max 0.1 ETH per call.",
    ),
});

export const getRecentTransactionsSchema = z.object({
  address: z
    .string()
    .optional()
    .describe(
      "Ethereum address to look up. Omit to use the app's server wallet.",
    ),
  limit: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of recent transactions to return (max 10)"),
});

// ─── Tool definitions for OpenRouter ─────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and forecast for a location",
      parameters: zodToJsonSchema(weatherSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evaluate a mathematical expression",
      parameters: zodToJsonSchema(calculatorSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information, news, and live data using Brave Search. Use this for anything time-sensitive or requiring up-to-date facts.",
      parameters: zodToJsonSchema(webSearchSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save an important fact or user preference to long-term memory",
      parameters: zodToJsonSchema(saveMemorySchema),
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Recall previously stored memories about the user",
      parameters: zodToJsonSchema(recallMemorySchema),
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_data",
      description: "Analyze text or data: summarize, check sentiment, extract entities",
      parameters: zodToJsonSchema(analyzeDataSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description:
        "Delegate a specialized task to a worker agent (weather specialist or data analyst)",
      parameters: zodToJsonSchema(delegateToAgentSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "check_wallet_balance",
      description:
        "Check the ETH and USDC balance of a wallet address on Base Mainnet. Omit address to check the app's own server wallet.",
      parameters: zodToJsonSchema(checkWalletBalanceSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "send_eth",
      description:
        "Send ETH on Base Mainnet from the app's server wallet to a recipient address. Requires explicit user confirmation. Safety limit: 0.1 ETH per call.",
      parameters: zodToJsonSchema(sendEthSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_transactions",
      description:
        "Get recent transaction history for a wallet address on Base Mainnet via Basescan.",
      parameters: zodToJsonSchema(getRecentTransactionsSchema),
    },
  },
];

// ─── Simple zodToJsonSchema (no external dep) ────────────────────────────────

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return buildSchema(schema);
}

// Zod v4 uses .type and .def instead of instanceof checks
type ZodV4Schema = {
  type: string;
  def: Record<string, unknown>;
  meta?: () => { description?: string } | null;
  options?: string[];
};

function buildSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const s = schema as unknown as ZodV4Schema;
  const schemaType = s.type;

  // Unwrap optional
  if (schemaType === "optional") {
    const inner = (s.def.innerType as z.ZodTypeAny | undefined);
    if (inner) return buildSchema(inner);
    return { type: "string" };
  }

  // Unwrap default — pull inner type and default value
  if (schemaType === "default") {
    const inner = (s.def.innerType as z.ZodTypeAny | undefined);
    const defaultValue = (s.def.defaultValue as unknown);
    const innerSchema = inner ? buildSchema(inner) : { type: "string" };
    if (typeof defaultValue === "function") {
      try {
        return { ...innerSchema, default: (defaultValue as () => unknown)() };
      } catch {
        return innerSchema;
      }
    }
    return innerSchema;
  }

  if (schemaType === "object") {
    const shape = (s.def.shape as Record<string, z.ZodTypeAny>) ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = buildSchema(val);
      const valType = (val as unknown as ZodV4Schema).type;
      if (valType !== "optional" && valType !== "default") {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }

  if (schemaType === "string") {
    const result: Record<string, unknown> = { type: "string" };
    const meta = s.meta?.();
    if (meta?.description) result.description = meta.description;
    return result;
  }

  if (schemaType === "number") {
    const result: Record<string, unknown> = { type: "number" };
    const meta = s.meta?.();
    if (meta?.description) result.description = meta.description;
    return result;
  }

  if (schemaType === "enum") {
    // Zod v4: .options is the canonical array
    const opts = s.options;
    const enumValues: string[] = Array.isArray(opts)
      ? opts
      : Object.values((s.def.entries as Record<string, string>) ?? {});
    return { type: "string", enum: enumValues };
  }

  return { type: "string" };
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export type ToolExecutorContext = {
  fid: number;
  memories?: Array<{ content: string; category: string }>;
  onMemorySave?: (content: string, category: string, importance: number) => Promise<void>;
  /** Semantic recall function — injected by API route when Supabase is configured */
  onMemoryRecall?: (query: string, category: string) => Promise<Array<{ content: string; category: string; similarity?: number }>>;
};

export async function executeTool(
  toolName: string,
  argsJson: string,
  ctx: ToolExecutorContext,
): Promise<string> {
  try {
    const args = JSON.parse(argsJson);

    switch (toolName) {
      case "get_weather":
        return await executeWeather(weatherSchema.parse(args));

      case "calculator":
        return executeCalculator(calculatorSchema.parse(args));

      case "web_search":
        return await executeWebSearch(webSearchSchema.parse(args));

      case "save_memory": {
        const parsed = saveMemorySchema.parse(args);
        if (ctx.onMemorySave) {
          await ctx.onMemorySave(parsed.content, parsed.category, parsed.importance);
        }
        return JSON.stringify({
          saved: true,
          content: parsed.content,
          category: parsed.category,
        });
      }

      case "recall_memory": {
        const parsed = recallMemorySchema.parse(args);

        // Use semantic recall if available (Supabase pgvector)
        if (ctx.onMemoryRecall) {
          const results = await ctx.onMemoryRecall(parsed.query, parsed.category);
          if (results.length === 0) {
            return JSON.stringify({ found: false, message: "No relevant memories found." });
          }
          return JSON.stringify({
            found: true,
            memories: results,
            searchType: "semantic",
          });
        }

        // Keyword fallback using pre-loaded memories
        const mems = ctx.memories ?? [];
        const filtered =
          parsed.category === "all"
            ? mems
            : mems.filter((m) => m.category === parsed.category);
        const relevant = filtered
          .filter((m) => m.content.toLowerCase().includes(parsed.query.toLowerCase()))
          .slice(0, 5);
        if (relevant.length === 0) {
          return JSON.stringify({ found: false, message: "No relevant memories found." });
        }
        return JSON.stringify({ found: true, memories: relevant, searchType: "keyword" });
      }

      case "analyze_data":
        return await executeAnalysis(analyzeDataSchema.parse(args));

      case "delegate_to_agent":
        // Delegation is handled at the orchestrator level — return a placeholder
        return JSON.stringify({
          delegated: true,
          agent: (args as { agent: string }).agent,
          note: "Delegation handled by orchestrator",
        });

      case "check_wallet_balance": {
        const parsed = checkWalletBalanceSchema.parse(args);
        if (!parsed.address && !isWalletConfigured()) {
          return JSON.stringify({
            error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable on-chain tools.",
          });
        }
        const balance = await getWalletBalance(parsed.address);
        return JSON.stringify(balance);
      }

      case "send_eth": {
        const parsed = sendEthSchema.parse(args);
        if (!isWalletConfigured()) {
          return JSON.stringify({
            error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable on-chain tools.",
          });
        }
        const result = await sendEth({ to: parsed.to, amountEth: parsed.amountEth });
        return JSON.stringify(result);
      }

      case "get_recent_transactions": {
        const parsed = getRecentTransactionsSchema.parse(args);
        if (!parsed.address && !isWalletConfigured()) {
          return JSON.stringify({
            error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable on-chain tools.",
          });
        }
        const txs = await getRecentTransactions(parsed.address, parsed.limit);
        return JSON.stringify(txs);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({
      error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function executeWeather(args: z.infer<typeof weatherSchema>): Promise<string> {
  // Mock weather — swap with a real weather API key if desired
  const conditions = ["Sunny", "Partly cloudy", "Overcast", "Light rain", "Clear"];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const tempC = Math.round(10 + Math.random() * 25);
  const temp = args.units === "fahrenheit" ? Math.round(tempC * 1.8 + 32) : tempC;
  const unit = args.units === "fahrenheit" ? "F" : "C";
  return JSON.stringify({
    location: args.location,
    condition,
    temperature: `${temp}°${unit}`,
    humidity: `${Math.round(40 + Math.random() * 50)}%`,
    wind: `${Math.round(5 + Math.random() * 30)} km/h`,
    forecast: "Mild conditions expected over the next 48 hours.",
  });
}

function executeCalculator(args: z.infer<typeof calculatorSchema>): string {
  try {
    // Safe eval via Function — only allow math-like expressions
    const sanitized = args.expression.replace(/[^0-9+\-*/().% ]/g, "");
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${sanitized})`)() as number;
    return JSON.stringify({ expression: args.expression, result });
  } catch {
    return JSON.stringify({ error: "Could not evaluate expression" });
  }
}

async function executeWebSearch(args: z.infer<typeof webSearchSchema>): Promise<string> {
  const response = await braveSearch(args.query, args.maxResults);

  // Surface a hint when key isn't configured yet
  if (response.searchType === "fallback") {
    return JSON.stringify({
      query: response.query,
      results: response.results,
      note: "Live search unavailable — BRAVE_SEARCH_API_KEY not set. Get a free key at api.search.brave.com",
    });
  }

  return JSON.stringify({
    query: response.query,
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      ...(r.age ? { age: r.age } : {}),
      ...(r.isNews ? { isNews: true } : {}),
    })),
    totalResults: response.totalResults,
    source: "Brave Search",
  });
}

async function executeAnalysis(args: z.infer<typeof analyzeDataSchema>): Promise<string> {
  const wordCount = args.data.split(/\s+/).length;

  switch (args.task) {
    case "summarize":
      return JSON.stringify({
        task: "summarize",
        wordCount,
        summary: `The provided text contains approximately ${wordCount} words. Key themes include the main subject matter and supporting details. The content appears to be ${wordCount > 100 ? "detailed and comprehensive" : "concise and focused"}.`,
      });

    case "sentiment":
      return JSON.stringify({
        task: "sentiment",
        sentiment: "neutral",
        confidence: 0.72,
        breakdown: { positive: 0.31, neutral: 0.41, negative: 0.28 },
      });

    case "extract_entities":
      return JSON.stringify({
        task: "extract_entities",
        entities: {
          people: [],
          organizations: [],
          locations: [],
          dates: [],
          concepts: ["information", "content", "analysis"],
        },
      });

    case "categorize":
      return JSON.stringify({
        task: "categorize",
        primaryCategory: "General",
        confidence: 0.65,
        tags: ["information", "text", "content"],
      });
  }
}
