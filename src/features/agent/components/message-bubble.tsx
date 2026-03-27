"use client";

import { cn } from "@neynar/ui";
import { ToolBadge } from "@/features/agent/components/tool-badge";
import type { UIMessage } from "@/features/agent/types";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming = message.isStreaming;

  return (
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
          ✦
        </div>
      )}

      <div className={cn("flex flex-col gap-2 max-w-[82%]", isUser && "items-end")}>
        {/* Tool activity badges */}
        {message.toolActivity && message.toolActivity.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolActivity.map((activity, i) => (
              <ToolBadge key={`${activity.name}-${i}`} activity={activity} />
            ))}
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "px-4 py-3 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-violet-600 text-white rounded-tr-sm"
              : "bg-white/8 border border-white/10 text-gray-100 rounded-tl-sm",
          )}
        >
          {message.content ? (
            <FormattedContent content={message.content} />
          ) : isStreaming ? (
            <ThinkingDots />
          ) : null}
          {isStreaming && message.content && <BlinkingCursor />}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-sm flex-shrink-0 mt-0.5 text-white font-semibold">
          U
        </div>
      )}
    </div>
  );
}

function FormattedContent({ content }: { content: string }) {
  // Simple markdown-lite formatting
  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("# "))
          return (
            <p key={i} className="font-bold text-base text-white">
              {line.slice(2)}
            </p>
          );
        if (line.startsWith("## "))
          return (
            <p key={i} className="font-semibold text-white">
              {line.slice(3)}
            </p>
          );
        if (line.startsWith("- ") || line.startsWith("• "))
          return (
            <p key={i} className="pl-3">
              <span className="text-violet-400 mr-1.5">•</span>
              {line.slice(2)}
            </p>
          );
        if (line.startsWith("**") && line.endsWith("**"))
          return (
            <p key={i} className="font-semibold text-white">
              {line.slice(2, -2)}
            </p>
          );
        if (line === "")
          return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function BlinkingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />
  );
}
