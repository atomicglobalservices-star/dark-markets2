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
  const size = Math.min(a.history.length, b.history.length);
  return {
    series: a.history
      .slice(-size)
      .map((p, i) => ({
        time: p.time,
        [a.symbol]:
          (p.price / a.history[a.history.length - size].price - 1) * 100,
        [b.symbol]:
          (b.history[b.history.length - size + i].price /
            b.history[b.history.length - size].price -
            1) *
          100,
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
    })),
  };
}
