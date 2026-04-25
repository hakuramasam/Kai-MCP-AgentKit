"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@neynar/ui";

const PAYMENT_RECIPIENT = process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? "0xd7e2341c4ca1de1c1f55a9514d8e720a60a9a87e";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatsData {
  revenue: { totalEth: string; totalPayments: number; uniquePayers: number };
  byTool: Array<{ toolName: string; totalEth: string; callCount: number }>;
  topCallers: Array<{ paidBy: string; totalEth: string; callCount: number }>;
  toolStats: Array<{ toolName: string; totalCalls: number; successRate: string; sources: string }>;
  recentPayments: Array<{
    id: string;
    txHash: string;
    paidBy: string;
    toolName: string;
    amountEth: string;
    endpoint: string;
    createdAt: string;
  }>;
  dailyRevenue: Array<{ date: string; totalEth: string; payments: number }>;
  wallet: { address: string; ethBalance: string; usdcBalance: string } | null;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash: string) {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function fmtEth(eth: string | number) {
  const n = parseFloat(String(eth));
  if (isNaN(n)) return "0 ETH";
  if (n === 0) return "0 ETH";
  if (n < 0.000001) return `${(n * 1e9).toFixed(2)} Gwei`;
  return `${n.toFixed(6)} ETH`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 border",
        accent
          ? "bg-violet-500/10 border-violet-500/30"
          : "bg-white/5 border-white/10",
      )}
    >
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-xl font-bold", accent ? "text-violet-300" : "text-white")}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AdminDashboardProps {
  fid: number;
}

