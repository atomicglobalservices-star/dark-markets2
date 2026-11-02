import type { Quote } from "./market";
export function advancedIndicators(values: number[]) {
  if (values.length < 26) throw new Error("At least 26 observations required");
  const ema = (period: number) =>
    values.reduce<number[]>((a, v, i) => {
      a.push(
        i === 0
          ? v
          : v * (2 / (period + 1)) + a[i - 1] * (1 - 2 / (period + 1)),
      );
      return a;
    }, []);
  const fast = ema(12),
    slow = ema(26);
  const macd = fast.map((v, i) => v - slow[i]);
  const signal = macd.reduce<number[]>((a, v, i) => {
    a.push(i === 0 ? v : v * 0.2 + a[i - 1] * 0.8);
    return a;
  }, []);
  const recent = values.slice(-20),
    mean = recent.reduce((a, b) => a + b, 0) / 20;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / 20);
  return {
    macd: macd.at(-1)!,
    signal: signal.at(-1)!,
    bollinger: { middle: mean, upper: mean + 2 * sd, lower: mean - 2 * sd },
  };
}
export function comparison(a: Quote, b: Quote) {
  const right = new Map(b.history.map((p) => [p.time, p.price]));
  const common = a.history.filter((p) => right.has(p.time));
  const first = common[0];
  return {
    series: common.map((p) => ({
      time: p.time,
      [a.symbol]: (p.price / first.price - 1) * 100,
      [b.symbol]: (right.get(p.time)! / right.get(first.time)! - 1) * 100,
    })),
    indicators: [a, b].map((q) => ({
      symbol: q.symbol,
      ...advancedIndicators(q.history.map((p) => p.price)),
    })),
    sources: [a, b].map((q) => ({
      symbol: q.symbol,
      source: q.source,
      asOf: q.asOf,
      status: q.status,
      instrumentId: q.instrumentId,
      exchange: q.exchange,
      quoteCurrency: q.quoteCurrency,
      latencyMs: q.latencyMs,
    })),
  };
}

export function correlation(a: Quote, b: Quote): number | null {
  const right = new Map(b.history.map((p) => [p.time, p.price]));
  const common = a.history.filter((p) => right.has(p.time));
  if (common.length < 16) return null;
  const x: number[] = [],
    y: number[] = [];
  for (let j = 1; j < common.length; j++) {
    x.push(Math.log(common[j].price / common[j - 1].price));
    y.push(
      Math.log(right.get(common[j].time)! / right.get(common[j - 1].time)!),
    );
  }
  const mx = x.reduce((a, b) => a + b, 0) / x.length,
    my = y.reduce((a, b) => a + b, 0) / y.length;
  const covariance = x.reduce((s, v, j) => s + (v - mx) * (y[j] - my), 0),
    vx = x.reduce((s, v) => s + (v - mx) ** 2, 0),
    vy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return vx > 0 && vy > 0
    ? Math.max(-1, Math.min(1, covariance / Math.sqrt(vx * vy)))
    : null;
}
