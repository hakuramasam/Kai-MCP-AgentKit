"use client";

import { cn } from "@neynar/ui";
import type { ToolActivity } from "@/features/agent/types";

const TOOL_ICONS: Record<string, string> = {
  get_weather: "🌤",
  calculator: "🧮",
  web_search: "🔍",
  save_memory: "🧠",
  recall_memory: "💭",
  analyze_data: "📊",
  delegate_to_agent: "🤝",
};

const TOOL_LABELS: Record<string, string> = {
  get_weather: "Weather",
  calculator: "Calculator",
  web_search: "Web Search",
  save_memory: "Saving memory",
  recall_memory: "Recalling memory",
  analyze_data: "Analyzing data",
  delegate_to_agent: "Delegating",
};

interface ToolBadgeProps {
  activity: ToolActivity;
}

export function ToolBadge({ activity }: ToolBadgeProps) {
  const icon = TOOL_ICONS[activity.name] ?? "⚙️";
  const label = TOOL_LABELS[activity.name] ?? activity.name;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        "border transition-all duration-300",
        activity.status === "running" &&
          "bg-violet-500/10 border-violet-500/30 text-violet-300 animate-pulse",
        activity.status === "done" &&
          "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
        activity.status === "error" &&
          "bg-red-500/10 border-red-500/30 text-red-300",
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {activity.status === "running" && (
        <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      )}
      {activity.status === "done" && <span className="text-emerald-400">✓</span>}
      {activity.status === "error" && <span className="text-red-400">✗</span>}
    </div>
  );
}
