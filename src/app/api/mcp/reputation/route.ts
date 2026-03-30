import { NextRequest } from "next/server";
import { 
  getOrCreateAgentReputation,
  updateReputationScore,
  recordSuccessfulCall,
  recordFailedCall 
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

    // Get reputation for this agent
    const reputation = await getOrCreateAgentReputation(fidNumber);
    
    return new Response(JSON.stringify({
      success: true,
      reputation,
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
      fid: number;
      action: "success" | "failure" | "boost" | "penalty";
      amount?: number;
    };

    if (!body || !body.fid || !body.action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    switch (body.action) {
      case "success":
        const successReputation = await recordSuccessfulCall(body.fid);
        return new Response(JSON.stringify({
          success: true,
          reputation: successReputation,
          message: "Successful call recorded"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "failure":
        const failureReputation = await recordFailedCall(body.fid);
        return new Response(JSON.stringify({
          success: true,
          reputation: failureReputation,
          message: "Failed call recorded"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "boost":
        if (!body.amount) {
          return new Response(JSON.stringify({ error: "Amount required for boost" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const boostedReputation = await updateReputationScore(body.fid, body.amount);
        return new Response(JSON.stringify({
          success: true,
          reputation: boostedReputation,
          message: "Reputation boosted"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "penalty":
        if (!body.amount) {
          return new Response(JSON.stringify({ error: "Amount required for penalty" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const penalizedReputation = await updateReputationScore(body.fid, -body.amount);
        return new Response(JSON.stringify({
          success: true,
          reputation: penalizedReputation,
          message: "Reputation penalty applied"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}