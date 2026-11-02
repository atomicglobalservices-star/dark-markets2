import { createHash } from "node:crypto";
import { z } from "zod";
import { Transport } from "./transport";
import { FeedError } from "./types";

export type AdditionalProvider = "biquote" | "goldapi";
export type EvaluationQuote = {
  id: string;
  provider: AdditionalProvider;
  providerSymbol: string;
  source: string;
  exchange: string | null;
  product: string;
  quoteCurrency: string;
  unit: string;
  price: number;
  priceType: "indicative-midpoint" | "spot-reference" | "unverified-reference";
  bid: number | null;
  ask: number | null;
  asOf: string;
  receivedAt: string;
  latencyMs: number;
  timestampKind: "provider-quote" | "provider-source-fetch";
  marketState: "open" | "closed" | "unknown";
  status: "indicative" | "closed" | "stale";
  stale: boolean;
  warning: string;
  publicDisplayEnabled: false;
  analysisAllowed: false;
  exportAllowed: false;
};
export const biquoteForex = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "USDZAR",
];
export const biquoteEvaluationSymbols = [...biquoteForex, "XAUUSD", "US500"];
export const biquoteInspectionSymbols = [
  ...biquoteForex,
  "XAUUSD",
  "XAGUSD",
  "USOIL",
  "UKOIL",
  "XNGUSD",
  "XCUUSD",
  "US500",
  "NAS100",
  "US30",
  "UK100",
  "DE30",
  "JP225",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "TSLA",
  "SPYUSDT",
  "QQQUSDT",
];
const metalUnits: Record<string, string> = {
  XAU: "USD per troy ounce",
  XAG: "USD per troy ounce",
  XPT: "USD per troy ounce",
  XPD: "USD per troy ounce",
};
const utc = z
  .string()
  .regex(/Z$/)
  .refine((s) => Number.isFinite(Date.parse(s)));
const metadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  source: z.string().min(1),
  exchange: z.string().min(1),
  type: z.string().min(1),
  currency: z.string().min(1),
  contractSize: z.number().finite().nonnegative(),
  tickSize: z.number().finite().nonnegative(),
  digits: z.number().int().nonnegative(),
});
export type BiquoteInstrument = z.infer<typeof metadataSchema>;
const tickSchema = z.object({
  symbol: z.string(),
  source: z.string().min(1),
  exchange: z.string().min(1),
  bid: z.number().positive().finite(),
  ask: z.number().positive().finite(),
  mid: z.number().positive().finite(),
  timestamp: utc,
  lastQuoteAt: utc,
  stale: z.boolean(),
  marketState: z.enum(["open", "closed", "unknown"]),
});
const goldSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  currency: z.string(),
  price: z.number().positive().finite(),
  updatedAt: utc,
});
function timestamp(stamp: string, now: number) {
  const time = Date.parse(stamp);
  if (time > now + 5000) throw new FeedError("malformed");
  return time;
}
function receipt(receivedAt: string, latencyMs: number) {
  const now = Date.parse(receivedAt);
  if (!Number.isFinite(now) || !Number.isFinite(latencyMs) || latencyMs < 0)
    throw new FeedError("malformed");
  return now;
}
// Preserve the documented store-outage Retry-After without changing the
// existing crypto transport's behaviour.
export function additionalFetcher(
  fetcher: typeof fetch = fetch,
  now = Date.now,
): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, init),
      retry = response.headers.get("retry-after");
    if (response.status === 503 && retry) {
      const ms = /^\d+(\.\d+)?$/.test(retry)
        ? Number(retry) * 1000
        : Date.parse(retry) - now();
      throw new FeedError(
        "unavailable",
        Math.max(1000, Number.isFinite(ms) ? ms : 60000),
      );
    }
    return response;
  };
}
const disabled = {
  publicDisplayEnabled: false,
  analysisAllowed: false,
  exportAllowed: false,
} as const;

