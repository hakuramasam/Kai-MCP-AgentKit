import { NextRequest } from "next/server";
import { publicConfig } from "@/config/public-config";
import { getShareImageResponse } from "@/neynar-farcaster-sdk/nextjs";

// Cache for 1 hour - query strings create separate cache entries
export const revalidate = 3600;

const { appEnv, heroImageUrl, imageUrl } = publicConfig;

const showDevWarning = appEnv !== "production";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const personalize = searchParams.get("personalize") === "true";

  // For personalized share images (scores, results, etc.):
  // 1. Import parseNextRequestSearchParams from "@/neynar-farcaster-sdk/nextjs"
  // 2. Extract params: const { score, username } = parseNextRequestSearchParams(request)
  // 3. Replace null below with overlay JSX (every <div> MUST have display: "flex")

  return getShareImageResponse(
    { type, heroImageUrl, imageUrl, showDevWarning, personalize },
    null,
  );
}
