import test from "node:test";
import assert from "node:assert/strict";
import { trendPressure, approvedPressure } from "../lib/trend-pressure";
const now = Date.parse("2026-11-01T12:00:00Z"),
  step = 300000;
function candles(direction = 0) {
  return Array.from({ length: 100 }, (_, i) => {
    const close = 200 + direction * i;
    return {
      time: new Date(now - (100 - i) * step).toISOString(),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 10,
    };
  });
}
test("pressure is bullish, bearish or neutral on rising, falling and flat completed candles", () => {
  const up = trendPressure(candles(1), 300, now)!,
    down = trendPressure(candles(-1), 300, now)!,
    flat = trendPressure(candles(), 300, now)!;
  assert.equal(up.bias, "Bullish");
  assert.ok(up.score >= 80);
  assert.equal(up.rsi, 100);
  assert.equal(down.bias, "Bearish");
  assert.ok(down.score <= 20);
  assert.equal(down.rsi, 0);
  assert.equal(flat.bias, "Neutral");
  assert.equal(flat.score, 50);
  assert.equal(flat.rsi, 50);
  assert.equal(flat.histogram, 0);
  for (const r of [up, down, flat]) {
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(r.score + r.bearish, 100);
    assert.equal(r.candleClosedAt, new Date(now).toISOString());
  }
});
test("pressure refuses missing, malformed, duplicate, gapped, future and obsolete candle series", () => {
  assert.equal(trendPressure([], 300, now), null);
  assert.equal(trendPressure(candles().slice(0, 59), 300, now), null);
  const bad = candles();
  bad[20].close = NaN;
  assert.equal(trendPressure(bad, 300, now), null);
  const gap = candles();
  gap.splice(50, 1);
  assert.equal(trendPressure(gap, 300, now), null);
  const duplicate = candles();
  duplicate[50].time = duplicate[49].time;
  assert.equal(trendPressure(duplicate, 300, now), null);
  const invalid = candles();
  invalid[50].low = 1000;
  assert.equal(trendPressure(invalid, 300, now), null);
  assert.equal(trendPressure(candles(), 300, now - 1), null);
  assert.equal(trendPressure(candles(), 300, now + 4 * step), null);
  assert.equal(
    trendPressure(candles(), 300, now + 2 * step)?.freshness,
    "DATA DELAYED",
  );
  assert.equal(trendPressure(candles(), 60, now), null);
});
test("analysis requires exact history identity, timeframe, quote currency and explicit provider permission", () => {
  const expected = {
    instrumentId: "BTC/USD",
    timeframe: "5m",
    quoteCurrency: "USD",
    seconds: 300,
  };
  const history = {
    ...expected,
    provider: "coinbase",
    source: "Coinbase Exchange",
    exchange: "Coinbase Exchange",
    dataType: "historical",
    cacheOnly: true,
    collectedAt: new Date(now).toISOString(),
    status: "realtime",
    stale: false,
    candles: candles(1),
  };
  assert.equal(
    approvedPressure(history, expected, () => true, now)?.bias,
    "Bullish",
  );
  assert.equal(
    approvedPressure(history, expected, () => false, now),
    null,
  );
  for (const changed of [
    { instrumentId: "BTC/USDT" },
    { timeframe: "1h" },
    { quoteCurrency: "USDT" },
    { status: "demonstration" },
    { stale: true },
    { cacheOnly: false },
    { collectedAt: "bad" },
  ])
    assert.equal(
      approvedPressure({ ...history, ...changed }, expected, () => true, now),
      null,
    );
});
