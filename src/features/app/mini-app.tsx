"use client";

import { useState, useEffect } from "react";
import { useFarcasterUser } from "@/neynar-farcaster-sdk/mini";
import { ChatView } from "@/features/agent/chat-view";
import { createSession, getUserSessions } from "@/db/actions/chat-actions";

export function MiniApp() {
  const { data: user } = useFarcasterUser();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fid = user?.fid ?? 0;

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
    <ChatView
      fid={fid}
      sessionId={sessionId}
      onNewSession={handleNewSession}
      onSessionSelect={handleSessionSelect}
    />
  );
}
