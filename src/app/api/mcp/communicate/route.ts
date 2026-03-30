import { NextRequest } from "next/server";
import { 
  sendAgentMessage, 
  getAgentMessages,
  markMessageDelivered,
  markMessageRead,
  getOrCreateAgentReputation,
  updateReputationScore 
} from "@/db/actions/mcp-actions";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const fid = req.headers.get("X-FID");
    if (!fid) {
      return new Response(JSON.stringify({ error: "Missing X-FID header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber)) {
      return new Response(JSON.stringify({ error: "Invalid FID format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get messages for this agent
    const messages = await getAgentMessages(fidNumber);
    
    return new Response(JSON.stringify({
      success: true,
      messages,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      senderFid: number;
      receiverFid: number;
      messageType: "request" | "response" | "broadcast";
      content: string;
      relatedApiCallId?: string;
    };

    if (!body || !body.senderFid || !body.receiverFid || !body.messageType || !body.content) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Send the message
    const message = await sendAgentMessage({
      senderFid: body.senderFid,
      receiverFid: body.receiverFid,
      messageType: body.messageType,
      content: body.content,
      relatedApiCallId: body.relatedApiCallId,
    });

    // Update reputation for successful communication
    const senderReputation = await getOrCreateAgentReputation(body.senderFid);
    if (senderReputation.reputationScore < 500) { // Cap at 500 for now
      await updateReputationScore(body.senderFid, 1); // Small reputation boost
    }

    return new Response(JSON.stringify({
      success: true,
      message,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      messageId: string;
      status: "delivered" | "read";
    };

    if (!body || !body.messageId || !body.status) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let updatedMessage;
    if (body.status === "delivered") {
      updatedMessage = await markMessageDelivered(body.messageId);
    } else if (body.status === "read") {
      updatedMessage = await markMessageRead(body.messageId);
    } else {
      return new Response(JSON.stringify({ error: "Invalid status" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: updatedMessage,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}