export function AdminDashboard({ fid }: AdminDashboardProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "tools" | "callers" | "ledger" | "checklist">("overview");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-fid": String(fid) },
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as StatsData;
      setStats(data);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [fid]);

  useEffect(() => { void load(); }, [load]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-white font-semibold mb-1">Access denied</p>
          <p className="text-sm text-gray-400">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const totalEth = parseFloat(stats.revenue.totalEth || "0");

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 flex-shrink-0">
        <div>
          <h2 className="text-base font-bold text-white">Admin Dashboard</h2>
          <p className="text-xs text-gray-500">
            {refreshedAt ? `Updated ${timeAgo(refreshedAt.toISOString())}` : "AgentKit"}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/10 flex-shrink-0 overflow-x-auto">
        {(["overview", "tools", "callers", "ledger", "checklist"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap",
              tab === t
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            {/* Revenue KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Revenue"
                value={fmtEth(totalEth)}
                sub={`${stats.revenue.totalPayments} payments`}
                accent
              />
              <StatCard
                label="Unique Payers"
                value={String(stats.revenue.uniquePayers)}
                sub="distinct addresses"
              />
            </div>

            {/* Wallet */}
            {stats.wallet && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">
                  Server Wallet
                </p>
                <p className="text-xs text-gray-400 font-mono mb-2 break-all">
                  {stats.wallet.address}
                </p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs text-gray-500">ETH</p>
                    <p className="text-white font-semibold">{stats.wallet.ethBalance}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">USDC</p>
                    <p className="text-white font-semibold">{stats.wallet.usdcBalance}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Daily revenue chart (text bars) */}
            {stats.dailyRevenue.length > 0 && (
              <div>
                <SectionTitle>7-Day Revenue</SectionTitle>
                <div className="space-y-2">
                  {stats.dailyRevenue.map((d) => {
                    const eth = parseFloat(d.totalEth || "0");
                    const maxEth = Math.max(...stats.dailyRevenue.map((r) => parseFloat(r.totalEth || "0")), 0.000001);
                    const pct = Math.max((eth / maxEth) * 100, eth > 0 ? 4 : 0);
                    return (
                      <div key={d.date} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                          {d.date.slice(5)}
                        </span>
                        <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-600 to-purple-500 rounded transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
                          {fmtEth(eth)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top tools by revenue */}
            {stats.byTool.length > 0 && (
              <div>
                <SectionTitle>Top Tools by Revenue</SectionTitle>
                <div className="space-y-2">
                  {stats.byTool.slice(0, 5).map((t) => (
                    <div key={t.toolName} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{t.toolName}</span>
                      <div className="text-right">
                        <p className="text-xs text-violet-300 font-medium">{fmtEth(t.totalEth)}</p>
                        <p className="text-xs text-gray-500">{t.callCount} calls</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.revenue.totalPayments === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">💳</p>
                <p className="text-gray-400 text-sm">No payments yet</p>
                <p className="text-gray-500 text-xs mt-1">Revenue will appear once external agents start paying for tools via A2A or MCP</p>
              </div>
            )}
          </>
        )}

        {/* ── TOOLS ── */}
        {tab === "tools" && (
          <>
            <SectionTitle>Tool Usage Analytics</SectionTitle>
            {stats.toolStats.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-gray-400 text-sm">No tool calls logged yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.toolStats.map((t) => (
                  <div key={t.toolName} className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{t.toolName}</span>
                      <span className="text-xs text-emerald-400">{t.successRate}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{t.totalCalls} calls</span>
                      {t.sources && (
                        <span className="text-xs text-gray-500">{t.sources}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CALLERS ── */}
        {tab === "callers" && (
          <>
            <SectionTitle>Top Paying Callers</SectionTitle>
            {stats.topCallers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">👥</p>
                <p className="text-gray-400 text-sm">No external callers yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.topCallers.map((c, i) => (
                  <div key={c.paidBy} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                    <span className="text-lg font-bold text-gray-600 w-6 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={`https://basescan.org/address/${c.paidBy}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-violet-300 hover:text-violet-200 transition-colors"
                      >
                        {shortAddr(c.paidBy)}
                      </a>
                      <p className="text-xs text-gray-500">{c.callCount} calls</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-300">{fmtEth(c.totalEth)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CHECKLIST ── */}
        {tab === "checklist" && (
          <div className="space-y-6">

            {/* Table 1 — Security Hardening */}
            <div>
              <SectionTitle>🔒 Security Hardening</SectionTitle>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-7"></th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Item</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium hidden sm:table-cell">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { done: true,  item: "send_eth blocked on A2A & MCP",        detail: "Returns 403 — external agents cannot drain server wallet" },
                      { done: true,  item: "Replay attack prevention",              detail: "Nonce consumed on first use; same tx+nonce rejected forever" },
                      { done: true,  item: "Tx freshness window",                   detail: "Payments older than 5 min rejected — prevents reuse of old txs" },
                      { done: true,  item: "check_wallet_balance address guard",    detail: "External callers must supply explicit address" },
                      { done: true,  item: "get_recent_transactions address guard", detail: "External callers must supply explicit address" },
                      { done: true,  item: "HMAC-SHA256 bearer tokens",             detail: "Signed with PAYMENT_SECRET; verified on every token-reuse call" },
                      { done: true,  item: "IP rate limiting (60 req/min)",         detail: "Sliding window per IP before any payment" },
                      { done: true,  item: "Address rate limiting (300 req/min)",   detail: "Upgraded limit after payment verified — tied to ETH address" },
                      { done: true,  item: "Server wallet self-transfer blocked",   detail: "send_eth rejects recipient === server wallet address" },
                      { done: false, item: "Set strong PAYMENT_SECRET env var",     detail: "Add PAYMENT_SECRET=<32+ random bytes> in the env vars panel" },
                      { done: false, item: "Fund server wallet with ETH",           detail: `Send ETH to ${PAYMENT_RECIPIENT.slice(0, 10)}… on Base for gas` },
                    ].map((row) => (
                      <tr key={row.item} className={cn("transition-colors", row.done ? "bg-transparent" : "bg-amber-500/5")}>
                        <td className="px-3 py-2.5 text-center">
                          {row.done
                            ? <span className="text-emerald-400">✓</span>
                            : <span className="text-amber-400">○</span>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={row.done ? "text-gray-200" : "text-amber-200 font-medium"}>{row.item}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 hidden sm:table-cell">{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-600 mt-2 px-1">✓ done &nbsp;○ still needed</p>
            </div>

            {/* Table 2 — Endpoints & Discovery */}
            <div>
              <SectionTitle>🌐 Endpoints &amp; Discovery</SectionTitle>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-7"></th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Endpoint</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium hidden sm:table-cell">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { done: true,  path: "GET  /api/a2a",               purpose: "Discovery — lists all tools, pricing, and payment instructions" },
                      { done: true,  path: "POST /api/a2a",               purpose: "Tool execution — REST interface with x402 paywall" },
                      { done: true,  path: "POST /api/mcp",               purpose: "MCP JSON-RPC 2.0 — for Claude Desktop, Cursor, and MCP clients" },
                      { done: true,  path: "GET  /api/tools",             purpose: "Public tool catalog — full params, prices, and tier groupings" },
                      { done: true,  path: "GET  /.well-known/agent.json",purpose: "A2A agent discovery — capabilities, endpoints, payment schema" },
                      { done: true,  path: "GET  /api/stats",             purpose: "Public aggregates — non-sensitive tool call counts" },
                      { done: true,  path: "GET  /api/admin/stats",       purpose: "FID-gated admin stats — revenue, callers, ledger" },
                      { done: true,  path: "POST /api/agent",             purpose: "Internal chat endpoint — free, authenticated via Farcaster" },
                      { done: false, path: "Add BASE_RPC_URL env var",    purpose: "Optional: use a dedicated RPC (Alchemy/Infura) for tx verification" },
                      { done: false, path: "Add Basescan API key",        purpose: "Optional: improves get_recent_transactions reliability" },
                    ].map((row) => (
                      <tr key={row.path} className={cn("transition-colors", row.done ? "bg-transparent" : "bg-amber-500/5")}>
                        <td className="px-3 py-2.5 text-center">
                          {row.done
                            ? <span className="text-emerald-400">✓</span>
                            : <span className="text-amber-400">○</span>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("font-mono", row.done ? "text-violet-300" : "text-amber-300")}>{row.path}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 hidden sm:table-cell">{row.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 3 — Tool Pricing */}
            <div>
              <SectionTitle>💳 Tool Pricing</SectionTitle>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Tool</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">ETH</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium hidden sm:table-cell">~USD</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { tool: "calculator",                price: "0",        tier: "FREE",     icon: "🧮" },
                      { tool: "get_weather",               price: "0.00001",  tier: "light",    icon: "🌤" },
                      { tool: "analyze_data",              price: "0.00001",  tier: "light",    icon: "📊" },
                      { tool: "market_data",               price: "0.00001",  tier: "light",    icon: "📈" },
                      { tool: "base_tx_lookup",            price: "0.00001",  tier: "light",    icon: "🔗" },
                      { tool: "read_contract",             price: "0.00001",  tier: "light",    icon: "📜" },
                      { tool: "save_memory",               price: "0.00003",  tier: "medium",   icon: "🧠" },
                      { tool: "recall_memory",             price: "0.00003",  tier: "medium",   icon: "💭" },
                      { tool: "web_search",                price: "0.00003",  tier: "medium",   icon: "🔍" },
                      { tool: "text_analysis",             price: "0.00003",  tier: "medium",   icon: "🔬" },
                      { tool: "nft_data",                  price: "0.00003",  tier: "medium",   icon: "🎨" },
                      { tool: "ipfs",                      price: "0.00003",  tier: "medium",   icon: "📦" },
                      { tool: "fetch_url",                 price: "0.00005",  tier: "standard", icon: "🌐" },
                      { tool: "run_code",                  price: "0.00005",  tier: "standard", icon: "⚙️" },
                      { tool: "get_recent_transactions",   price: "0.00005",  tier: "standard", icon: "📋" },
                      { tool: "image_caption",             price: "0.00005",  tier: "standard", icon: "🖼" },
                      { tool: "check_wallet_balance",      price: "0.0001",   tier: "heavy",    icon: "💰" },
                      { tool: "code_review",               price: "0.0001",   tier: "heavy",    icon: "🛡" },
                      { tool: "thirdweb_ai",               price: "0.0001",   tier: "heavy",    icon: "🔮" },
                    ].map((row) => {
                      const usd = row.price === "0" ? "$0.00" : `$${(parseFloat(row.price) * 3000).toFixed(4)}`;
                      const tierColor =
                        row.tier === "FREE"     ? "text-emerald-400" :
                        row.tier === "light"    ? "text-blue-400" :
                        row.tier === "medium"   ? "text-violet-400" :
                        row.tier === "standard" ? "text-amber-400" :
                        "text-red-400";
                      return (
                        <tr key={row.tool} className="hover:bg-white/5 transition-colors">
                          <td className="px-3 py-2 text-gray-200">
                            <span className="mr-2">{row.icon}</span>{row.tool}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-300">
                            {row.price === "0" ? "FREE" : row.price}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell">{usd}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={cn("font-medium", tierColor)}>{row.tier}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-600 mt-2 px-1">USD estimates at $3,000 / ETH</p>
            </div>

          </div>
        )}

        {/* ── LEDGER ── */}
        {tab === "ledger" && (
          <>
            <SectionTitle>Recent Payments</SectionTitle>
            {stats.recentPayments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-gray-400 text-sm">No payments recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.recentPayments.map((p) => (
                  <div key={p.id} className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-white">{p.toolName}</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            p.endpoint === "a2a"
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-purple-500/20 text-purple-300",
                          )}>
                            {p.endpoint.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          from{" "}
                          <a
                            href={`https://basescan.org/address/${p.paidBy}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-400 hover:text-violet-300 font-mono"
                          >
                            {shortAddr(p.paidBy)}
                          </a>
                        </p>
                        <a
                          href={`https://basescan.org/tx/${p.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-600 hover:text-gray-400 font-mono transition-colors"
                        >
                          tx: {shortHash(p.txHash)}
                        </a>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-amber-300">{fmtEth(p.amountEth)}</p>
                        <p className="text-xs text-gray-500">{timeAgo(p.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
