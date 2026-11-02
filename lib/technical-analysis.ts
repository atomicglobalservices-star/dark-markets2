import { z } from "zod";
import { timeframes } from "./feeds/types";
export const analysisVersion = "technical-analysis-v1";
export type AnalysisReason = {
  code: string;
  message: string;
  requiredCandles?: number;
  actualCandles?: number;
};
export type Indicator<T> =
  | { available: true; value: T; reason: null }
  | { available: false; value: null; reason: AnalysisReason };
export type MacdValues = { line: number; signal: number; histogram: number };
export type AnalysisRequest = {
  instrumentId: string;
  timeframe: string;
  quoteCurrency: string;
};
export type AnalysisContext = {
  now: number;
  scope: "local" | "commercial";
  allowed: (provider: string, capability: "display" | "analysis") => boolean;
};
export type AnalysisResult = {
  version: string;
  status: "available" | "partial" | "unavailable";
  request: AnalysisRequest;
  source: {
    provider: string;
    name: string;
    exchange: string | null;
    collectedAt: string;
  } | null;
  candles: {
    count: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    lastClosedAt: string | null;
    volumeMissing: number;
  };
  freshness: {
    status: "fresh" | "delayed" | "stale" | "unknown";
    ageMs: number | null;
    cacheAgeMs: number | null;
  };
  scope: "local" | "commercial";
  indicators: {
    ema20: Indicator<number>;
    ema50: Indicator<number>;
    rsi14: Indicator<number>;
    macd: Indicator<MacdValues>;
    atr14: Indicator<number>;
  };
  reasons: AnalysisReason[];
};
const historySchema = z.object({
  instrumentId: z.string().min(1),
  timeframe: z.string(),
  quoteCurrency: z.string().min(1),
  provider: z.string().min(1),
  source: z.string().min(1),
  exchange: z.string().optional(),
  collectedAt: z.iso.datetime(),
  dataType: z.literal("historical"),
  cacheOnly: z.literal(true),
  status: z.enum(["realtime", "delayed", "stale"]),
  stale: z.boolean(),
  timestampKind: z.string().optional(),
  candles: z.unknown(),
});
const candleSchema = z.object({
  time: z.iso.datetime(),
  open: z.number().finite().positive(),
  high: z.number().finite().positive(),
  low: z.number().finite().positive(),
  close: z.number().finite().positive(),
  volume: z.number().finite().min(0).nullable(),
});
export function unavailableAnalysis(
  request: AnalysisRequest,
  scope: AnalysisContext["scope"],
  code: string,
  message: string,
): AnalysisResult {
  const reason = { code, message };
  const empty = { available: false as const, value: null, reason };
  return {
    version: analysisVersion,
    status: "unavailable",
    request,
    source: null,
    candles: {
      count: 0,
      firstOpenedAt: null,
      lastOpenedAt: null,
      lastClosedAt: null,
      volumeMissing: 0,
    },
    freshness: { status: "unknown", ageMs: null, cacheAgeMs: null },
    scope,
    indicators: {
      ema20: empty,
      ema50: empty,
      rsi14: empty,
      macd: empty,
      atr14: empty,
    },
    reasons: [reason],
  };
}
function ema(values: number[], period: number) {
  if (values.length < period) return [];
  let current = values.slice(0, period).reduce((a, b) => a + b / period, 0);
  const result = [current];
  for (let i = period; i < values.length; i++) {
    current += ((values[i] - current) * 2) / (period + 1);
    result.push(current);
  }
  return result;
}
/** Pure calculation: the caller supplies the clock and existing provider-rights policy. No I/O, imputation, price blending or AI. */
export function analyzeHistory(
  input: unknown,
  request: AnalysisRequest,
  context: AnalysisContext,
): AnalysisResult {
  const { now, scope } = context;
  const fail = (code: string, message: string) =>
    unavailableAnalysis(request, scope, code, message);
  if (!Number.isFinite(now) || Math.abs(now) > 8.64e15)
    return fail(
      "INVALID_CLOCK",
      "A valid explicit evaluation timestamp is required",
    );
  if (!Object.hasOwn(timeframes, request.timeframe))
    return fail(
      "UNSUPPORTED_TIMEFRAME",
      "This timeframe is not supported by the existing candle engine",
    );
  const parsed = historySchema.safeParse(input);
  if (!parsed.success)
    return fail(
      "INVALID_HISTORY",
      "Approved, attributed, cache-only OHLCV history is required",
    );
  const h = parsed.data;
  if (
    h.instrumentId !== request.instrumentId ||
    h.timeframe !== request.timeframe ||
    h.quoteCurrency !== request.quoteCurrency
  )
    return fail(
      "IDENTITY_MISMATCH",
      "Instrument, timeframe and quote currency must match exactly",
    );
  if (
    h.timestampKind === "fixture" ||
    !context.allowed(h.provider, "display") ||
    !context.allowed(h.provider, "analysis")
  )
    return fail(
      "PERMISSION_DENIED",
      "Display and derived-analysis permission are required for this provider",
    );
  const result = fail("MISSING_CANDLES", "No completed candles are available");
  result.source = {
    provider: h.provider,
    name: h.source,
    exchange: h.exchange || null,
    collectedAt: h.collectedAt,
  };
  const reject = (code: string, message: string) => {
    const denied = fail(code, message);
    return {
      ...denied,
      source: result.source,
      candles: result.candles,
      freshness: result.freshness,
    };
  };
  const cacheAgeMs = now - Date.parse(h.collectedAt);
  result.freshness.cacheAgeMs = cacheAgeMs;
  if (cacheAgeMs < -5000)
    return reject(
      "FUTURE_CACHE_TIMESTAMP",
      "Cache collection time is in the future",
    );
  const parsedCandles = z.array(candleSchema).max(1000).safeParse(h.candles);
  if (!parsedCandles.success)
    return reject(
      "INVALID_CANDLES",
      "Candles must have finite positive OHLC, valid timestamps and nonnegative or unknown volume",
    );
  const rows = parsedCandles.data;
  if (!rows.length) return result;
  const step = timeframes[request.timeframe as keyof typeof timeframes] * 1000;
  result.candles = {
    count: rows.length,
    firstOpenedAt: rows[0].time,
    lastOpenedAt: rows.at(-1)!.time,
    lastClosedAt: new Date(Date.parse(rows.at(-1)!.time) + step).toISOString(),
    volumeMissing: rows.filter((c) => c.volume === null).length,
  };
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i],
      at = Date.parse(c.time);
    if (
      c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close) ||
      c.high < c.low
    )
      return reject(
        "INVALID_OHLC",
        "Candle high and low must contain both open and close",
      );
    if (at + step > now)
      return reject(
        "INCOMPLETE_CANDLE",
        "Only completed candles can be analysed",
      );
    if (i) {
      const delta = at - Date.parse(rows[i - 1].time);
      if (delta <= 0)
        return reject(
          "UNSORTED_OR_DUPLICATE_CANDLES",
          "Candles must be strictly chronological and unique",
        );
      if (delta !== step)
        return reject(
          "GAPPED_CANDLES",
          "Missing or mismatched intervals are not filled or resampled",
        );
    }
  }
  if (
    Date.parse(result.candles.lastClosedAt!) >
    Date.parse(h.collectedAt) + 5000
  )
    return reject(
      "INVALID_COLLECTION_TIME",
      "A cached candle cannot close after its collection timestamp",
    );
  const ageMs = now - Date.parse(result.candles.lastClosedAt!);
  result.freshness = {
    ageMs,
    cacheAgeMs,
    status:
      h.stale || ageMs > 3 * step + 60000
        ? "stale"
        : ageMs > step + 60000
          ? "delayed"
          : "fresh",
  };
  if (result.freshness.status === "stale")
    return reject(
      "STALE_HISTORY",
      "The history cache or latest completed candle is stale",
    );
  const close = rows.map((c) => c.close),
    count = rows.length;
  function metric<T>(required: number, calculate: () => T): Indicator<T> {
    if (count < required)
      return {
        available: false,
        value: null,
        reason: {
          code: "INSUFFICIENT_CANDLES",
          message: `Requires ${required} consecutive completed candles`,
          requiredCandles: required,
          actualCandles: count,
        },
      };
    const value = calculate();
    const values =
      typeof value === "number"
        ? [value]
        : Object.values(value as Record<string, number>);
    return values.every(Number.isFinite)
      ? { available: true, value, reason: null }
      : {
          available: false,
          value: null,
          reason: {
            code: "NUMERIC_OVERFLOW",
            message: "Indicator calculation was not finite",
          },
        };
  }
  result.indicators = {
    ema20: metric(20, () => ema(close, 20).at(-1)!),
    ema50: metric(50, () => ema(close, 50).at(-1)!),
    rsi14: metric(15, () => {
      let gain = 0,
        loss = 0;
      for (let i = 1; i <= 14; i++) {
        const d = close[i] - close[i - 1];
        gain += Math.max(d, 0) / 14;
        loss += Math.max(-d, 0) / 14;
      }
      for (let i = 15; i < count; i++) {
        const d = close[i] - close[i - 1];
        gain = (gain * 13 + Math.max(d, 0)) / 14;
        loss = (loss * 13 + Math.max(-d, 0)) / 14;
      }
      return gain === 0 && loss === 0
        ? 50
        : loss === 0
          ? 100
          : 100 - 100 / (1 + gain / loss);
    }),
    macd: metric(34, () => {
      const fast = ema(close, 12),
        slow = ema(close, 26);
      const series = slow.map((v, i) => fast[i + 14] - v),
        line = series.at(-1)!,
        signal = ema(series, 9).at(-1)!;
      return { line, signal, histogram: line - signal };
    }),
    atr14: metric(15, () => {
      const tr = rows
        .slice(1)
        .map((c, i) =>
          Math.max(
            c.high - c.low,
            Math.abs(c.high - rows[i].close),
            Math.abs(c.low - rows[i].close),
          ),
        );
      let atr = tr.slice(0, 14).reduce((a, b) => a + b / 14, 0);
      for (let i = 14; i < tr.length; i++) atr = (atr * 13 + tr[i]) / 14;
      return atr;
    }),
  };
  const indicators = Object.values(result.indicators);
  result.reasons = indicators.flatMap((i) => (i.available ? [] : [i.reason]));
  result.status = indicators.every((i) => i.available)
    ? "available"
    : indicators.some((i) => i.available)
      ? "partial"
      : "unavailable";
  return result;
}
