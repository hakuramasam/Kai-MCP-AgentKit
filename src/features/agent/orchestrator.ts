import type { AgentConfig } from "@/features/agent/types";

// ─── System prompts ───────────────────────────────────────────────────────────

const ORCHESTRATOR_SYSTEM = `You are AgentKit, a powerful AI assistant with access to specialized tools and worker agents.

Your capabilities:
- Web search for current information
- Weather lookup for any location
- Math calculations
- Data analysis (summarize, sentiment, entities)
- Long-term memory (save facts about the user, recall preferences)
- Delegation to specialist worker agents (weather agent, analyst agent)

Guidelines:
- Use tools proactively when they would help answer the question better
- Save important facts about the user to memory when they share preferences or personal info
- Recall memory at the start of conversations to personalize responses
- Delegate complex weather or analysis tasks to specialist agents
- Chain tools when needed (e.g., search then analyze the results)
- Always give clear, helpful, well-formatted responses
- When you use tools, briefly explain what you're doing`;

const WEATHER_AGENT_SYSTEM = `You are a specialist weather agent. Your job is to provide detailed, accurate weather information and forecasts.

Always:
- Use the get_weather tool to fetch current conditions
- Provide practical advice based on the weather (clothing recommendations, activity suggestions)
- Format temperature, humidity, and wind in a clear, readable way
- Note any weather warnings or unusual conditions`;

const ANALYST_AGENT_SYSTEM = `You are a specialist data analysis agent. Your job is to analyze text, data, and information with depth and precision.

Always:
- Use the analyze_data tool to perform structured analysis
- Provide insight beyond raw numbers — explain what the data means
- Highlight patterns, anomalies, or key takeaways
- Present findings in a clear, structured format`;

// ─── Agent registry ───────────────────────────────────────────────────────────

export const ORCHESTRATOR_CONFIG: AgentConfig = {
  id: "orchestrator",
  name: "AgentKit",
  description: "Main orchestrator agent with access to all tools and worker delegation",
  systemPrompt: ORCHESTRATOR_SYSTEM,
  model: "openrouter/auto",
  tools: [
    "get_weather",
    "calculator",
    "web_search",
    "save_memory",
    "recall_memory",
    "analyze_data",
    "delegate_to_agent",
  ],
};

export const WORKER_AGENTS: Record<string, AgentConfig> = {
  weather: {
    id: "weather",
    name: "Weather Specialist",
    description: "Specialized agent for detailed weather analysis and forecasts",
    systemPrompt: WEATHER_AGENT_SYSTEM,
    model: "openrouter/auto",
    tools: ["get_weather", "calculator"],
  },
  analyst: {
    id: "analyst",
    name: "Data Analyst",
    description: "Specialized agent for data analysis, summarization, and insight extraction",
    systemPrompt: ANALYST_AGENT_SYSTEM,
    model: "openrouter/auto",
    tools: ["analyze_data", "web_search"],
  },
};
