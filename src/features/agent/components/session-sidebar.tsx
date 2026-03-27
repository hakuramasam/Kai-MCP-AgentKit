"use client";

import { useState, useEffect } from "react";
import { cn } from "@neynar/ui";
import {
  getUserSessions,
  createSession,
  deleteSession,
} from "@/db/actions/chat-actions";
import type { ChatSession } from "@/db/actions/chat-actions";

interface SessionSidebarProps {
  fid: number;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
  onClose: () => void;
  refreshKey?: number;
}

export function SessionSidebar({
  fid,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onClose,
  refreshKey,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSessions() {
    setLoading(true);
    try {
      const data = await getUserSessions(fid);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, refreshKey]);

  async function handleNewSession() {
    const session = await createSession(fid, "New conversation");
    setSessions((prev) => [session, ...prev]);
    onNewSession(session.id);
    onClose();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const next = sessions.find((s) => s.id !== id);
      if (next) onSelectSession(next.id);
    }
  }

  function formatDate(date: Date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <h2 className="text-sm font-semibold text-white">Conversations</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/8 transition-all"
        >
          ✕
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => void handleNewSession()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm hover:bg-violet-600/30 transition-all"
        >
          <span className="text-base">+</span>
          New conversation
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No conversations yet</p>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                onSelectSession(session.id);
                onClose();
              }}
              className={cn(
                "group w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-all",
                activeSessionId === session.id
                  ? "bg-violet-600/20 border border-violet-500/30"
                  : "hover:bg-white/6 border border-transparent",
              )}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm truncate",
                    activeSessionId === session.id ? "text-white" : "text-gray-300",
                  )}
                >
                  {session.title}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {formatDate(session.updatedAt)}
                </p>
              </div>
              <button
                onClick={(e) => void handleDelete(session.id, e)}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
              >
                ✕
              </button>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
