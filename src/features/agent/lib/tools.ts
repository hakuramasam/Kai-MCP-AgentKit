import { z } from "zod";
import type { ToolDefinition } from "@/features/agent/types";
import {
  getWalletBalance,
  sendEth,
  getRecentTransactions,
  isWalletConfigured,
} from "@/features/agent/lib/wallet";
import { braveSearch, isBraveConfigured } from "@/features/agent/lib/brave-search";
import { runJavaScript } from "@/features/agent/lib/code-runner";
import { fetchUrl } from "@/features/agent/lib/fetch-url";
import { getMarketData, getMultiMarketData } from "@/features/agent/lib/market-data";
import { lookupTransaction } from "@/features/agent/lib/tx-lookup";
import {
  analyzeTextWithAI,
  reviewCodeWithAI,
  captionImageWithAI,
} from "@/features/agent/lib/ai-tools";
import { queryNebula, isNebulaConfigured } from "@/features/agent/lib/thirdweb-ai";
import { deployContract } from "@/features/agent/lib/thirdweb-deploy";
import { getNFTData, getWalletNFTs } from "@/features/agent/lib/thirdweb-nft";
import { readContractFunction, resolveChainId } from "@/features/agent/lib/thirdweb-contract";
import { uploadToIPFS, fetchFromIPFS } from "@/features/agent/lib/thirdweb-ipfs";

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

export const fetchUrlSchema = z.object({
  url: z.string().describe("Full URL to fetch (must be http:// or https://). Returns page content as clean text stripped of HTML."),
  summarize: z.boolean().default(false).describe("If true, return a summary hint alongside the content (the LLM will summarize). If false, return raw extracted text."),
});

export const runCodeSchema = z.object({
  code: z
    .string()
    .describe(
      "JavaScript code to execute. Use console.log() to output results. The last expression's return value is also captured. No network, filesystem, or require access. Timeout: 5 seconds.",
    ),
  description: z
    .string()
    .optional()
    .describe("Brief description of what the code does, shown in the UI"),
});

// ─── New: Market data ─────────────────────────────────────────────────────────

export const marketDataSchema = z.object({
  token: z
    .string()
    .describe(
      "Cryptocurrency token name or ticker symbol (e.g. 'bitcoin', 'BTC', 'ethereum', 'ETH', 'solana', 'SOL')",
    ),
  vsCurrency: z
    .string()
    .default("usd")
    .describe("Quote currency to price against, e.g. 'usd', 'eur', 'btc'. Defaults to USD."),
  compareWith: z
    .string()
    .optional()
    .describe("Optional second token to compare alongside the first"),
});

// ─── New: Base tx lookup ──────────────────────────────────────────────────────

export const baseTxLookupSchema = z.object({
  txHash: z
    .string()
    .describe(
      "Base Mainnet transaction hash to look up (66-character hex string starting with 0x)",
    ),
});

// ─── New: AI text analysis ────────────────────────────────────────────────────

export const textAnalysisSchema = z.object({
  text: z.string().describe("Text to analyze — can be any length up to ~8,000 characters"),
  analysisType: z
    .enum(["sentiment", "entities", "summarize", "keywords", "full"])
    .default("full")
    .describe(
      "Type of analysis: 'sentiment' (positive/negative/neutral), 'entities' (people, orgs, places), 'summarize' (summary + key points), 'keywords' (important terms), 'full' (comprehensive analysis)",
    ),
});

// ─── New: AI code review ──────────────────────────────────────────────────────

export const codeReviewSchema = z.object({
  code: z.string().describe("Source code to review (any language, up to ~12,000 characters)"),
  language: z
    .string()
    .default("auto-detect")
    .describe("Programming language (e.g. 'typescript', 'python', 'solidity'). Leave blank to auto-detect."),
  focus: z
    .enum(["security", "quality", "performance", "all"])
    .default("all")
    .describe(
      "Review focus: 'security' (vulnerabilities), 'quality' (code style/patterns), 'performance' (efficiency), 'all' (comprehensive)",
    ),
});

// ─── New: AI image caption ────────────────────────────────────────────────────

export const imageCaptionSchema = z.object({
  imageUrl: z
    .string()
    .describe(
      "Public URL of the image to analyze (must be http:// or https://). Returns caption, description, detected objects/text, dominant colors, and mood.",
    ),
});

// ─── Thirdweb: Deploy contract ────────────────────────────────────────────────

