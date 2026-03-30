"use client";

import { useState, useRef, useCallback } from "react";
import { nanoid } from "@/features/agent/lib/nanoid";
import {
  saveMessage,
  getSessionMessages,
  updateSessionTitle,
} from "@/db/actions/chat-actions";
import type { UIMessage, ToolActivity, StreamEvent } from "@/features/agent/types";

interface UseChatOptions {
  sessionId: string;
  fid: number;
  onMemorySaved?: () => void;
}

export function useChat({ sessionId, fid, onMemorySaved }: UseChatOptions) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionInitialized = useRef<string | null>(null);

  // Load messages for a session
  const loadMessages = useCallback(async (sid: string) => {
    const dbMessages = await getSessionMessages(sid);
    const uiMessages: UIMessage[] = dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
      }));
    setMessages(uiMessages);
    sessionInitialized.current = sid;
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // Add user message to UI
      const userMsg: UIMessage = {
        id: nanoid(),
        role: "user",
        content,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Save user message to DB
      await saveMessage({ sessionId, fid, role: "user", content });

      // Add placeholder assistant message
      const assistantId = nanoid();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        toolActivity: [],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setIsLoading(true);

      // Build message history for API (last 20 messages for context)
      const historyMessages = [
        ...messages.slice(-18),
        userMsg,
      ].map((m) => ({ role: m.role, content: m.content }));

      try {
        abortRef.current = new AbortController();

        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyMessages,
            sessionId,
            fid,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data) as StreamEvent;
              handleStreamEvent(event, assistantId);
            } catch {
              // malformed event
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Connection failed";
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${msg}`, isStreaming: false }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
      }

      // Auto-title session from first message
      if (messages.length === 0) {
        const title =
          content.length > 40 ? content.slice(0, 40) + "…" : content;
        await updateSessionTitle(sessionId, title);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, fid, messages, isLoading],
  );

  function handleStreamEvent(event: StreamEvent, assistantId: string) {
    switch (event.type) {
      case "token":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.text }
              : m,
          ),
        );
        break;

      case "tool_start":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const newActivity: ToolActivity = {
              name: event.name,
              status: "running",
              args: event.args,
            };
            return { ...m, toolActivity: [...(m.toolActivity ?? []), newActivity] };
          }),
        );
        break;

      case "tool_result":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const updated = (m.toolActivity ?? []).map((ta) =>
              ta.name === event.name && ta.status === "running"
                ? { ...ta, status: "done" as const, result: event.result }
                : ta,
            );
            return { ...m, toolActivity: updated };
          }),
        );
        break;

      case "memory_saved":
        onMemorySaved?.();
        break;

      case "error":
        setError(event.message);
        break;

      case "done":
        break;
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
    setIsLoading(false);
  }

  function clearMessages() {
    setMessages([]);
  }

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    loadMessages,
    sessionInitialized: sessionInitialized.current,
  };
}
