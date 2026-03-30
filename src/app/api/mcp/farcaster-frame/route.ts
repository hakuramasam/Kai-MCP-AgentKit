import { NextRequest } from "next/server";
import { FarcasterMCPHandlers } from "@/features/farcaster-mcp/farcaster-mcp-integration";

export const runtime = "edge"; // Edge runtime for fast Farcaster frame responses

export async function POST(req: NextRequest) {
  try {
    const { fid } = await req.json();
    
    if (!fid || isNaN(fid)) {
      return new Response(JSON.stringify({
        error: "Invalid or missing FID"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle Farcaster frame request
    return await FarcasterMCPHandlers.handleFrameRequest(Number(fid));

  } catch (error) {
    console.error("Farcaster MCP Frame Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const fid = req.nextUrl.searchParams.get('fid');
    
    if (!fid || isNaN(Number(fid))) {
      return new Response(JSON.stringify({
        error: "Invalid or missing FID"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle Farcaster frame request
    return await FarcasterMCPHandlers.handleFrameRequest(Number(fid));

  } catch (error) {
    console.error("Farcaster MCP Frame Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}