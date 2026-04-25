/**
 * Crypto market data via CoinGecko public API (no API key required).
 * Supports prices, 24h change, market cap, volume, and historical sparkline.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Popular token name → CoinGecko id mapping (expanded list)
const TOKEN_ID_MAP: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  matic: "matic-network",
  polygon: "matic-network",
  op: "optimism",
  optimism: "optimism",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  base: "ethereum", // Base is ETH-based; fall back to ETH
  link: "chainlink",
  chainlink: "chainlink",
  uni: "uniswap",
  uniswap: "uniswap",
  aave: "aave",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  shib: "shiba-inu",
  ada: "cardano",
  cardano: "cardano",
  dot: "polkadot",
  polkadot: "polkadot",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  bnb: "binancecoin",
  usdc: "usd-coin",
  usdt: "tether",
  dai: "dai",
  cbeth: "coinbase-wrapped-staked-eth",
  wbtc: "wrapped-bitcoin",
  farcaster: "farcaster",
  degen: "degen-base",
};

function resolveId(token: string): string {
  const lower = token.toLowerCase().trim();
  return TOKEN_ID_MAP[lower] ?? lower;
}

export interface MarketDataResult {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  price: number;
  priceFormatted: string;
  change24h: number;
  change24hFormatted: string;
  marketCap: number;
  marketCapFormatted: string;
  volume24h: number;
  high24h: number;
  low24h: number;
  allTimeHigh?: number;
  circulatingSupply?: number;
  rank?: number;
  lastUpdated: string;
}

export interface MarketDataResponse {
  success: boolean;
  data?: MarketDataResult;
  error?: string;
}

function formatUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export async function getMarketData(
  token: string,
  vsCurrency = "usd",
): Promise<MarketDataResponse> {
  const coinId = resolveId(token);
  const currency = vsCurrency.toLowerCase();

  try {
    const url =
      `${COINGECKO_BASE}/coins/markets` +
      `?vs_currency=${currency}` +
      `&ids=${encodeURIComponent(coinId)}` +
      `&order=market_cap_desc` +
      `&per_page=1` +
      `&page=1` +
      `&sparkline=false` +
      `&price_change_percentage=24h`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // Try simple price endpoint as fallback
      return await getSimplePrice(coinId, currency);
    }

    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!data || data.length === 0) {
      return { success: false, error: `Token "${token}" not found. Try the full name (e.g. "bitcoin") or CoinGecko id.` };
    }

    const coin = data[0]!;
    const price = coin.current_price as number;
    const change = (coin.price_change_percentage_24h as number) ?? 0;
    const marketCap = (coin.market_cap as number) ?? 0;

    return {
      success: true,
      data: {
        id: coin.id as string,
        symbol: ((coin.symbol as string) ?? "").toUpperCase(),
        name: coin.name as string,
        currency: currency.toUpperCase(),
        price,
        priceFormatted: formatUsd(price),
        change24h: change,
        change24hFormatted: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
        marketCap,
        marketCapFormatted: formatUsd(marketCap),
        volume24h: (coin.total_volume as number) ?? 0,
        high24h: (coin.high_24h as number) ?? price,
        low24h: (coin.low_24h as number) ?? price,
        allTimeHigh: (coin.ath as number) ?? undefined,
        circulatingSupply: (coin.circulating_supply as number) ?? undefined,
        rank: (coin.market_cap_rank as number) ?? undefined,
        lastUpdated: (coin.last_updated as string) ?? new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `CoinGecko request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Fallback: simple price endpoint (fewer fields) */
async function getSimplePrice(
  coinId: string,
  currency: string,
): Promise<MarketDataResponse> {
  const url =
    `${COINGECKO_BASE}/simple/price` +
    `?ids=${encodeURIComponent(coinId)}` +
    `&vs_currencies=${currency}` +
    `&include_24hr_change=true` +
    `&include_market_cap=true` +
    `&include_24hr_vol=true`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    return { success: false, error: `CoinGecko returned ${res.status}` };
  }

  const data = (await res.json()) as Record<string, Record<string, number>>;
  const coin = data[coinId];
  if (!coin) {
    return { success: false, error: `Token "${coinId}" not found on CoinGecko` };
  }

  const price = coin[currency] ?? 0;
  const change = coin[`${currency}_24h_change`] ?? 0;
  const marketCap = coin[`${currency}_market_cap`] ?? 0;

  return {
    success: true,
    data: {
      id: coinId,
      symbol: coinId.toUpperCase(),
      name: coinId,
      currency: currency.toUpperCase(),
      price,
      priceFormatted: formatUsd(price),
      change24h: change,
      change24hFormatted: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
      marketCap,
      marketCapFormatted: formatUsd(marketCap),
      volume24h: coin[`${currency}_24h_vol`] ?? 0,
      high24h: price,
      low24h: price,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/** Look up multiple tokens at once (max 10) */
export async function getMultiMarketData(
  tokens: string[],
  vsCurrency = "usd",
): Promise<Record<string, MarketDataResult | { error: string }>> {
  const results: Record<string, MarketDataResult | { error: string }> = {};

  await Promise.all(
    tokens.slice(0, 10).map(async (token) => {
      const res = await getMarketData(token, vsCurrency);
      results[token] = res.data ?? { error: res.error ?? "Unknown error" };
    }),
  );

  return results;
}
