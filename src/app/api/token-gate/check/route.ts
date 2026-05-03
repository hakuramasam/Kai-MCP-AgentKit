/**
 * GET /api/token-gate/check
 *
 * Client-side token gate check. Called from useTokenGate hook.
 *
 * Query params:
 *   wallet    - Ethereum address to check
 *   contract  - Token contract address
 *   type      - ERC-20 | ERC-721 | ERC-1155
 *   chainId   - (optional) chain ID, defaults to 8453
 *   tokenId   - (optional) ERC-1155 token ID
 *   minBalance - (optional) minimum balance, defaults to "1"
 */

import { NextRequest, NextResponse } from "next/server";
import { checkTokenGate } from "@/features/agent/lib/token-gate";
import type { TokenType } from "@/features/agent/lib/token-gate";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const wallet = searchParams.get("wallet");
  const contract = searchParams.get("contract");
  const type = searchParams.get("type") as TokenType | null;
  const chainId = parseInt(searchParams.get("chainId") ?? "8453", 10);
  const tokenId = searchParams.get("tokenId") ? parseInt(searchParams.get("tokenId")!, 10) : undefined;
  const minBalance = searchParams.get("minBalance") ?? "1";

  if (!wallet || !contract || !type) {
    return NextResponse.json(
      { error: "Missing required params: wallet, contract, type" },
      { status: 400 },
    );
  }

  if (!["ERC-20", "ERC-721", "ERC-1155"].includes(type)) {
    return NextResponse.json(
      { error: "type must be one of: ERC-20, ERC-721, ERC-1155" },
      { status: 400 },
    );
  }

  const result = await checkTokenGate(wallet, {
    contractAddress: contract,
    tokenType: type,
    chainId,
    tokenId,
    minBalance,
  });

  return NextResponse.json(result);
}