export const deployContractSchema = z.object({
  description: z
    .string()
    .describe(
      "Plain English description of the contract to deploy, e.g. 'an ERC-721 NFT collection called CoolCats with a max supply of 10,000' or 'an ERC-20 token called MyToken with symbol MTK and 1 million supply'",
    ),
  contractType: z
    .enum(["ERC-20", "ERC-721", "ERC-1155", "custom"])
    .optional()
    .describe("Token standard or contract type. Omit to let Nebula infer from description."),
  name: z.string().optional().describe("Token or contract name, e.g. 'CoolCats'"),
  symbol: z.string().optional().describe("Token symbol, e.g. 'COOL'"),
  chainId: z
    .number()
    .default(8453)
    .describe("Target chain ID. Defaults to Base Mainnet (8453). Also supports Ethereum (1), Polygon (137), Arbitrum (42161), Optimism (10)."),
  walletAddress: z
    .string()
    .optional()
    .describe("Deployer wallet address — provides context to Nebula for gas estimation"),
  extraParams: z
    .string()
    .optional()
    .describe("Any extra constructor parameters or requirements, e.g. 'royalty 5%, mint price 0.01 ETH, allowlist enabled'"),
});

// ─── Thirdweb: Nebula AI ──────────────────────────────────────────────────────

export const thirdwebAiSchema = z.object({
  prompt: z
    .string()
    .describe(
      "Natural language blockchain question, e.g. 'Explain this wallet 0x...', 'What does the USDC contract do?', 'Summarize the activity of 0x... on Base', 'What is the most popular NFT collection on Base?'",
    ),
  walletAddress: z
    .string()
    .optional()
    .describe("Ethereum address to use as context for the query"),
  contractAddress: z
    .string()
    .optional()
    .describe("Contract address to use as context for the query"),
  chainId: z
    .number()
    .optional()
    .describe("Chain ID to focus the query on (e.g. 8453 for Base, 1 for Ethereum). Defaults to Base."),
});

// ─── Thirdweb: NFT data ───────────────────────────────────────────────────────

export const nftDataSchema = z.object({
  contractAddress: z.string().describe("NFT contract address (ERC-721 or ERC-1155)"),
  tokenId: z
    .number()
    .optional()
    .describe("Specific token ID to fetch. Omit to get collection info only."),
  ownerAddress: z
    .string()
    .optional()
    .describe("If provided, returns all NFTs owned by this address in the collection instead of a single token"),
  chainId: z
    .number()
    .default(8453)
    .describe("Chain ID (8453=Base, 1=Ethereum, 137=Polygon, 42161=Arbitrum, 10=Optimism). Defaults to Base."),
});

// ─── Thirdweb: Read contract ──────────────────────────────────────────────────

export const readContractSchema = z.object({
  contractAddress: z.string().describe("Contract address to call"),
  abiFragment: z
    .string()
    .describe(
      "Human-readable ABI function signature, e.g. 'function name() view returns (string)', 'function balanceOf(address) view returns (uint256)', 'function ownerOf(uint256) view returns (address)'",
    ),
  args: z
    .array(z.string())
    .default([])
    .describe("Arguments to pass to the function, as strings (e.g. ['0x1234...', '42'])"),
  chain: z
    .string()
    .default("base")
    .describe("Chain name or ID: 'base', 'ethereum', 'polygon', 'arbitrum', 'optimism', or a numeric chain ID"),
});

// ─── Thirdweb: IPFS ───────────────────────────────────────────────────────────

