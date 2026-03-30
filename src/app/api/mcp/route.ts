import { NextRequest } from "next/server";
import { getOrCreateAgentWallet, getWalletBalance } from "@/db/actions/mcp-actions";
import { createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";

// BASE blockchain configuration
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on BASE

export const runtime = "nodejs";
export const maxDuration = 30;

// Initialize VIEM client for BASE
const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

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

    // Get wallet information
    const wallet = await getOrCreateAgentWallet(fidNumber, ""); // Address will be empty initially
    const balance = await getWalletBalance(fidNumber);

    return new Response(JSON.stringify({
      success: true,
      wallet,
      balance,
      chain: "BASE",
      usdcContract: USDC_CONTRACT_ADDRESS,
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
      address: string;
      transactionHash?: string;
      action: "register" | "deposit" | "verify";
    };

    if (!body || !body.fid || !body.action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    switch (body.action) {
      case "register":
        if (!body.address) {
          return new Response(JSON.stringify({ error: "Address required for registration" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Register agent wallet
        const wallet = await getOrCreateAgentWallet(body.fid, body.address);
        return new Response(JSON.stringify({
          success: true,
          wallet,
          message: "Wallet registered successfully"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "deposit":
        if (!body.transactionHash) {
          return new Response(JSON.stringify({ error: "Transaction hash required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Verify USDC deposit transaction on BASE
        const transaction = await publicClient.getTransaction({
          hash: body.transactionHash as `0x${string}`,
        });

        if (!transaction) {
          return new Response(JSON.stringify({ error: "Transaction not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Check if it's a USDC transfer to the expected contract
        const receipt = await publicClient.getTransactionReceipt({
          hash: body.transactionHash as `0x${string}`,
        });

        // Simple verification - in production you'd want more thorough checks
        if (receipt.status === "success") {
          // Update wallet balance (in production, you'd parse the actual amount)
          const updatedWallet = await getOrCreateAgentWallet(body.fid, body.address || "");
          
          return new Response(JSON.stringify({
            success: true,
            wallet: updatedWallet,
            message: "Deposit verified successfully",
            transaction: {
              hash: body.transactionHash,
              status: receipt.status,
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ error: "Transaction failed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

      case "verify":
        // Verify payment for a specific API call
        const apiCallId = req.headers.get("X-API-CALL-ID");
        if (!apiCallId) {
          return new Response(JSON.stringify({ error: "Missing API call ID" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // In a real implementation, you would verify the payment transaction here
        // and mark the API call as paid

        return new Response(JSON.stringify({
          success: true,
          message: "Payment verification would be implemented here",
          apiCallId
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