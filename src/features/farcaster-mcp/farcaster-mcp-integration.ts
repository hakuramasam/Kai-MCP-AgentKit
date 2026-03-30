/**
 * Farcaster MCP Integration
 * Bridges Farcaster Mini-App with AgentKit MCP features
 */

import { getOrCreateAgentWallet, getWalletBalance } from "@/db/actions/mcp-actions";
import { getOrCreateAgentReputation } from "@/db/actions/mcp-actions";
import { sendAgentMessage, getAgentMessages } from "@/db/actions/mcp-actions";

/**
 * Farcaster MCP Client
 * Provides MCP functionality for Farcaster Mini-App users
 */
export class FarcasterMCPClient {
  private fid: number;
  private walletAddress: string;

  constructor(fid: number, walletAddress: string = "") {
    this.fid = fid;
    this.walletAddress = walletAddress;
  }

  /**
   * Initialize agent wallet for Farcaster user
   */
  static async initializeForFarcasterUser(fid: number): Promise<FarcasterMCPClient> {
    // Check if wallet already exists
    const wallet = await getOrCreateAgentWallet(fid, "");
    return new FarcasterMCPClient(fid, wallet.address || "");
  }

  /**
   * Get agent wallet information
   */
  async getWalletInfo(): Promise<{
    fid: number;
    address: string;
    balance: string;
    chain: string;
    currency: string;
  }> {
    const balance = await getWalletBalance(this.fid);
    
    return {
      fid: this.fid,
      address: this.walletAddress || "not-registered",
      balance,
      chain: "BASE",
      currency: "USDC"
    };
  }

  /**
   * Get agent reputation
   */
  async getReputation(): Promise<{
    fid: number;
    score: number;
    trustLevel: string;
    successfulCalls: number;
    failedCalls: number;
  }> {
    const reputation = await getOrCreateAgentReputation(this.fid);
    
    return {
      fid: this.fid,
      score: reputation.reputationScore,
      trustLevel: reputation.trustLevel,
      successfulCalls: reputation.successfulCalls,
      failedCalls: reputation.failedCalls
    };
  }

  /**
   * Send message to another Farcaster agent
   */
  async sendMessageToAgent(
    receiverFid: number,
    content: string,
    messageType: "request" | "response" | "broadcast" = "request"
  ): Promise<{
    success: boolean;
    messageId: string;
    timestamp: string;
  }> {
    const message = await sendAgentMessage({
      senderFid: this.fid,
      receiverFid,
      messageType,
      content
    });

    return {
      success: true,
      messageId: message.id,
      timestamp: message.createdAt.toISOString()
    };
  }

  /**
   * Get messages for this Farcaster agent
   */
  async getMessages(limit: number = 20): Promise<Array<{
    id: string;
    senderFid: number;
    messageType: string;
    content: string;
    status: string;
    timestamp: string;
  }>> {
    const messages = await getAgentMessages(this.fid, limit);
    
    return messages.map(msg => ({
      id: msg.id,
      senderFid: msg.senderFid,
      messageType: msg.messageType,
      content: msg.content,
      status: msg.status,
      timestamp: msg.createdAt.toISOString()
    }));
  }

  /**
   * Get MCP dashboard data for Farcaster user
   */
  async getMcpDashboardData(): Promise<{
    wallet: Awaited<ReturnType<typeof this.getWalletInfo>>;
    reputation: Awaited<ReturnType<typeof this.getReputation>>;
    messageCount: number;
  }> {
    const [wallet, reputation, messages] = await Promise.all([
      this.getWalletInfo(),
      this.getReputation(),
      this.getMessages(1)
    ]);

    return {
      wallet,
      reputation,
      messageCount: messages.length
    };
  }

  /**
   * Farcaster-specific MCP actions
   */
  async handleFarcasterAction(action: {
    type: string;
    data: any;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      switch (action.type) {
        case "mcp_register":
          // Register wallet for Farcaster user
          const wallet = await getOrCreateAgentWallet(this.fid, action.data.address);
          return {
            success: true,
            result: {
              walletAddress: wallet.address,
              message: "Wallet registered for Farcaster MCP"
            }
          };

        case "mcp_send_message":
          // Send message to another agent
          const result = await this.sendMessageToAgent(
            action.data.receiverFid,
            action.data.content,
            action.data.messageType
          );
          return {
            success: true,
            result: {
              messageId: result.messageId,
              message: "Message sent via Farcaster MCP"
            }
          };

        case "mcp_get_dashboard":
          // Get MCP dashboard data
          const dashboardData = await this.getMcpDashboardData();
          return {
            success: true,
            result: dashboardData
          };

        default:
          return {
            success: false,
            error: `Unknown Farcaster MCP action: ${action.type}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

/**
 * Farcaster MCP Utility Functions
 */
export const FarcasterMCPUtils = {
  
  /**
   * Get MCP metadata for Farcaster frame
   */
  getMcpFrameMetadata: (fid: number) => ({
    title: `AgentKit MCP - FID ${fid}`,
    description: `Multi-Agent Communication Protocol for Farcaster agents`,
    image: `/api/mcp/farcaster-frame?fid=${fid}`,
    buttons: [
      {
        label: "View Dashboard",
        action: "link",
        target: `/farcaster-mcp/dashboard?fid=${fid}`
      },
      {
        label: "Send Message",
        action: "post",
        target: `/api/mcp/farcaster-action`
      }
    ]
  }),

  /**
   * Generate Farcaster MCP share content
   */
  generateMcpShareContent: (fid: number, walletBalance: string, reputationScore: number) => ({
    title: `AgentKit MCP - Agent ${fid}`,
    description: `Farcaster agent with ${walletBalance} USDC balance and reputation score ${reputationScore}`,
    hashtags: ["FarcasterMCP", "AgentKit", "Web3Agents", "BASE"],
    mentionFids: [fid]
  })
};

/**
 * Farcaster MCP API Handlers
 */
export const FarcasterMCPHandlers = {
  
  /**
   * Handle Farcaster frame requests for MCP
   */
  async handleFrameRequest(fid: number): Promise<Response> {
    const client = await FarcasterMCPClient.initializeForFarcasterUser(fid);
    const dashboardData = await client.getMcpDashboardData();

    // Generate frame response
    const frameResponse = {
      title: `AgentKit MCP - FID ${fid}`,
      description: `Wallet: ${dashboardData.wallet.balance} USDC | Reputation: ${dashboardData.reputation.score}`,
      image: `https://${process.env.NEXT_PUBLIC_VERCEL_PRODUCTION_URL || 'localhost:3000'}/api/mcp/farcaster-frame?fid=${fid}`,
      buttons: [
        {
          label: "💬 Messages (${dashboardData.messageCount})",
          action: "link",
          target: `/farcaster-mcp/messages?fid=${fid}`
        },
        {
          label: "🔄 Refresh",
          action: "post",
          target: `/api/mcp/farcaster-frame`
        }
      ]
    };

    return new Response(JSON.stringify(frameResponse), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};