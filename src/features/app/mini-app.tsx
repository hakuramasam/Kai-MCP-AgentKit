"use client";

import { useState, useEffect } from "react";
import { useFarcasterUser } from "@/neynar-farcaster-sdk/mini";
import { ChatView } from "@/features/agent/chat-view";
import { AdminDashboard } from "@/features/agent/components/admin-dashboard";
import { createSession, getUserSessions } from "@/db/actions/chat-actions";
import { cn } from "@neynar/ui";

const CREATOR_FID = parseInt(process.env.NEXT_PUBLIC_USER_FID ?? "0", 10);

type AppTab = "chat" | "admin";

export function MiniApp() {
  const { data: user } = useFarcasterUser();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("chat");

  const fid = user?.fid ?? 0;
  const isCreator = CREATOR_FID > 0 && fid === CREATOR_FID;

  // Initialize or load session
  useEffect(() => {
    if (!fid) return;
    void initSession();
  }, [fid]);

  async function initSession() {
    setLoading(true);
    try {
      const sessions = await getUserSessions(fid);
      if (sessions.length > 0) {
        setSessionId(sessions[0].id);
      } else {
        const session = await createSession(fid, "New conversation");
        setSessionId(session.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleNewSession(id: string) {
    setSessionId(id);
  }

  function handleSessionSelect(id: string) {
    setSessionId(id);
  }

  // Loading state
  if (loading || !sessionId || !fid) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-2xl">
            ✦
          </div>
          <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0f]">
      {/* Admin tab bar — only shown to the creator */}
      {isCreator && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 pt-2 pb-1 border-b border-white/10">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeTab === "chat"
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5",
            )}
          >
            <span>💬</span>
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeTab === "admin"
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5",
            )}
          >
            <span>📊</span>
            <span>Admin</span>
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" || !isCreator ? (
          <ChatView
            fid={fid}
            sessionId={sessionId}
            onNewSession={handleNewSession}
            onSessionSelect={handleSessionSelect}
          />
        ) : (
          <AdminDashboard fid={fid} />
        )}
      </div>
    </div>
  );
}
