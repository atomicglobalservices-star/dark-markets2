import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeHistory,
  type AnalysisContext,
} from "../lib/technical-analysis";
import { feedConfig } from "../lib/feeds/config";
import type { ProviderId } from "../lib/feeds/types";
const now = Date.parse("2026-11-02T12:00:00Z"),
  step = 300000;
const request = {
  instrumentId: "BTC/USD",
  timeframe: "5m",
  quoteCurrency: "USD",
};
const context: AnalysisContext = { now, scope: "local", allowed: () => true };
function fixture(prices = Array.from({ length: 60 }, (_, i) => 100 + i)) {
  return {
    instrumentId: "BTC/USD",
    timeframe: "5m",
    quoteCurrency: "USD",
    provider: "coinbase",
    source: "Coinbase Exchange",
    exchange: "Coinbase Exchange",
    dataType: "historical",
    cacheOnly: true,
    status: "realtime",
    stale: false,
    collectedAt: new Date(now).toISOString(),
    candles: prices.map((close, i) => ({
      time: new Date(now - (prices.length - i) * step).toISOString(),
      open: close,
      high: close + 2,
      low: close - 2,
      close,
      volume: 10 as number | null,
    })),
  };
}
function near(actual: number | undefined, expected: number, tolerance = 1e-9) {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
}
test("fixed rising candles have known SMA-seeded EMA20/50, Wilder RSI, MACD and ATR values", () => {
  const data = fixture(),
    r = analyzeHistory(data, request, context);
  assert.equal(r.status, "available");
  near(r.indicators.ema20.value!, 149.5);
  near(r.indicators.ema50.value!, 134.5);
  near(r.indicators.rsi14.value!, 100);
  near(r.indicators.macd.value?.line, 7);
  near(r.indicators.macd.value?.signal, 7);
  near(r.indicators.macd.value?.histogram, 0);
  near(r.indicators.atr14.value!, 4);
  assert.equal(r.candles.lastClosedAt, new Date(now).toISOString());
  assert.equal(r.candles.lastOpenedAt, new Date(now - step).toISOString());
  assert.equal(r.freshness.status, "fresh");
  assert.equal(r.source?.provider, "coinbase");
  assert.deepEqual(r, analyzeHistory(data, request, context));
});
test("fixed falling and flat candles preserve bearish momentum, flat RSI convention and zero MACD", () => {
  const falling = analyzeHistory(
    fixture(Array.from({ length: 60 }, (_, i) => 200 - i)),
    request,
    context,
  );
  near(falling.indicators.rsi14.value!, 0);
  near(falling.indicators.macd.value?.line, -7);
  const flat = analyzeHistory(fixture(Array(60).fill(100)), request, context);
  near(flat.indicators.ema20.value!, 100);
  near(flat.indicators.ema50.value!, 100);
  near(flat.indicators.rsi14.value!, 50);
  near(flat.indicators.macd.value?.histogram, 0);
  near(flat.indicators.atr14.value!, 4);
});
test("Wilder RSI seed and ATR true ranges use fixed known gains/losses and previous closes", () => {
  const prices = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28,
  ];
  const r = analyzeHistory(fixture(prices), request, context);
  near(r.indicators.rsi14.value!, 100 - 100 / (1 + 3.34 / 1.4));
  const data = fixture([10, 11, ...Array(13).fill(30)]);
  data.candles = data.candles.map((c) => ({
    ...c,
    high: c.close + 1,
    low: c.close - 1,
  }));
  near(analyzeHistory(data, request, context).indicators.atr14.value!, 46 / 14);
});
test("each indicator reports its own warm-up count without invented values", () => {
  const short = analyzeHistory(fixture(Array(15).fill(100)), request, context);
  assert.equal(short.status, "partial");
  assert.equal(short.indicators.ema20.value, null);
  assert.equal(short.indicators.ema50.value, null);
  assert.equal(short.indicators.macd.value, null);
  assert.equal(short.indicators.atr14.available, true);
  assert.equal(short.indicators.rsi14.available, true);
  assert.equal(short.indicators.ema50.reason?.requiredCandles, 50);
  assert.equal(
    analyzeHistory(fixture(Array(34).fill(100)), request, context).indicators
      .macd.available,
    true,
  );
  const none = analyzeHistory(fixture([]), request, context);
  assert.equal(none.status, "unavailable");
  assert.equal(none.reasons[0].code, "MISSING_CANDLES");
  assert.ok(Object.values(none.indicators).every((i) => i.value === null));
});
test("unapproved or mismatched history never yields indicator values", () => {
  for (const changed of [
    { instrumentId: "BTC/USDT" },
    { quoteCurrency: "USDT" },
    { timeframe: "1h" },
  ]) {
    const r = analyzeHistory({ ...fixture(), ...changed }, request, context);
    assert.equal(r.reasons[0].code, "IDENTITY_MISMATCH");
    assert.ok(Object.values(r.indicators).every((i) => i.value === null));
  }
  const denied = analyzeHistory(fixture(), request, {
    ...context,
    allowed: (_, cap) => cap !== "analysis",
  });
  assert.equal(denied.reasons[0].code, "PERMISSION_DENIED");
  const commercial = feedConfig({ MARKET_DATA_SCOPE: "commercial" });
  assert.equal(
    analyzeHistory(fixture(), request, {
      now,
      scope: "commercial",
      allowed: (p, c) => commercial.allowed(p as ProviderId, c),
    }).reasons[0].code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    analyzeHistory({ ...fixture(), timestampKind: "fixture" }, request, context)
      .reasons[0].code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    analyzeHistory({ ...fixture(), status: "demonstration" }, request, context)
      .reasons[0].code,
    "INVALID_HISTORY",
  );
});
test("malformed, duplicate, unordered, missing-interval and incomplete candles fail with explicit reasons", () => {
  const invalid = fixture();
  invalid.candles[4].low = 1000;
  assert.equal(
    analyzeHistory(invalid, request, context).reasons[0].code,
    "INVALID_OHLC",
  );
  const duplicate = fixture();
  duplicate.candles[4].time = duplicate.candles[3].time;
  assert.equal(
    analyzeHistory(duplicate, request, context).reasons[0].code,
    "UNSORTED_OR_DUPLICATE_CANDLES",
  );
  const gap = fixture();
  gap.candles.splice(4, 1);
  assert.equal(
    analyzeHistory(gap, request, context).reasons[0].code,
    "GAPPED_CANDLES",
  );
  assert.equal(
    analyzeHistory(fixture(), request, { ...context, now: now - 1 }).reasons[0]
      .code,
    "INCOMPLETE_CANDLE",
  );
  assert.equal(
    analyzeHistory(
      { ...fixture(), candles: [{ ...fixture().candles[0], close: NaN }] },
      request,
      context,
    ).reasons[0].code,
    "INVALID_CANDLES",
  );
  assert.equal(
    analyzeHistory(fixture(), { ...request, timeframe: "4h" }, context)
      .reasons[0].code,
    "UNSUPPORTED_TIMEFRAME",
  );
});
test("freshness is based on candle close, separately from collection; stale results have no indicators", () => {
  const delayed = analyzeHistory(fixture(), request, {
    ...context,
    now: now + 2 * step,
  });
  assert.equal(delayed.freshness.status, "delayed");
  assert.equal(delayed.freshness.ageMs, 2 * step);
  assert.equal(delayed.status, "available");
  const stale = analyzeHistory(fixture(), request, {
    ...context,
    now: now + 4 * step,
  });
  assert.equal(stale.reasons[0].code, "STALE_HISTORY");
  assert.equal(stale.freshness.status, "stale");
  assert.equal(stale.candles.count, 60);
  assert.ok(Object.values(stale.indicators).every((i) => i.value === null));
  assert.equal(
    analyzeHistory({ ...fixture(), stale: true }, request, context).reasons[0]
      .code,
    "STALE_HISTORY",
  );
  assert.equal(
    analyzeHistory(
      { ...fixture(), collectedAt: new Date(now + 6000).toISOString() },
      request,
      context,
    ).reasons[0].code,
    "FUTURE_CACHE_TIMESTAMP",
  );
  assert.equal(
    analyzeHistory(
      { ...fixture(), collectedAt: new Date(now - step).toISOString() },
      request,
      context,
    ).reasons[0].code,
    "INVALID_COLLECTION_TIME",
  );
});
test("unknown volume is retained as unknown, never filled; computed indicators remain finite", () => {
  const data = fixture();
  for (const c of data.candles) c.volume = null;
  const r = analyzeHistory(data, request, context);
  assert.equal(r.candles.volumeMissing, 60);
  assert.equal(r.status, "available");
  assert.equal(data.candles[0].volume, null);
});
