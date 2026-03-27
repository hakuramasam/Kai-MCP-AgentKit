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

  return getShareImageResponse(
    { type, heroImageUrl, imageUrl, showDevWarning },
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#0a0a0f",
        position: "relative",
      }}
    >
      {/* Hero image background with dark overlay */}
      {heroImageUrl && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
          }}
        >
          <img
            src={heroImageUrl}
            width="100%"
            height="100%"
            style={{
              objectFit: "cover",
              opacity: 0.18,
              width: "100%",
              height: "100%",
            }}
          />
        </div>
      )}

      {/* Dark gradient overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(160deg, rgba(109,40,217,0.15) 0%, rgba(10,10,15,0.85) 60%)",
        }}
      />

      {/* Content — lower-left */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          width: "100%",
          height: "100%",
          padding: 52,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Sparkle icon badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundImage:
                "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              boxShadow: "0 8px 32px rgba(109,40,217,0.45)",
              fontSize: 26,
            }}
          >
            ✦
          </div>

          {/* Title */}
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: "bold",
              color: "white",
              letterSpacing: -1,
              lineHeight: 1.1,
            }}
          >
            AgentKit
          </div>

          {/* Subtitle */}
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "rgba(180,180,210,0.75)",
              fontWeight: 400,
              letterSpacing: 0.2,
            }}
          >
            AI agent with tool calling &amp; memory
          </div>
        </div>
      </div>
    </div>,
  );
}
