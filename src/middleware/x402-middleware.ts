import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getWalletBalance, logApiCall } from "@/db/actions/mcp-actions";

// API endpoints that require payment
const PAID_ENDPOINTS = [
  "/api/mcp/*",
  "/api/agent/*", // Existing agent endpoints now require payment for write operations
];

// Free endpoints (read operations)
const FREE_ENDPOINTS = [
  "/api/status",
  "/api/health",
  "/api/agent/status",
];

// Pricing structure for different API operations
const API_PRICING: Record<string, string> = {
  "/api/mcp/*": "0.02", // Base price for MCP calls
  "/api/agent/*": "0.05", // Agent operations
  "/api/data/write": "0.10", // Data write operations
  "/api/blockchain/write": "0.20", // Blockchain write operations
};

export async function x402Middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // Skip for free endpoints
  if (FREE_ENDPOINTS.some(endpoint => pathname.startsWith(endpoint))) {
    return NextResponse.next();
  }

  // Check if this is a paid endpoint
  const isPaidEndpoint = PAID_ENDPOINTS.some(endpoint => 
    pathname.startsWith(endpoint.replace("*", ""))
  );

  if (!isPaidEndpoint) {
    return NextResponse.next();
  }

  // Extract FID from headers (Farcaster ID)
  const fid = request.headers.get("X-FID");
  if (!fid) {
    return new NextResponse(JSON.stringify({ 
      error: "Missing X-FID header - Farcaster ID required"
    }), { 
      status: 401, 
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber)) {
      return new NextResponse(JSON.stringify({ 
        error: "Invalid FID format"
      }), { 
        status: 400, 
        headers: { "Content-Type": "application/json" }
      });
    }

    // Determine the cost for this API call
    const endpointKey = Object.keys(API_PRICING).find(key => 
      pathname.startsWith(key.replace("*", ""))
    );
    
    const costUsdc = endpointKey ? API_PRICING[endpointKey] : "0.02"; // Default to base price

    // Check wallet balance
    const currentBalance = await getWalletBalance(fidNumber);
    
    if (parseFloat(currentBalance) < parseFloat(costUsdc)) {
      return new NextResponse(JSON.stringify({ 
        error: "Insufficient USDC balance",
        required: costUsdc,
        available: currentBalance
      }), { 
        status: 402, // Payment Required
        headers: { "Content-Type": "application/json" }
      });
    }

    // Log the API call (will be marked as paid after successful transaction)
    const apiCall = await logApiCall({
      fid: fidNumber,
      endpoint: pathname,
      method,
      costUsdc,
      requestData: method !== "GET" ? await request.json().catch(() => ({})) : {}
    });

    // Add API call ID to request headers for later reference
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("X-API-CALL-ID", apiCall.id);
    requestHeaders.set("X-API-COST", costUsdc);

    // For write operations, we'll need to verify payment after the operation
    // For now, we allow the request to proceed and will verify payment later
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    // Add cost information to response headers
    response.headers.set("X-API-Cost", costUsdc);
    response.headers.set("X-API-Call-ID", apiCall.id);
    response.headers.set("X-Wallet-Balance", currentBalance);

    return response;

  } catch (error) {
    console.error("x402 Middleware Error:", error);
    return new NextResponse(JSON.stringify({ 
      error: "Authentication failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" }
    });
  }
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};