export function normaliseBiquote(
  raw: unknown,
  meta: BiquoteInstrument,
  receivedAt: string,
  latencyMs: number,
): EvaluationQuote {
  const q = tickSchema.parse(raw),
    now = receipt(receivedAt, latencyMs);
  if (
    q.symbol !== meta.name ||
    q.source !== meta.source ||
    q.exchange !== meta.exchange ||
    !biquoteEvaluationSymbols.includes(q.symbol)
  )
    throw new FeedError("symbol");
  if (
    q.bid > q.ask ||
    Math.abs(q.mid - (q.bid + q.ask) / 2) > Math.max(1e-8, q.mid * 1e-7) ||
    q.lastQuoteAt !== q.timestamp
  )
    throw new FeedError("malformed");
  const time = timestamp(q.timestamp, now),
    forex = biquoteForex.includes(q.symbol);
  if (forex && meta.type !== "Forex") throw new FeedError("symbol");
  if (!forex && !["Commodity", "Index"].includes(meta.type))
    throw new FeedError("symbol");
  const quoteCurrency = forex ? q.symbol.slice(3) : meta.currency;
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        meta.name,
        meta.description,
        meta.source,
        meta.exchange,
        meta.type,
        meta.currency,
        meta.contractSize,
        meta.tickSize,
        meta.digits,
      ]),
    )
    .digest("hex")
    .slice(0, 24);
  const stale = q.stale || now - time > 60000;
  return {
    ...disabled,
    id: `biquote:${q.symbol}:${identity}`,
    provider: "biquote",
    providerSymbol: q.symbol,
    source: q.source,
    exchange: q.exchange,
    product: forex
      ? "broker FX indicative reference; broker legal identity unverified"
      : "unverified broker derivative; not an official cash index, spot metal or exchange futures contract",
    quoteCurrency,
    unit: forex
      ? `${quoteCurrency} per ${q.symbol.slice(0, 3)}`
      : "Broker quote units; exact contract specification unverified",
    price: q.mid,
    priceType: "indicative-midpoint",
    bid: q.bid,
    ask: q.ask,
    asOf: q.timestamp,
    receivedAt,
    latencyMs,
    timestampKind: "provider-quote",
    marketState: q.marketState,
    stale,
    status:
      q.marketState === "closed" ? "closed" : stale ? "stale" : "indicative",
    warning:
      `Indicative bid/ask midpoint, not last trade. Source ${q.source}; broker identity and upstream permissions unresolved.` +
      (meta.currency !== quoteCurrency
        ? ` Provider metadata currency ${meta.currency} differs from symbol-derived quote currency ${quoteCurrency}; confirmation required.`
        : ""),
  };
}
export function normaliseGold(
  raw: unknown,
  symbol: string,
  receivedAt: string,
  latencyMs: number,
): EvaluationQuote {
  const q = goldSchema.parse(raw),
    now = receipt(receivedAt, latencyMs);
  if (q.symbol !== symbol || q.currency !== "USD" || !metalUnits[symbol])
    throw new FeedError("symbol");
  const time = timestamp(q.updatedAt, now),
    stale = now - time > 60000;
  return {
    ...disabled,
    id: `goldapi:${symbol}/USD:spot-reference`,
    provider: "goldapi",
    providerSymbol: symbol,
    source: "Gold API — underlying price source undisclosed",
    exchange: null,
    product:
      "provider-described spot metal reference; not exchange futures or broker CFD",
    quoteCurrency: "USD",
    unit: metalUnits[symbol],
    price: q.price,
    priceType: "spot-reference",
    bid: null,
    ask: null,
    asOf: q.updatedAt,
    receivedAt,
    latencyMs,
    timestampKind: "provider-source-fetch",
    marketState: "unknown",
    status: stale ? "stale" : "indicative",
    stale,
    warning:
      "updatedAt is when the provider fetched its source, not an exchange trade timestamp. Market session and underlying venue are unknown; a fresh fetch does not prove a current market trade.",
  };
}
export class BiquoteAdapter {
  constructor(
    readonly transport = new Transport(additionalFetcher(), Date.now, 20),
    private now = Date.now,
  ) {}
  async catalog() {
    return z
      .array(metadataSchema)
      .parse(
        await this.transport.get("https://biquote.io/api/symbols", {}, 3600000),
      );
  }
  async inspectionQuotes(catalog: BiquoteInstrument[]) {
    const selected = biquoteInspectionSymbols.flatMap((symbol) => {
      const meta = catalog.find((i) => i.name === symbol);
      return meta ? [meta] : [];
    });
    const params = new URLSearchParams();
    selected.forEach((i) => params.append("symbols", i.name));
    const start = this.now(),
      raw = await this.transport.get(
        "https://biquote.io/api/latest?" + params,
        {},
        60000,
      ),
      receivedAt = new Date(this.now()).toISOString();
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (symbol) => !selected.some((i) => i.name === symbol),
      )
    )
      throw new FeedError("symbol");
    return selected.flatMap((meta) => {
      try {
        if (biquoteEvaluationSymbols.includes(meta.name))
          return [
            normaliseBiquote(
              raw[meta.name],
              meta,
              receivedAt,
              this.now() - start,
            ),
          ];
        const q = tickSchema
          .extend({ exchange: z.string().nullable() })
          .parse(raw[meta.name]);
        if (
          q.symbol !== meta.name ||
          q.source !== meta.source ||
          (q.exchange !== null && q.exchange !== meta.exchange) ||
          q.bid > q.ask ||
          Math.abs(q.mid - (q.bid + q.ask) / 2) >
            Math.max(1e-8, q.mid * 1e-7) ||
          q.lastQuoteAt !== q.timestamp
        )
          throw new FeedError("symbol");
        const time = timestamp(q.timestamp, this.now()),
          stale = q.stale || this.now() - time > 60000;
        const identity = createHash("sha256")
          .update(
            JSON.stringify([
              meta.name,
              meta.source,
              meta.exchange,
              meta.currency,
              meta.contractSize,
              meta.tickSize,
            ]),
          )
          .digest("hex")
          .slice(0, 24);
        return [
          {
            ...disabled,
            id: `biquote:${q.symbol}:${identity}`,
            provider: "biquote" as const,
            providerSymbol: q.symbol,
            source: q.source,
            exchange: q.exchange,
            product: `${meta.description} — broker/aggregated instrument; exact contract and listing unverified, not an official stock, cash index or exchange continuous future`,
            quoteCurrency: q.symbol.endsWith("USDT")
              ? `Unverified: metadata ${meta.currency}, symbol USDT`
              : meta.currency,
            unit: "Unverified broker quote unit — no conversion applied",
            price: q.mid,
            priceType: "indicative-midpoint" as const,
            bid: q.bid,
            ask: q.ask,
            asOf: q.timestamp,
            receivedAt,
            latencyMs: this.now() - start,
            timestampKind: "provider-quote" as const,
            marketState: q.marketState,
            status:
              q.marketState === "closed"
                ? ("closed" as const)
                : stale
                  ? ("stale" as const)
                  : ("indicative" as const),
            stale,
            warning: `EVALUATION ONLY. Indicative bid/ask midpoint. Broker/legal source identity, product specification, currency/unit and upstream display conditions require confirmation. Provider metadata: type ${meta.type}, exchange ${meta.exchange}, currency ${meta.currency}, contract size ${meta.contractSize}.`,
          },
        ];
      } catch {
        return [];
      }
    });
  }
  async history(meta: BiquoteInstrument) {
    const raw = await this.transport.get(
      `https://biquote.io/api/${encodeURIComponent(meta.name)}/ohlc?interval=1h&limit=30`,
      {},
      3600000,
      "background",
    );
    if (
      raw.symbol !== meta.name ||
      raw.interval !== "1h" ||
      !Array.isArray(raw.bars)
    )
      throw new FeedError("symbol");
    const bars = z
      .array(
        z.object({
          openTime: utc,
          open: z.number().positive().finite(),
          high: z.number().positive().finite(),
          low: z.number().positive().finite(),
          close: z.number().positive().finite(),
          volume: z.number().nonnegative().finite(),
          tickVolume: z.number().nonnegative().finite(),
          isOpen: z.boolean(),
        }),
      )
      .parse(raw.bars)
      .filter((b) => !b.isOpen)
      .sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
    for (let n = 0; n < bars.length; n++) {
      const b = bars[n];
      timestamp(b.openTime, this.now());
      if (
        b.high < Math.max(b.open, b.close, b.low) ||
        b.low > Math.min(b.open, b.close, b.high) ||
        (n && b.openTime <= bars[n - 1].openTime)
      )
        throw new FeedError("malformed");
    }
    return {
      provider: "biquote",
      providerSymbol: meta.name,
      source: meta.source,
      provenance:
        "Provider documents mixed Yahoo bootstrap, tick aggregation and MT5 history; per-bar source not established",
      analysisAllowed: false,
      bars,
    };
  }
}
export class GoldApiAdapter {
  private tail: Promise<unknown> = Promise.resolve();
  private last = -Infinity;
  constructor(
    readonly transport = new Transport(additionalFetcher(), Date.now, 8),
    private now = Date.now,
    private pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  private spaced<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail
      .catch(() => {})
      .then(async () => {
        const delay = 1200 - (this.now() - this.last);
        if (delay > 0) await this.pause(delay);
        this.last = this.now();
        return operation();
      });
    this.tail = next;
    return next;
  }
  async catalog() {
    return this.spaced(async () =>
      z
        .array(z.object({ symbol: z.string(), name: z.string() }))
        .parse(
          await this.transport.get(
            "https://api.gold-api.com/symbols",
            {},
            3600000,
          ),
        ),
    );
  }
  async quote(symbol: string) {
    if (!metalUnits[symbol]) throw new FeedError("unsupported");
    return this.spaced(async () => {
      const start = this.now(),
        raw = await this.transport.get(
          `https://api.gold-api.com/price/${symbol}/USD`,
          {},
          60000,
        );
      return normaliseGold(
        raw,
        symbol,
        new Date(this.now()).toISOString(),
        this.now() - start,
      );
    });
  }
  async inspectionQuote(symbol: string): Promise<EvaluationQuote> {
    if (symbol !== "HG") return this.quote(symbol);
    return this.spaced(async () => {
      const start = this.now(),
        raw = goldSchema.parse(
          await this.transport.get(
            "https://api.gold-api.com/price/HG/USD",
            {},
            60000,
          ),
        );
      if (raw.symbol !== "HG" || raw.currency !== "USD")
        throw new FeedError("symbol");
      const receivedAt = new Date(this.now()).toISOString(),
        time = timestamp(raw.updatedAt, this.now()),
        stale = this.now() - time > 60000;
      return {
        ...disabled,
        id: "goldapi:HG/USD:unverified-unit",
        provider: "goldapi",
        providerSymbol: "HG",
        source: "Gold API — underlying price source undisclosed",
        exchange: null,
        product:
          "Copper reference — unit and contract type unresolved; not COMEX continuous futures",
        quoteCurrency: "USD",
        unit: "Unverified copper unit — no conversion applied",
        price: raw.price,
        priceType: "unverified-reference",
        bid: null,
        ask: null,
        asOf: raw.updatedAt,
        receivedAt,
        latencyMs: this.now() - start,
        timestampKind: "provider-source-fetch",
        marketState: "unknown",
        status: stale ? "stale" : "indicative",
        stale,
        warning:
          "EVALUATION ONLY — UNIT UNVERIFIED. Observed API number is retained without conversion. Source-fetch time is not trade time. Not approved for subscriber display, analysis or exports.",
      };
    });
  }
}
