"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DashboardPage() {
  const router = useRouter();
  const [fid, setFid] = useState<string>("");
  const [wallet, setWallet] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mock FID for demo - in real app this would come from auth
  useEffect(() => {
    setFid("12345"); // Demo FID
  }, []);

  const fetchWalletInfo = async () => {
    if (!fid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp`, {
        headers: {
          "X-FID": fid,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setWallet(data.wallet);
      } else {
        setError(data.error || "Failed to fetch wallet info");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchReputation = async () => {
    if (!fid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp/reputation`, {
        headers: {
          "X-FID": fid,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setReputation(data.reputation);
      } else {
        setError(data.error || "Failed to fetch reputation");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!fid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp/communicate`, {
        headers: {
          "X-FID": fid,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages);
      } else {
        setError(data.error || "Failed to fetch messages");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const registerWallet = async () => {
    if (!fid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FID": fid,
        },
        body: JSON.stringify({
          fid: parseInt(fid),
          address: "0x" + Array(40).fill("0").join(""), // Demo address
          action: "register",
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setWallet(data.wallet);
      } else {
        setError(data.error || "Failed to register wallet");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Agent Dashboard</h1>
      
      {fid && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">Connected as FID: {fid}</p>
        </div>
      )}

      <Tabs defaultValue="wallet" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="reputation">Reputation</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>Agent Wallet (BASE Chain)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!wallet ? (
                  <div>
                    <p className="mb-4">No wallet registered for this agent.</p>
                    <Button onClick={registerWallet} disabled={loading}>
                      {loading ? "Registering..." : "Register Wallet"}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Address</p>
                        <p className="font-mono truncate">{wallet.address || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">USDC Balance</p>
                        <p className="font-bold text-green-600">{wallet.usdcBalance} USDC</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button onClick={fetchWalletInfo} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh Balance"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reputation">
          <Card>
            <CardHeader>
              <CardTitle>Agent Reputation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!reputation ? (
                  <Button onClick={fetchReputation} disabled={loading}>
                    {loading ? "Loading..." : "Load Reputation"}
                  </Button>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500">Reputation Score</p>
                        <p className="text-2xl font-bold">{reputation.reputationScore}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Trust Level</p>
                        <p className="text-xl font-semibold capitalize">{reputation.trustLevel}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Successful Calls</p>
                        <p className="font-bold text-green-600">{reputation.successfulCalls}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Failed Calls</p>
                        <p className="font-bold text-red-600">{reputation.failedCalls}</p>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <Button onClick={fetchReputation} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh Reputation"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Agent Communication</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div>
                    <p className="mb-4">No messages yet.</p>
                    <Button onClick={fetchMessages} disabled={loading}>
                      {loading ? "Loading..." : "Check for Messages"}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {messages.map((msg) => (
                        <div key={msg.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">
                                {msg.messageType.toUpperCase()} from FID: {msg.senderFid}
                              </p>
                              <p className="text-sm text-gray-500">
                                {new Date(msg.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              msg.status === "read" ? "bg-blue-100 text-blue-800" :
                              msg.status === "delivered" ? "bg-green-100 text-green-800" :
                              "bg-gray-100 text-gray-800"
                            }`}>
                              {msg.status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Button onClick={fetchMessages} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh Messages"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}
    </div>
  );
}