import { z } from "zod";
import { changePercent, indicator } from "./domain";
import { engineFetch } from "./feeds/client";
import { instruments, validate, type Observation } from "./feeds/types";
export const assetList = [
  ["BTC", "Bitcoin", "Crypto", 67432.8, 2.84],
  ["ETH", "Ethereum", "Crypto", 3521.46, 1.92],
  ["SOL", "Solana", "Crypto", 172.84, -1.24],
  ["EURUSD", "Euro / US Dollar", "Forex", 1.0842, 0.18],
  ["GBPUSD", "British Pound / US Dollar", "Forex", 1.2734, -0.24],
  ["USDJPY", "US Dollar / Japanese Yen", "Forex", 149.62, 0.32],
  ["AAPL", "Apple Inc.", "Stocks", 228.16, 1.12],
  ["NVDA", "NVIDIA Corporation", "Stocks", 138.25, 3.46],
  ["MSFT", "Microsoft Corporation", "Stocks", 428.76, -0.42],
  ["SPX", "S&P 500", "Indices", 5864.67, 0.82],
  ["NDX", "Nasdaq 100", "Indices", 20412.86, 1.24],
  ["XAU", "Gold", "Commodities", 2748.3, 0.64],
  ["XAG", "Silver", "Commodities", 33.68, 1.08],
  ["WTI", "Crude Oil WTI", "Commodities", 71.24, -1.82],
  ["SPY", "SPDR S&P 500 ETF", "ETFs", 585.82, 0.81],
] as const;
export type Quote = {
  symbol: string;
  name: string;
  category: string;
  price: number;
  change: number | null;
  volume: number | null;
  volumeRatio: number | null;
  volatility: number | null;
  history: { time: string; price: number }[];
  sma: number | null;
  rsi: number | null;
  source: string;
  asOf: string;
  status: "demonstration" | "delayed" | "realtime" | "stale";
  instrumentId?: string;
  provider?: string;
  providerSymbol?: string;
  exchange?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  latencyMs?: number;
  receivedAt?: string;
  timestampKind?: "exchange" | "receipt" | "fixture";
  transport?: string;
  warning?: string;
  calendar?: Observation["calendar"];
  unit?: string;
  kind?: import("./feeds/types").Instrument["kind"];
  bid?: number | null;
  ask?: number | null;
  candles?: import("./feeds/types").Candle[];
  exportAllowed?: boolean;
  exchangeTimezone: string;
  session: string;
};
const FIXTURE_TIME = "2026-10-30T20:00:00.000Z";
export function demoQuotes(): Quote[] {
  return assetList.map(([symbol, name, category, price, change], idx) => {
    const previous = price / (1 + change / 100);
    const history = Array.from({ length: 72 }, (_, i) => ({
      time: new Date(
        Date.parse(FIXTURE_TIME) - (71 - i) * 3600000,
      ).toISOString(),
      price: Number(
        (
          previous +
          ((price - previous) * i) / 71 +
          Math.sin(i * 0.48 + idx) *
            price *
            0.006 *
            Math.sin((Math.PI * i) / 71)
        ).toFixed(5),
      ),
    }));
    return {
      symbol,
      name,
      category,
      price,
      change: changePercent(price, previous),
      history,
      ...indicator(history.map((x) => x.price)),
      volume: Math.round((idx + 1) * 139283042),
      volumeRatio: 1 + idx * 0.13,
      volatility: Math.abs(change) * 0.6,
      instrumentId: instruments.find((i) => i.symbol === symbol)?.id || symbol,
      baseCurrency:
        symbol === "EURUSD"
          ? "EUR"
          : symbol === "GBPUSD"
            ? "GBP"
            : symbol === "USDJPY"
              ? "USD"
              : symbol,
      quoteCurrency: symbol === "USDJPY" ? "JPY" : "USD",
      provider: "demo",
      exchange: "Synthetic fixture",
      latencyMs: 0,
      receivedAt: FIXTURE_TIME,
      timestampKind: "fixture",
      exportAllowed: true,
      source: "DARK MARKETS synthetic fixture v1",
      asOf: FIXTURE_TIME,
      status: "demonstration",
      exchangeTimezone:
        category === "Stocks" || category === "ETFs" || category === "Indices"
          ? "America/New_York"
          : "UTC",
      session: category === "Crypto" ? "24/7" : "Fixture — no live session",
    };
  });
}

