export const providerIds = [
  "binance",
  "coinbase",
  "kraken",
  "coingecko",
  "twelvedata",
] as const;
export type ProviderId = (typeof providerIds)[number];
export type Instrument = {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  name: string;
  category: string;
  mappings: Partial<Record<ProviderId, string>>;
  kind?: "spot" | "equity" | "etf" | "cash-index" | "futures" | "cfd";
  unit?: string;
  venue?: string;
  contract?: string;
};
const cryptoAssets = [
  ["BTC", "Bitcoin", "bitcoin", "XXBTZUSD"],
  ["ETH", "Ethereum", "ethereum", "XETHZUSD"],
  ["SOL", "Solana", "solana", "SOLUSD"],
  ["XRP", "XRP", "ripple", "XXRPZUSD"],
  ["BNB", "BNB", "binancecoin", "BNBUSD"],
  ["ADA", "Cardano", "cardano", "ADAUSD"],
  ["DOGE", "Dogecoin", "dogecoin", "XDGUSD"],
  ["LTC", "Litecoin", "litecoin", "XLTCZUSD"],
  ["TRX", "TRON", "tron", "TRXUSD"],
  ["AVAX", "Avalanche", "avalanche-2", "AVAXUSD"],
  ["LINK", "Chainlink", "chainlink", "LINKUSD"],
  ["DOT", "Polkadot", "polkadot", "DOTUSD"],
] as const;
const cryptoInstruments: Instrument[] = cryptoAssets.flatMap(
  ([base, name, gecko, kraken]) => [
    {
      id: `${base}/USD`,
      symbol: base,
      base,
      quote: "USD",
      name,
      category: "Crypto",
      kind: "spot",
      unit: `USD per ${base}`,
      mappings: { coinbase: `${base}-USD`, kraken, coingecko: gecko },
    },
    {
      id: `${base}/USDT`,
      symbol: `${base}USDT`,
      base,
      quote: "USDT",
      name: `${name} / Tether`,
      category: "Crypto",
      kind: "spot",
      unit: `USDT per ${base}`,
      mappings: {
        binance: `${base}USDT`,
        coinbase: `${base}-USDT`,
        kraken:
          base === "BTC"
            ? "XBTUSDT"
            : base === "DOGE"
              ? "XDGUSDT"
              : `${base}USDT`,
      },
    },
    {
      id: `${base}/EUR`,
      symbol: `${base}EUR`,
      base,
      quote: "EUR",
      name: `${name} / Euro`,
      category: "Crypto",
      kind: "spot",
      unit: `EUR per ${base}`,
      mappings: {
        binance: `${base}EUR`,
        coinbase: `${base}-EUR`,
        coingecko: gecko,
      },
    },
  ],
);
const forex = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "AUD/USD",
  "USD/CAD",
  "NZD/USD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
  "USD/ZAR",
  "USD/MXN",
  "USD/TRY",
].map((pair) => {
  const [base, quote] = pair.split("/");
  return {
    id: pair,
    symbol: base + quote,
    base,
    quote,
    name: pair,
    category: "Forex",
    kind: "spot" as const,
    unit: `${quote} per ${base}`,
    mappings: { twelvedata: pair },
  };
});
const equities = [
  ["AAPL", "Apple Inc.", "Stocks", "USD", "NASDAQ"],
  ["NVDA", "NVIDIA Corporation", "Stocks", "USD", "NASDAQ"],
  ["MSFT", "Microsoft Corporation", "Stocks", "USD", "NASDAQ"],
  ["AMZN", "Amazon.com", "Stocks", "USD", "NASDAQ"],
  ["GOOGL", "Alphabet", "Stocks", "USD", "NASDAQ"],
  ["META", "Meta Platforms", "Stocks", "USD", "NASDAQ"],
  ["TSLA", "Tesla", "Stocks", "USD", "NASDAQ"],
  ["JPM", "JPMorgan Chase", "Stocks", "USD", "NYSE"],
  ["V", "Visa", "Stocks", "USD", "NYSE"],
  ["WMT", "Walmart", "Stocks", "USD", "NASDAQ"],
  ["SPY", "SPDR S&P 500 ETF", "ETFs", "USD", "NYSE"],
  ["QQQ", "Invesco QQQ ETF", "ETFs", "USD", "NASDAQ"],
  ["DIA", "SPDR Dow Jones ETF", "ETFs", "USD", "NYSE"],
  ["IWM", "iShares Russell 2000 ETF", "ETFs", "USD", "NYSE"],
  ["VTI", "Vanguard Total Stock Market ETF", "ETFs", "USD", "NYSE"],
  ["GLD", "SPDR Gold Shares ETF (proxy, not spot gold)", "ETFs", "USD", "NYSE"],
  ["VOD:LSE", "Vodafone", "Stocks", "GBX", "LSE"],
  ["7203:TSE", "Toyota Motor", "Stocks", "JPY", "TSE"],
  ["SAP:XETR", "SAP", "Stocks", "EUR", "XETR"],
].map(([symbol, name, category, quote, venue]) => ({
  id: `${symbol}/${quote}`,
  symbol,
  base: symbol,
  quote,
  name,
  category,
  kind: category === "ETFs" ? ("etf" as const) : ("equity" as const),
  unit: `${quote} per share`,
  venue,
  mappings: { twelvedata: symbol.split(":")[0] },
}));
const indices = [
  ["SPX", "S&P 500 cash index", "USD"],
  ["NDX", "Nasdaq-100 cash index", "USD"],
  ["DJI", "Dow Jones cash index", "USD"],
  ["FTSE", "FTSE 100 cash index", "GBP"],
  ["DAX", "DAX cash index", "EUR"],
  ["N225", "Nikkei 225 cash index", "JPY"],
].map(([symbol, name, quote]) => ({
  id: `${symbol}/INDEX`,
  symbol,
  base: symbol,
  quote,
  name,
  category: "Indices",
  kind: "cash-index" as const,
  unit: "index points",
  mappings: {},
}));
const commodities = [
  ["XAU", "Gold", "troy ounce"],
  ["XAG", "Silver", "troy ounce"],
  ["XPT", "Platinum", "troy ounce"],
  ["XPD", "Palladium", "troy ounce"],
  ["WTI", "WTI crude oil", "barrel"],
  ["BRENT", "Brent crude oil", "barrel"],
  ["NATGAS", "Natural gas", "MMBtu"],
  ["CORN", "Corn", "contract-dependent"],
  ["WHEAT", "Wheat", "contract-dependent"],
  ["SOYBEAN", "Soybeans", "contract-dependent"],
].map(([symbol, name, unit]) => ({
  id: `${symbol}/USD`,
  symbol,
  base: symbol,
  quote: "USD",
  name,
  category: "Commodities",
  kind: (["XAU", "XAG", "XPT", "XPD"].includes(symbol) ? "spot" : "futures") as
    "spot" | "futures",
  unit: `USD per ${unit}`,
  contract:
    unit === "contract-dependent"
      ? "Provider contract and delivery month required"
      : undefined,
  mappings: ["XAU", "XAG", "XPT", "XPD"].includes(symbol)
    ? { twelvedata: `${symbol}/USD` }
    : {},
}));
export const instruments: Instrument[] = [
  ...cryptoInstruments,
  ...forex,
  ...equities,
  ...indices,
  ...commodities,
];
export function catalogSearch(query = "", category = "", currency = "") {
  const needle = query.toLowerCase().trim().slice(0, 100);
  return instruments.filter(
    (i) =>
      (!category || i.category === category) &&
      (!currency || i.quote === currency) &&
      (!needle ||
        [i.id, i.name, i.symbol, i.venue || ""].some((s) =>
          s.toLowerCase().includes(needle),
        )),
  );
}
export function resolveInstrument(id: string) {
  const result = instruments.find((i) => i.id === id || i.symbol === id);
  if (!result) throw new Error("Unsupported instrument");
  return result;
}
export const timeframes = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "1d": 86400,
} as const;
export type Timeframe = keyof typeof timeframes;
export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};
export type Observation = {
  instrumentId: string;
  provider: ProviderId;
  providerSymbol: string;
  exchange: string;
  source: string;
  baseCurrency: string;
  quoteCurrency: string;
  price: number;
  change: number | null;
  volume: number | null;
  asOf: string;
  receivedAt: string;
  latencyMs: number;
  timestampKind: "exchange" | "receipt";
  status: "realtime" | "delayed" | "stale";
  transport: "rest" | "websocket";
  candles: Candle[];
  exchangeTimezone: string;
  session: string;
  warning?: string;
  calendar?: Awaited<ReturnType<typeof import("./schedule").exchangeSchedule>>;
  bid?: number | null;
  ask?: number | null;
  unit?: string;
  kind?: Instrument["kind"];
  venue?: string;
};
export interface Provider {
  id: ProviderId;
  quote(instrument: Instrument): Promise<Observation>;
  health(): Promise<void>;
  candles?(instrument: Instrument, timeframe?: Timeframe): Promise<Candle[]>;
  supports?(instrument: Instrument): Promise<boolean>;
}
export class FeedError extends Error {
  constructor(
    public code:
      | "rate-limit"
      | "unavailable"
      | "malformed"
      | "symbol"
      | "budget"
      | "unsupported"
      | "source-stale",
    public retryMs = 0,
  ) {
    super(code);
  }
}
export function finite(value: unknown, positive = false): number {
  if (typeof value !== "number" && typeof value !== "string")
    throw new FeedError("malformed");
  if (typeof value === "string" && value.trim() === "")
    throw new FeedError("malformed");
  const n = Number(value);
  if (!Number.isFinite(n) || (positive && n <= 0))
    throw new FeedError("malformed");
  return n;
}
export function iso(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number")
    throw new FeedError("malformed");
  const n = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(n) || n < 0 || n > 8640000000000000)
    throw new FeedError("malformed");
  return new Date(n).toISOString();
}
export function validate(
  q: Observation,
  i: Instrument,
  provider: ProviderId,
  now = Date.now(),
) {
  if (
    q.instrumentId !== i.id ||
    q.baseCurrency !== i.base ||
    q.quoteCurrency !== i.quote ||
    q.provider !== provider ||
    q.providerSymbol !== i.mappings[provider]
  )
    throw new FeedError("symbol");
  if (
    !providerIds.includes(q.provider) ||
    !["realtime", "delayed", "stale"].includes(q.status) ||
    !["rest", "websocket"].includes(q.transport) ||
    !["exchange", "receipt"].includes(q.timestampKind)
  )
    throw new FeedError("malformed");
  finite(q.price, true);
  finite(q.latencyMs);
  if (q.latencyMs < 0 || !q.exchange || !q.source)
    throw new FeedError("malformed");
  if (q.change !== null) finite(q.change);
  if (q.volume !== null && finite(q.volume) < 0)
    throw new FeedError("malformed");
  const stamp = Date.parse(iso(q.asOf));
  if (stamp > now + 30000 || Date.parse(iso(q.receivedAt)) > now + 30000)
    throw new FeedError("malformed");
  let previous = -1;
  for (const c of q.candles) {
    const t = Date.parse(iso(c.time));
    if (t <= previous || t > now + 30000) throw new FeedError("malformed");
    previous = t;
    for (const v of [c.open, c.high, c.low, c.close]) finite(v, true);
    if (
      c.low > Math.min(c.open, c.close) ||
      c.high < Math.max(c.open, c.close) ||
      (c.volume !== null && finite(c.volume) < 0)
    )
      throw new FeedError("malformed");
  }
  return q;
}
