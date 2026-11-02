import { analyzeHistory, unavailableAnalysis } from "./technical-analysis";
import { feedConfig } from "./feeds/config";
import { engineFetch } from "./feeds/client";
import {
  resolveInstrument,
  timeframes,
  providerIds,
  type ProviderId,
} from "./feeds/types";
/** Server-only read adapter. Reads the existing central history cache; never triggers provider collection. */
export async function analyzeCachedMarket(
  instrumentId: string,
  timeframe: string,
  now = Date.now(),
) {
  const config = feedConfig();
  let instrument;
  try {
    instrument = resolveInstrument(instrumentId);
  } catch {
    return unavailableAnalysis(
      { instrumentId, timeframe, quoteCurrency: "" },
      config.scope as "local" | "commercial",
      "UNKNOWN_INSTRUMENT",
      "Instrument is not in the existing native registry",
    );
  }
  const request = {
    instrumentId: instrument.id,
    timeframe,
    quoteCurrency: instrument.quote,
  };
  const scope = config.scope as "local" | "commercial";
  if (!Object.hasOwn(timeframes, timeframe))
    return unavailableAnalysis(
      request,
      scope,
      "UNSUPPORTED_TIMEFRAME",
      "Timeframe is not supported by the existing engine",
    );
  if (process.env.MARKET_PROVIDER !== "multi")
    return unavailableAnalysis(
      request,
      scope,
      "PROVIDER_DISABLED",
      "Approved multi-provider history is not enabled",
    );
  try {
    const response = await engineFetch(
      `/history?instrument=${encodeURIComponent(instrument.id)}&timeframe=${encodeURIComponent(timeframe)}`,
    );
    if (!response.ok)
      return unavailableAnalysis(
        request,
        scope,
        "HISTORY_UNAVAILABLE",
        `Central history cache returned HTTP ${response.status}; no upstream request was triggered`,
      );
    return analyzeHistory(await response.json(), request, {
      now,
      scope,
      allowed: (provider, capability) =>
        providerIds.includes(provider as ProviderId) &&
        provider !== "coingecko" &&
        config.allowed(provider as ProviderId, capability),
    });
  } catch {
    return unavailableAnalysis(
      request,
      scope,
      "HISTORY_UNAVAILABLE",
      "Central history cache is unavailable or malformed; no substitute data used",
    );
  }
}
