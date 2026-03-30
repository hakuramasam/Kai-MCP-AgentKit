import { NextRequest } from "next/server";
import { FarcasterMCPClient } from "@/features/farcaster-mcp/farcaster-mcp-integration";

export const runtime = "edge"; // Edge runtime for fast Farcaster responses

export async function POST(req: NextRequest) {
  try {
    const { fid, action } = await req.json();
    
    if (!fid || isNaN(fid)) {
      return new Response(JSON.stringify({
        error: "Invalid or missing FID"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!action || !action.type) {
      return new Response(JSON.stringify({
        error: "Invalid or missing action"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize Farcaster MCP client
    const client = await FarcasterMCPClient.initializeForFarcasterUser(Number(fid));
    
    // Handle the action
    const result = await client.handleFarcasterAction(action);

    if (!result.success) {
      return new Response(JSON.stringify({
        error: result.error || "Action failed"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate Farcaster frame response
    const frameResponse = {
      title: `AgentKit MCP - Action Completed`,
      description: result.result?.message || "Action processed successfully",
      image: `https://${process.env.NEXT_PUBLIC_VERCEL_PRODUCTION_URL || 'localhost:3000'}/api/mcp/farcaster-success`,
      buttons: [
        {
          label: "✅ Done",
          action: "post_redirect"
        }
      ]
    };

    return new Response(JSON.stringify(frameResponse), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Farcaster MCP Action Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}