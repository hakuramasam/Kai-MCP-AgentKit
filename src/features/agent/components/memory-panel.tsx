"use client";

import { useState, useEffect } from "react";
import { cn } from "@neynar/ui";
import { getMemories, deleteMemory } from "@/db/actions/chat-actions";
import type { AgentMemory } from "@/db/actions/chat-actions";

interface MemoryPanelProps {
  fid: number;
  onClose: () => void;
  refreshKey?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  preference: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  fact: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  context: "text-purple-300 bg-purple-500/10 border-purple-500/20",
  general: "text-gray-300 bg-white/5 border-white/10",
};

const CATEGORY_ICONS: Record<string, string> = {
  preference: "⭐",
  fact: "📌",
  context: "🗂",
  general: "💡",
};

export function MemoryPanel({ fid, onClose, refreshKey }: MemoryPanelProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMemories() {
    setLoading(true);
    try {
      const data = await getMemories(fid, 30);
      setMemories(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMemories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, refreshKey]);

  async function handleDelete(id: string) {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  const grouped = memories.reduce<Record<string, AgentMemory[]>>((acc, m) => {
    const cat = m.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h2 className="text-sm font-semibold text-white">Agent Memory</h2>
          <span className="text-xs text-gray-500 bg-white/6 px-2 py-0.5 rounded-full">
            {memories.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/8 transition-all"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <span className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🌱</p>
            <p className="text-sm text-gray-400">No memories yet</p>
            <p className="text-xs text-gray-600 mt-1">
              The agent will save facts as you chat
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">{CATEGORY_ICONS[category] ?? "💡"}</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {category}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((memory) => (
                    <div
                      key={memory.id}
                      className={cn(
                        "group flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs",
                        CATEGORY_COLORS[memory.category] ?? CATEGORY_COLORS.general,
                      )}
                    >
                      <p className="flex-1 leading-relaxed">{memory.content}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-white/20 text-xs">{memory.importance}/10</span>
                        <button
                          onClick={() => void handleDelete(memory.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all w-5 h-5 flex items-center justify-center rounded"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
