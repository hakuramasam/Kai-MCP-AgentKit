"use client";

import { useState, useEffect } from "react";
import { useFarcasterUser } from "@/neynar-farcaster-sdk/mini";
import { ChatView } from "@/features/agent/chat-view";
import { AdminDashboard } from "@/features/agent/components/admin-dashboard";
import { GatedDemo } from "@/features/agent/components/gated-demo";
import { createSession, getUserSessions } from "@/db/actions/chat-actions";
import { cn } from "@neynar/ui";

const CREATOR_FID = parseInt(process.env.NEXT_PUBLIC_USER_FID ?? "0", 10);

type AppTab = "chat" | "gate" | "admin";

export function MiniApp() {
  const { data: user } = useFarcasterUser();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("chat");

  const fid = user?.fid ?? 0;
  const isCreator = CREATOR_FID > 0 && fid === CREATOR_FID;

  // Pick first verified address as the wallet for gate checks
  const walletAddress = (user as { verifiedAddresses?: string[] } | undefined)?.verifiedAddresses?.[0]
    ?? (user as { custody_address?: string } | undefined)?.custody_address;

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

  const tabs: { id: AppTab; icon: string; label: string; show: boolean }[] = [
    { id: "chat",  icon: "💬", label: "Chat",  show: true },
    { id: "gate",  icon: "🔐", label: "Gate",  show: true },
    { id: "admin", icon: "📊", label: "Admin", show: isCreator },
  ];

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0f]">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-3 pt-2 pb-1 border-b border-white/10">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeTab === t.id
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5",
            )}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" && (
          <ChatView
            fid={fid}
            sessionId={sessionId}
            onNewSession={handleNewSession}
            onSessionSelect={handleSessionSelect}
          />
        )}
        {activeTab === "gate" && (
          <div className="h-full overflow-y-auto">
            <GatedDemo walletAddress={walletAddress} />
          </div>
        )}
        {activeTab === "admin" && isCreator && (
          <AdminDashboard fid={fid} />
        )}
      </div>
    </div>
  );
}