export function observationQuote(o: Observation): Quote {
  const i = instruments.find((i) => i.id === o.instrumentId);
  if (!i) throw new Error("Unknown engine instrument");
  validate(o, i, o.provider);
  const history = o.candles.map((c) => ({ time: c.time, price: c.close }));
  const stats =
    history.length >= 15
      ? indicator(history.map((p) => p.price))
      : { sma: null, rsi: null };
  const changes = history
    .slice(1)
    .map((p, j) => (p.price / history[j].price - 1) * 100);
  const mean = changes.length
    ? changes.reduce((a, b) => a + b, 0) / changes.length
    : 0;
  const volatility =
    changes.length >= 14
      ? Math.sqrt(
          changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length,
        )
      : null;
  const volumes = o.candles.slice(-15).map((c) => c.volume);
  const baseline =
    volumes.length === 15 && volumes.every((v) => v !== null)
      ? (volumes.slice(0, -1) as number[]).reduce((a, b) => a + b, 0) / 14
      : 0;
  return {
    ...o,
    ...stats,
    symbol: i.symbol,
    name: i.name,
    category: i.category,
    history,
    volatility,
    // Compare completed hourly candle volumes with their previous 14-hour average, not daily vs hourly volume.
    volumeRatio: baseline > 0 ? volumes.at(-1)! / baseline : null,
    exportAllowed: false,
  };
}
export function mergeObservations(observations: Observation[]) {
  const live = observations.map(observationQuote);
  const quotes = live;
  const stale = quotes.filter((q) => q.status === "stale").map((q) => q.symbol);
  return {
    quotes,
    error:
      [
        !quotes.length
          ? "Native market data unavailable. No demonstration prices are substituted."
          : "",
        stale.length ? `Stale observations: ${stale.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ") || null,
  };
}
const schema = z
  .array(
    z.object({
      symbol: z.string(),
      name: z.string(),
      category: z.string(),
      price: z.number().positive(),
      change: z.number(),
      volume: z.number().nonnegative(),
      volumeRatio: z.number().nonnegative(),
      volatility: z.number().nonnegative(),
      history: z
        .array(
          z.object({ time: z.iso.datetime(), price: z.number().positive() }),
        )
        .min(15),
      source: z.string().min(1),
      asOf: z.iso.datetime(),
      status: z.enum(["delayed", "realtime"]),
      exchangeTimezone: z.string(),
      session: z.string(),
    }),
  )
  .min(1);
let cache: { at: number; quotes: Quote[] } | undefined;
export async function market(): Promise<{
  quotes: Quote[];
  error: string | null;
}> {
  if (process.env.MARKET_PROVIDER === "multi") {
    try {
      const response = await engineFetch("/snapshot");
      if (!response.ok) throw new Error("Engine unavailable");
      const payload = await response.json();
      if (!Array.isArray(payload.observations))
        throw new Error("Invalid engine response");
      const { feedConfig } = await import("./feeds/config");
      const config = feedConfig();
      const observations = (payload.observations as Observation[])
        .filter((o) => config.allowed(o.provider, "display"))
        .map((o) =>
          Date.now() - Date.parse(o.asOf) > config.staleMs
            ? {
                ...o,
                status: "stale" as const,
                warning: "Stale observation; not a live quote.",
              }
            : o,
        );
      const result = mergeObservations(observations);
      return {
        ...result,
        quotes: result.quotes.map((q) => ({
          ...q,
          exportAllowed:
            q.provider === "demo" ||
            config.allowed(
              q.provider as import("./feeds/types").ProviderId,
              "export",
            ),
        })),
      };
    } catch {
      return {
        quotes: [],
        error:
          "Shared market engine unavailable. Native prices are unavailable; use attributed visual charts where supported.",
      };
    }
  }
  if (process.env.MARKET_PROVIDER !== "licensed")
    return { quotes: [], error: "No native market provider is configured." };
  if (
    process.env.MARKET_COMMERCIAL_RIGHTS !== "true" ||
    !process.env.MARKET_API_KEY ||
    !process.env.MARKET_API_URL
  )
    return {
      quotes: [],
      error:
        "Licensed feed unavailable: credentials and commercial rights must be configured.",
    };
  if (cache && Date.now() - cache.at < 30000)
    return { quotes: cache.quotes, error: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(process.env.MARKET_API_URL, {
        headers: { Authorization: `Bearer ${process.env.MARKET_API_KEY}` },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 429) break;
        throw new Error("Provider response " + response.status);
      }
      const quotes = schema
        .parse(await response.json())
        .map((q) => ({ ...q, ...indicator(q.history.map((x) => x.price)) }));
      if (
        quotes.some(
          (q) =>
            Date.now() - Date.parse(q.asOf) > 15 * 60 * 1000 ||
            Date.parse(q.asOf) > Date.now() + 60000,
        )
      )
        throw new Error("Stale or invalid timestamps");
      cache = { at: Date.now(), quotes };
      return { quotes, error: null };
    } catch {
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return {
    quotes: [],
    error:
      "Market provider unavailable or stale. No substitute prices are shown.",
  };
}
export const demoNews = [
  {
    id: "n1",
    category: "Crypto",
    title: "Reading market breadth across digital assets",
    summary:
      "Educational demonstration: compare the percentage changes in Bitcoin, Ethereum and Solana in the synthetic dataset. This is not a current news event.",
    symbols: ["BTC", "ETH", "SOL"],
    source: "DARK MARKETS educational fixture",
    url: "/disclosures",
  },
  {
    id: "n2",
    category: "Stocks",
    title: "Understanding a volume expansion",
    summary:
      "Educational demonstration: volume ratios compare a period with a baseline. Increased volume alone does not establish the cause of a price movement.",
    symbols: ["NVDA"],
    source: "DARK MARKETS educational fixture",
    url: "/disclosures",
  },
  {
    id: "n3",
    category: "Commodities",
    title: "A cross-market view of gold and oil",
    summary:
      "Educational demonstration: the fixture shows gold higher and WTI lower. No causal explanation can be established from prices alone.",
    symbols: ["XAU", "WTI"],
    source: "DARK MARKETS educational fixture",
    url: "/disclosures",
  },
];
export const demoEvents = [
  {
    id: "e1",
    time: "13:30",
    region: "US",
    title: "Inflation release — sample event",
    impact: "High",
    date: "2026-11-04",
  },
  {
    id: "e2",
    time: "15:00",
    region: "US",
    title: "Central bank statement — sample event",
    impact: "High",
    date: "2026-11-05",
  },
  {
    id: "e3",
    time: "09:00",
    region: "EU",
    title: "Employment release — sample event",
    impact: "Medium",
    date: "2026-11-06",
  },
];
