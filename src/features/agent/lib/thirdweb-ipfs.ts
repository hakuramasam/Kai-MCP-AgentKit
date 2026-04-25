/**
 * IPFS upload and retrieval via Thirdweb Storage.
 * Uploads JSON objects or text strings to IPFS and returns:
 *   - IPFS URI (ipfs://Qm...)
 *   - HTTP gateway URL (https://ipfs.io/ipfs/...)
 *   - Thirdweb gateway URL (faster CDN)
 */

import { createThirdwebClient } from "thirdweb";
import { upload, download } from "thirdweb/storage";

function getClient() {
  const clientId = process.env.THIRDWEB_CLIENT_ID;
  if (!clientId)
    throw new Error(
      "THIRDWEB_CLIENT_ID is not configured. Add it to .env — get a free key at thirdweb.com/dashboard",
    );
  return createThirdwebClient({ clientId });
}

const IPFS_GATEWAYS = {
  thirdweb: (cid: string) => `https://${process.env.THIRDWEB_CLIENT_ID}.ipfscdn.io/ipfs/${cid}`,
  public: (cid: string) => `https://ipfs.io/ipfs/${cid}`,
  cloudflare: (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}`,
};

function extractCid(uri: string): string {
  return uri.replace("ipfs://", "").split("/")[0] ?? "";
}

export interface IPFSUploadResult {
  success: boolean;
  ipfsUri?: string;
  cid?: string;
  gatewayUrl?: string;
  thirdwebUrl?: string;
  cloudflareUrl?: string;
  contentType?: string;
  sizeBytes?: number;
  error?: string;
}

export interface IPFSFetchResult {
  success: boolean;
  ipfsUri?: string;
  cid?: string;
  content?: unknown;
  contentType?: string;
  error?: string;
}

/**
 * Upload a JSON object or text string to IPFS via Thirdweb Storage.
 */
export async function uploadToIPFS(
  content: string | Record<string, unknown>,
): Promise<IPFSUploadResult> {
  try {
    const client = getClient();

    let blob: Blob;
    let contentType: string;

    if (typeof content === "string") {
      // Try to detect JSON
      try {
        JSON.parse(content);
        blob = new Blob([content], { type: "application/json" });
        contentType = "application/json";
      } catch {
        blob = new Blob([content], { type: "text/plain" });
        contentType = "text/plain";
      }
    } else {
      const json = JSON.stringify(content, null, 2);
      blob = new Blob([json], { type: "application/json" });
      contentType = "application/json";
    }

    // Thirdweb v5 upload accepts a File-like object
    const file = new File([blob], "upload", { type: contentType });

    const uri = await upload({ client, files: [file] });
    const ipfsUri = Array.isArray(uri) ? uri[0] : uri;

    if (!ipfsUri) {
      return { success: false, error: "Upload returned no URI" };
    }

    const cid = extractCid(ipfsUri);
    const clientId = process.env.THIRDWEB_CLIENT_ID ?? "";

    return {
      success: true,
      ipfsUri,
      cid,
      gatewayUrl: IPFS_GATEWAYS.public(cid),
      thirdwebUrl: clientId
        ? `https://${clientId}.ipfscdn.io/ipfs/${cid}`
        : IPFS_GATEWAYS.public(cid),
      cloudflareUrl: IPFS_GATEWAYS.cloudflare(cid),
      contentType,
      sizeBytes: blob.size,
    };
  } catch (err) {
    return {
      success: false,
      error: `IPFS upload failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fetch content from IPFS by URI or CID.
 * Accepts: "ipfs://Qm...", "Qm...", or a full gateway URL.
 */
export async function fetchFromIPFS(uriOrCid: string): Promise<IPFSFetchResult> {
  try {
    const client = getClient();

    // Normalize to ipfs:// URI
    let ipfsUri: string;
    if (uriOrCid.startsWith("ipfs://")) {
      ipfsUri = uriOrCid;
    } else if (uriOrCid.startsWith("http")) {
      // Extract CID from gateway URL
      const match = uriOrCid.match(/\/ipfs\/([A-Za-z0-9]+)/);
      if (!match) {
        return { success: false, error: "Cannot extract CID from URL" };
      }
      ipfsUri = `ipfs://${match[1]}`;
    } else {
      ipfsUri = `ipfs://${uriOrCid}`;
    }

    const cid = extractCid(ipfsUri);

    const res = await download({ client, uri: ipfsUri });
    const text = await res.text();

    let content: unknown = text;
    let contentType = "text/plain";

    // Try to parse as JSON
    try {
      content = JSON.parse(text);
      contentType = "application/json";
    } catch {
      content = text;
    }

    return {
      success: true,
      ipfsUri,
      cid,
      content,
      contentType,
    };
  } catch (err) {
    return {
      success: false,
      error: `IPFS fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