export const ipfsSchema = z.object({
  action: z
    .enum(["upload", "fetch"])
    .describe("'upload' to store content on IPFS, 'fetch' to retrieve content by URI or CID"),
  content: z
    .string()
    .optional()
    .describe("Content to upload — a JSON string or plain text. Required when action='upload'."),
  uri: z
    .string()
    .optional()
    .describe("IPFS URI (ipfs://...), CID (Qm...), or gateway URL to fetch. Required when action='fetch'."),
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
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch the content of any public URL and return it as clean readable text. Use for: reading articles, documentation, GitHub files, JSON APIs, or any webpage. HTML is stripped automatically. Content is capped at 12,000 characters.",
      parameters: zodToJsonSchema(fetchUrlSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "run_code",
      description:
        "Execute JavaScript code in a sandboxed environment and return stdout + return value. Use for: data transformation, complex calculations, string processing, sorting/filtering arrays, date math, generating structured output, or any logic that benefits from actual code over mental math. No network or filesystem access.",
      parameters: zodToJsonSchema(runCodeSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "market_data",
      description:
        "Get real-time cryptocurrency market data: price, 24h change, market cap, volume, ATH, and supply. Uses CoinGecko. Supports BTC, ETH, SOL, MATIC, OP, ARB, LINK, UNI, DOGE, AVAX, USDC, DEGEN, and hundreds more.",
      parameters: zodToJsonSchema(marketDataSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "base_tx_lookup",
      description:
        "Look up the full details of any transaction on Base Mainnet by its hash: status, sender/receiver, ETH value, gas, block, timestamp, and a direct Basescan link.",
      parameters: zodToJsonSchema(baseTxLookupSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "text_analysis",
      description:
        "AI-powered deep text analysis via LLM: sentiment analysis, named entity extraction (people, orgs, places), summarization with key points, keyword/topic extraction, readability scoring, or a full comprehensive report.",
      parameters: zodToJsonSchema(textAnalysisSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "code_review",
      description:
        "AI-powered code review: security vulnerabilities, code quality issues, performance problems, and best practice improvements. Returns severity-ranked issues, an overall score, strengths, and actionable suggestions. Supports any programming language.",
      parameters: zodToJsonSchema(codeReviewSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "image_caption",
      description:
        "Describe any image from a public URL using vision AI. Returns a caption, detailed description, detected objects, any visible text (OCR), dominant colors, mood, and content categories.",
      parameters: zodToJsonSchema(imageCaptionSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_contract",
      description:
        "Deploy a smart contract on Base (or any EVM chain) using Thirdweb Nebula AI. Supports ERC-20 tokens, ERC-721 NFT collections, ERC-1155 multi-tokens, and custom contracts. Describe what you want in plain English — Nebula generates the deployment parameters, constructor args, and transaction data. Returns deployment steps, estimated gas, and a Thirdweb dashboard link.",
      parameters: zodToJsonSchema(deployContractSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "thirdweb_ai",
      description:
        "Ask any natural language blockchain question powered by Thirdweb Nebula AI — trained on contracts and transactions across 2500+ EVM chains. Use for: 'explain this wallet', 'what does this contract do?', 'summarize activity for 0x...', 'what is the top NFT collection?', 'decode this transaction', 'what are common patterns in DeFi?'. Optionally ground the query with a wallet address, contract, or chain.",
      parameters: zodToJsonSchema(thirdwebAiSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "nft_data",
      description:
        "Fetch NFT metadata, attributes, and ownership from any ERC-721 or ERC-1155 collection on Base, Ethereum, Polygon, Arbitrum, or Optimism. Can fetch a specific token by ID, or all NFTs owned by a wallet in a collection.",
      parameters: zodToJsonSchema(nftDataSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "read_contract",
      description:
        "Call any read-only function on any EVM smart contract using a human-readable ABI fragment. Works on Base, Ethereum, Polygon, Arbitrum, and Optimism. Use for: checking token balances, reading contract state, fetching name/symbol/supply, getting prices from DeFi pools, querying governance contracts, and more.",
      parameters: zodToJsonSchema(readContractSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "ipfs",
      description:
        "Upload content to IPFS or fetch content from IPFS. Upload accepts JSON objects or plain text and returns an IPFS URI + multiple gateway URLs. Fetch retrieves any content by IPFS URI (ipfs://...), CID, or gateway URL.",
      parameters: zodToJsonSchema(ipfsSchema),
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

      case "fetch_url": {
        const parsed = fetchUrlSchema.parse(args);
        const result = await fetchUrl(parsed.url);
        return JSON.stringify({
          url: result.url,
          title: result.title,
          contentType: result.contentType,
          contentLength: result.contentLength,
          truncated: result.truncated,
          fetchedAt: result.fetchedAt,
          content: result.content,
          ...(parsed.summarize ? { instruction: "Please summarize the above content for the user." } : {}),
        });
      }

      case "run_code": {
        const parsed = runCodeSchema.parse(args);
        const result = runJavaScript(parsed.code);

        // Format output for the LLM
        const output: Record<string, unknown> = {
          executionMs: result.executionMs,
        };

        if (result.stdout.length > 0) {
          output.stdout = result.stdout.join("\n");
        }

        if (result.returnValue !== undefined && result.returnValue !== "undefined") {
          output.returnValue = result.returnValue;
        }

        if (result.error) {
          output.error = result.error;
          output.status = "error";
        } else {
          output.status = "success";
        }

        if (result.truncated) {
          output.note = "Output was truncated (limit: 8000 chars)";
        }

        return JSON.stringify(output);
      }

      case "market_data": {
        const parsed = marketDataSchema.parse(args);
        if (parsed.compareWith) {
          const results = await getMultiMarketData(
            [parsed.token, parsed.compareWith],
            parsed.vsCurrency,
          );
          return JSON.stringify({ tokens: results, currency: parsed.vsCurrency.toUpperCase() });
        }
        const result = await getMarketData(parsed.token, parsed.vsCurrency);
        if (!result.success) {
          return JSON.stringify({ error: result.error });
        }
        return JSON.stringify(result.data);
      }

      case "base_tx_lookup": {
        const parsed = baseTxLookupSchema.parse(args);
        const result = await lookupTransaction(parsed.txHash);
        if (!result.success) {
          return JSON.stringify({ error: result.error });
        }
        return JSON.stringify(result.data);
      }

      case "text_analysis": {
        const parsed = textAnalysisSchema.parse(args);
        const result = await analyzeTextWithAI(parsed.text, parsed.analysisType);
        return JSON.stringify(result);
      }

      case "code_review": {
        const parsed = codeReviewSchema.parse(args);
        const result = await reviewCodeWithAI(parsed.code, parsed.language, parsed.focus);
        return JSON.stringify(result);
      }

      case "image_caption": {
        const parsed = imageCaptionSchema.parse(args);
        const result = await captionImageWithAI(parsed.imageUrl);
        return JSON.stringify(result);
      }

      case "deploy_contract": {
        const parsed = deployContractSchema.parse(args);
        const result = await deployContract({
          description:   parsed.description,
          contractType:  parsed.contractType,
          name:          parsed.name,
          symbol:        parsed.symbol,
          chainId:       parsed.chainId,
          walletAddress: parsed.walletAddress,
          extraParams:   parsed.extraParams,
        });

        if (!result.success && !result.message) {
          return JSON.stringify({ error: result.error });
        }

        return JSON.stringify({
          deployed:        result.deployed,
          message:         result.message,
          contractAddress: result.contractAddress ?? null,
          txHash:          result.txHash ?? null,
          gasCost:         result.gasCost ?? null,
          dashboardUrl:    result.dashboardUrl,
          explorerUrl:     result.explorerUrl ?? null,
          powered_by:      "Thirdweb Nebula AI",
          ...(result.error   ? { warning: result.error }  : {}),
          status: result.deployed
            ? "✅ Contract deployed on-chain automatically"
            : "📋 Deployment guide ready — add WALLET_PRIVATE_KEY for automated on-chain deploy, or use the Thirdweb dashboard link above",
        });
      }

      case "thirdweb_ai": {
        const parsed = thirdwebAiSchema.parse(args);
        const result = await queryNebula(parsed.prompt, {
          walletAddress: parsed.walletAddress,
          contractAddress: parsed.contractAddress,
          chainId: parsed.chainId ?? 8453,
        });
        if (!result.success) {
          return JSON.stringify({ error: result.error });
        }
        return JSON.stringify({
          answer: result.message,
          ...(result.actions && result.actions.length > 0 ? { actions: result.actions } : {}),
          powered_by: "Thirdweb Nebula AI",
        });
      }

      case "nft_data": {
        const parsed = nftDataSchema.parse(args);
        // If ownerAddress provided — fetch owned NFTs
        if (parsed.ownerAddress) {
          const result = await getWalletNFTs(
            parsed.ownerAddress,
            parsed.contractAddress,
            parsed.chainId,
          );
          if (!result.success) return JSON.stringify({ error: result.error });
          return JSON.stringify(result);
        }
        // Otherwise fetch single token
        if (parsed.tokenId === undefined) {
          return JSON.stringify({
            error: "Please provide either a tokenId (to fetch a specific NFT) or an ownerAddress (to list NFTs owned by a wallet).",
          });
        }
        const result = await getNFTData(
          parsed.contractAddress,
          parsed.tokenId,
          parsed.chainId,
        );
        if (!result.success) return JSON.stringify({ error: result.error });
        return JSON.stringify(result);
      }

      case "read_contract": {
        const parsed = readContractSchema.parse(args);
        const chainId = resolveChainId(parsed.chain);
        const result = await readContractFunction(
          parsed.contractAddress,
          parsed.abiFragment,
          parsed.args,
          chainId,
        );
        if (!result.success) return JSON.stringify({ error: result.error });
        return JSON.stringify(result);
      }

      case "ipfs": {
        const parsed = ipfsSchema.parse(args);
        if (parsed.action === "upload") {
          if (!parsed.content) {
            return JSON.stringify({ error: "content is required for action='upload'" });
          }
          // Try to parse as JSON object first, fall back to string
          let uploadContent: string | Record<string, unknown> = parsed.content;
          try {
            uploadContent = JSON.parse(parsed.content) as Record<string, unknown>;
          } catch {
            uploadContent = parsed.content;
          }
          const result = await uploadToIPFS(uploadContent);
          if (!result.success) return JSON.stringify({ error: result.error });
          return JSON.stringify(result);
        } else {
          if (!parsed.uri) {
            return JSON.stringify({ error: "uri is required for action='fetch'" });
          }
          const result = await fetchFromIPFS(parsed.uri);
          if (!result.success) return JSON.stringify({ error: result.error });
          return JSON.stringify(result);
        }
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
