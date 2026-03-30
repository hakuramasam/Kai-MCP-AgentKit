"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ApiStatusPage() {
  const [fid, setFid] = useState("12345");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testApiCall = async (endpoint: string, method: string = "GET") => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const options: RequestInit = {
        method,
        headers: {
          "X-FID": fid,
          "Content-Type": "application/json",
        },
      };

      if (method !== "GET") {
        options.body = JSON.stringify({ test: "data" });
      }

      const res = await fetch(endpoint, options);
      const data = await res.json();

      setResponse({
        status: res.status,
        data,
        headers: Object.fromEntries(res.headers.entries()),
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">API Status & x402 Testing</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fid">Farcaster ID (FID)</Label>
              <Input
                id="fid"
                value={fid}
                onChange={(e) => setFid(e.target.value)}
                placeholder="Enter FID"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Free Endpoints (No Payment Required)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => testApiCall("/api/mcp")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>GET /api/mcp</span>
              <span>Wallet Info</span>
            </Button>
            <Button
              onClick={() => testApiCall("/api/mcp/reputation")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>GET /api/mcp/reputation</span>
              <span>Reputation</span>
            </Button>
            <Button
              onClick={() => testApiCall("/api/mcp/communicate")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>GET /api/mcp/communicate</span>
              <span>Messages</span>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paid Endpoints (x402 Required)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => testApiCall("/api/mcp", "POST")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>POST /api/mcp</span>
              <span>Register Wallet</span>
            </Button>
            <Button
              onClick={() => testApiCall("/api/agent")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>POST /api/agent</span>
              <span>Agent Operations</span>
            </Button>
            <Button
              onClick={() => testApiCall("/api/mcp/communicate", "POST")}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>POST /api/mcp/communicate</span>
              <span>Send Message</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Processing request...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-4 border-red-200">
          <CardContent className="p-4">
            <div className="text-red-600 font-medium">Error: {error}</div>
          </CardContent>
        </Card>
      )}

      {response && (
        <Card>
          <CardHeader>
            <CardTitle>API Response</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Status</h3>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-white text-sm font-medium ${
                    response.status >= 200 && response.status < 300 ? "bg-green-500" :
                    response.status >= 400 && response.status < 500 ? "bg-yellow-500" :
                    "bg-red-500"
                  }`}>
                    {response.status}
                  </span>
                  <span className="text-sm text-gray-600">
                    {response.status >= 200 && response.status < 300 ? "Success" :
                     response.status >= 400 && response.status < 500 ? "Client Error" :
                     "Server Error"}
                  </span>
                </div>
              </div>

              {response.headers["x-api-cost"] && (
                <div>
                  <h3 className="font-semibold mb-2">x402 Payment Info</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">API Cost</div>
                      <div className="font-mono">{response.headers["x-api-cost"]} USDC</div>
                    </div>
                    <div>
                      <div className="text-gray-500">API Call ID</div>
                      <div className="font-mono truncate">{response.headers["x-api-call-id"]}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Wallet Balance</div>
                      <div className="font-mono">{response.headers["x-wallet-balance"]} USDC</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">Response Data</h3>
                <div className="bg-gray-100 p-3 rounded font-mono text-sm max-h-64 overflow-y-auto">
                  <pre>{JSON.stringify(response.data, null, 2)}</pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>x402 Protocol Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <p>
              This API implements the <strong>x402 protocol</strong> for pay-per-call access. Agents must have sufficient USDC balance on the BASE blockchain to make paid API calls.
            </p>
            <div>
              <h4 className="font-semibold mb-2">Pricing Structure:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Free:</strong> All read operations (GET requests)</li>
                <li><strong>0.02 USDC:</strong> Basic API calls</li>
                <li><strong>0.05 USDC:</strong> Agent operations</li>
                <li><strong>0.10 USDC:</strong> Data write operations</li>
                <li><strong>0.20 USDC:</strong> Blockchain write operations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">How it works:</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li>Agent makes API request with X-FID header</li>
                <li>Middleware checks wallet balance</li>
                <li>If sufficient funds, request proceeds</li>
                <li>After successful execution, payment is recorded</li>
                <li>Wallet balance is updated</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}