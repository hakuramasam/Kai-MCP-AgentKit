"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/features/agent/components/message-bubble";
import { ChatInput } from "@/features/agent/components/chat-input";
import { MemoryPanel } from "@/features/agent/components/memory-panel";
import { SessionSidebar } from "@/features/agent/components/session-sidebar";
import { useChat } from "@/features/agent/hooks/use-chat";
import { cn } from "@neynar/ui";
import { ShareButton } from "@/neynar-farcaster-sdk/mini";

interface ChatViewProps {
  fid: number;
  sessionId: string;
  onNewSession: (id: string) => void;
  onSessionSelect: (id: string) => void;
}

export function ChatView({ fid, sessionId, onNewSession, onSessionSelect }: ChatViewProps) {
  const [showMemory, setShowMemory] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [memoryRefresh, setMemoryRefresh] = useState(0);
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, stopGeneration, loadMessages } = useChat({
    sessionId,
    fid,
    onMemorySaved: () => setMemoryRefresh((k) => k + 1),
  });

  // Load messages when session changes
  useEffect(() => {
    void loadMessages(sessionId);
  }, [sessionId, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(text: string) {
    void sendMessage(text);
    setSessionRefresh((k) => k + 1);
  }

  const panel = showMemory ? "memory" : showSessions ? "sessions" : null;

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0f] relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
        <button
          onClick={() => {
            setShowSessions(!showSessions);
            setShowMemory(false);
          }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all",
            showSessions
              ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
              : "text-gray-400 hover:text-white hover:bg-white/8",
          )}
        >
          <span>☰</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-sm">
            ✦
          </div>
          <span className="text-sm font-semibold text-white">AgentKit</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowMemory(!showMemory);
              setShowSessions(false);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all",
              showMemory
                ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                : "text-gray-400 hover:text-white hover:bg-white/8",
            )}
          >
            <span>🧠</span>
          </button>
          <ShareButton
            text="Try AgentKit — an AI agent with tool calling & memory"
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white hover:bg-white/8 rounded-xl w-9 h-9"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </ShareButton>
        </div>
      </div>

      {/* Sliding panels */}
      <div
        className={cn(
          "absolute inset-0 top-[53px] z-20 bg-[#0d0d14] transition-transform duration-300 ease-out",
          panel ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {showMemory && (
          <MemoryPanel
            fid={fid}
            onClose={() => setShowMemory(false)}
            refreshKey={memoryRefresh}
          />
        )}
        {showSessions && (
          <SessionSidebar
            fid={fid}
            activeSessionId={sessionId}
            onSelectSession={onSessionSelect}
            onNewSession={onNewSession}
            onClose={() => setShowSessions(false)}
            refreshKey={sessionRefresh}
          />
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && !isLoading && (
          <WelcomeScreen />
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {error && (
          <div className="flex justify-center">
            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-white/6">
        {isLoading && (
          <div className="flex justify-center mb-2">
            <button
              onClick={stopGeneration}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-xs text-gray-400 hover:text-white transition-all"
            >
              <span className="w-2.5 h-2.5 bg-gray-400 rounded-sm" />
              Stop generating
            </button>
          </div>
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-3xl mb-5 shadow-xl shadow-violet-900/30">
        ✦
      </div>
      <h1 className="text-xl font-bold text-white mb-2">AgentKit</h1>
      <p className="text-sm text-gray-400 mb-6 max-w-[260px] leading-relaxed">
        A multi-agent AI with tool calling, semantic memory, and autonomous execution.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
        {[
          { icon: "🌤", label: "Weather agent" },
          { icon: "🔍", label: "Web search" },
          { icon: "🧠", label: "Memory recall" },
          { icon: "📊", label: "Data analysis" },
        ].map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/8"
          >
            <span>{icon}</span>
            <span className="text-xs text-gray-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
