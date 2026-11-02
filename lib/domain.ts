export type Plan = "STANDARD" | "PREMIUM";
export const plans = {
  STANDARD: { price: 10, requests: 0 },
  PREMIUM: { price: 19, requests: 20 },
} as const;
export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
export function entitlement(
  user: {
    verified: boolean;
    plan: string;
    status: string;
    trialEndsAt: Date;
    subscriptionEndsAt: Date | null;
  },
  premium = false,
  now = new Date(),
) {
  if (!user.verified) return false;
  const active =
    user.status === "trialing"
      ? user.trialEndsAt > now
      : ["active", "canceled"].includes(user.status) &&
        !!user.subscriptionEndsAt &&
        user.subscriptionEndsAt > now;
  return active && (!premium || user.plan === "PREMIUM");
}
export function changePercent(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0)
    throw new Error("Invalid price");
  return ((current - previous) / previous) * 100;
}
export function indicator(values: number[], period = 14) {
  if (values.length < period + 1) throw new Error("Insufficient history");
  const changes = values
    .slice(-period - 1)
    .slice(1)
    .map((v, i) => v - values.slice(-period - 1)[i]);
  const gain = changes.reduce((s, v) => s + Math.max(v, 0), 0) / period,
    loss = changes.reduce((s, v) => s + Math.max(-v, 0), 0) / period;
  return {
    sma: values.slice(-period).reduce((a, b) => a + b, 0) / period,
    rsi: loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss),
  };
}
export function triggers(
  kind: string,
  threshold: number,
  quote: {
    price: number;
    change: number | null;
    volumeRatio: number | null;
    volatility: number | null;
  },
) {
  return kind === "price_above"
    ? quote.price >= threshold
    : kind === "price_below"
      ? quote.price <= threshold
      : kind === "change"
        ? quote.change !== null && Math.abs(quote.change) >= threshold
        : kind === "volume"
          ? quote.volumeRatio !== null && quote.volumeRatio >= threshold
          : kind === "volatility"
            ? quote.volatility !== null && quote.volatility >= threshold
            : false;
}
