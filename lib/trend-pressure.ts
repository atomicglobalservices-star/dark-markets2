import { z } from "zod";
const candle = z.object({
  time: z.iso.datetime(),
  open: z.number().finite().positive(),
  high: z.number().finite().positive(),
  low: z.number().finite().positive(),
  close: z.number().finite().positive(),
  volume: z.number().finite().min(0).nullable(),
});
function ema(values: number[], period: number) {
  const result: number[] = [];
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(value);
  for (let i = period; i < values.length; i++) {
    value += ((values[i] - value) * 2) / (period + 1);
    result.push(value);
  }
  return result;
}
/** Close-only indicator: EMA12/26 direction 40%, Wilder RSI14 40%, MACD12/26/9 histogram direction 20%. Not a probability. */
export function trendPressure(
  input: unknown,
  seconds: number,
  now = Date.now(),
) {
  const parsed = z.array(candle).min(60).max(1000).safeParse(input);
  if (!parsed.success || !Number.isFinite(seconds) || seconds <= 0) return null;
  const candles = parsed.data.slice(-200),
    step = seconds * 1000;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Date.parse(c.time);
    if (
      time + step > now ||
      c.low > Math.min(c.open, c.close) ||
      c.high < Math.max(c.open, c.close) ||
      c.low > c.high ||
      (i > 0 && time - Date.parse(candles[i - 1].time) !== step)
    )
      return null;
  }
  const prices = candles.map((c) => c.close),
    fast = ema(prices, 12),
    slow = ema(prices, 26);
  const macdLine = slow.map((value, i) => fast[i + 14] - value),
    signals = ema(macdLine, 9);
  const macd = macdLine.at(-1)!,
    signal = signals.at(-1)!,
    histogram = macd - signal;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= 14; i++) {
    const change = prices[i] - prices[i - 1];
    gains += Math.max(change, 0) / 14;
    losses += Math.max(-change, 0) / 14;
  }
  for (let i = 15; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains = (gains * 13 + Math.max(change, 0)) / 14;
    losses = (losses * 13 + Math.max(-change, 0)) / 14;
  }
  const rsi =
    gains === 0 && losses === 0
      ? 50
      : losses === 0
        ? 100
        : 100 - 100 / (1 + gains / losses);
  const emaFast = fast.at(-1)!,
    emaSlow = slow.at(-1)!,
    emaGap = emaFast - emaSlow;
  if (![emaFast, emaSlow, rsi, macd, signal, histogram].every(Number.isFinite))
    return null;
  const direction = (value: number, tolerance: number) =>
    Math.abs(value) <= tolerance ? 50 : value > 0 ? 100 : 0;
  const emaScore = direction(emaGap, emaSlow * 0.0001),
    macdScore = direction(histogram, prices.at(-1)! * 0.000001);
  const score =
    Math.round((emaScore * 0.4 + rsi * 0.4 + macdScore * 0.2) * 10) / 10;
  const candleTime = candles.at(-1)!.time,
    candleClosedAt = new Date(Date.parse(candleTime) + step).toISOString();
  const ageMs = now - Date.parse(candleClosedAt);
  if (ageMs > 3 * step + 60000) return null;
  return {
    score,
    bearish: Math.round((100 - score) * 10) / 10,
    bias: score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral",
    emaFast,
    emaSlow,
    emaScore,
    rsi,
    macd,
    signal,
    histogram,
    macdScore,
    candleTime,
    candleClosedAt,
    ageMs,
    freshness: ageMs > step + 60000 ? "DATA DELAYED" : "FRESH",
    candlesUsed: candles.length,
  };
}
const history = z.object({
  instrumentId: z.string(),
  timeframe: z.string(),
  quoteCurrency: z.string(),
  provider: z.string(),
  source: z.string(),
  exchange: z.string().optional(),
  dataType: z.literal("historical"),
  cacheOnly: z.literal(true),
  status: z.string(),
  stale: z.boolean(),
  collectedAt: z.iso.datetime(),
  candles: z.unknown(),
});
export function approvedPressure(
  input: unknown,
  expected: {
    instrumentId: string;
    timeframe: string;
    quoteCurrency: string;
    seconds: number;
  },
  allowed: (provider: string) => boolean,
  now = Date.now(),
) {
  const parsed = history.safeParse(input);
  if (!parsed.success) return null;
  const h = parsed.data;
  if (
    h.instrumentId !== expected.instrumentId ||
    h.timeframe !== expected.timeframe ||
    h.quoteCurrency !== expected.quoteCurrency ||
    h.stale ||
    !["realtime", "delayed", "stale"].includes(h.status) ||
    !allowed(h.provider) ||
    Date.parse(h.collectedAt) > now + 5000
  )
    return null;
  const result = trendPressure(h.candles, expected.seconds, now);
  return result
    ? {
        ...result,
        instrumentId: h.instrumentId,
        timeframe: h.timeframe,
        quoteCurrency: h.quoteCurrency,
        source: h.source,
        provider: h.provider,
        exchange: h.exchange,
        collectedAt: h.collectedAt,
      }
    : null;
}
