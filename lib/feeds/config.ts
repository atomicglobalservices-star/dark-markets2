import { providerIds, type ProviderId } from "./types";
export type ProviderRights = {
  display?: boolean;
  cache?: boolean;
  stream?: boolean;
  export?: boolean;
  ai?: boolean;
  analysis?: boolean;
  redistribution?: boolean;
  reference?: string;
  verifiedAt?: string;
};
export type FeedConfig = ReturnType<typeof feedConfig>;
const integer = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error("Invalid feed interval or budget");
  return n;
};
export function feedConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const priority = (
    env.MARKET_PROVIDER_PRIORITY ||
    "coinbase,kraken,binance,coingecko,twelvedata"
  )
    .split(",")
    .map((s) => s.trim()) as ProviderId[];
  if (
    !priority.length ||
    priority.some((id) => !providerIds.includes(id)) ||
    new Set(priority).size !== priority.length
  )
    throw new Error("Invalid provider priority");
  const scope = env.MARKET_DATA_SCOPE || "local";
  if (!["local", "commercial"].includes(scope))
    throw new Error("Invalid market data scope");
  const origin = new URL(env.APP_URL || "http://localhost:3100");
  if (
    scope === "local" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
    throw new Error("Local market data requires a loopback APP_URL");
  const rights = JSON.parse(env.MARKET_PROVIDER_RIGHTS || "{}") as Partial<
    Record<ProviderId, ProviderRights>
  >;
  const allowed = (id: ProviderId, capability: keyof ProviderRights) => {
    if (scope === "local")
      return (
        capability === "display" ||
        capability === "cache" ||
        capability === "analysis" ||
        capability === "stream"
      );
    const r = rights[id];
    return (
      !!r?.display &&
      !!r?.cache &&
      r.redistribution === true &&
      r?.[capability] === true &&
      typeof r.reference === "string" &&
      r.reference.length > 10 &&
      Number.isFinite(Date.parse(r.verifiedAt || ""))
    );
  };
  const overrides = JSON.parse(env.MARKET_PROVIDER_BUDGETS || "{}") as Record<
    string,
    unknown
  >;
  if (
    Object.keys(overrides).some((id) => !providerIds.includes(id as ProviderId))
  )
    throw new Error("Unknown provider budget");
  const budgets = Object.fromEntries(
    providerIds.map((id) => [
      id,
      integer(
        overrides[id] === undefined ? undefined : String(overrides[id]),
        id === "twelvedata"
          ? 8
          : id === "coingecko"
            ? 5
            : integer(env.MARKET_REQUESTS_PER_MINUTE, 60, 1, 1200),
        1,
        1200,
      ),
    ]),
  ) as Record<ProviderId, number>;
  return {
    budgets,
    priority: priority.filter((id) => allowed(id, "display")),
    scope,
    rights,
    allowed,
    token: env.MARKET_ENGINE_TOKEN || "",
    port: integer(env.MARKET_ENGINE_PORT, 3110, 1024, 65535),
    pollMs: integer(env.MARKET_POLL_MS, 15000, 5000, 300000),
    staleMs: integer(env.MARKET_STALE_MS, 60000, 10000, 900000),
    dwellMs: integer(env.MARKET_MIN_DWELL_MS, 300000, 0, 3600000),
    recoveryProbeMs: integer(env.MARKET_RECOVERY_PROBE_MS, 30000, 1000, 300000),
    recoverySuccesses: integer(env.MARKET_RECOVERY_SUCCESSES, 3, 1, 10),
    requestsPerMinute: integer(env.MARKET_REQUESTS_PER_MINUTE, 60, 1, 1200),
    websocket:
      env.BINANCE_WEBSOCKET_ENABLED === "true" && allowed("binance", "stream"),
    coingeckoKey: env.COINGECKO_API_KEY,
    twelveDataKey: env.TWELVE_DATA_API_KEY,
    scheduleEnabled: env.TWELVE_DATA_SCHEDULE_ENABLED === "true",
  };
}
