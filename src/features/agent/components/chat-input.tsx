"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { cn } from "@neynar/ui";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const SUGGESTION_PROMPTS = [
  "What's the weather in Tokyo?",
  "Calculate 15% tip on $87.50",
  "Search for latest AI news",
  "Analyze this text: The market is uncertain",
];

export function ChatInput({ onSend, isLoading, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Suggestion chips — only show when empty */}
      {!value && !isLoading && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {SUGGESTION_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setValue(prompt);
                textareaRef.current?.focus();
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-all"
            >
              {prompt.length > 28 ? prompt.slice(0, 28) + "…" : prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className={cn(
          "flex items-end gap-2 px-3 py-2.5 rounded-2xl",
          "bg-white/8 border border-white/15",
          "focus-within:border-violet-500/60 focus-within:bg-white/10 transition-all",
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isLoading ? "Agent is thinking…" : "Ask anything…"}
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            "flex-1 bg-transparent text-sm text-white placeholder-gray-500",
            "resize-none outline-none min-h-[24px] max-h-[120px]",
            "disabled:opacity-50",
          )}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled}
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
            "bg-violet-600 hover:bg-violet-500",
            "disabled:opacity-30 disabled:cursor-not-allowed",
          )}
        >
          {isLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 7L7 13M1 7H13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
