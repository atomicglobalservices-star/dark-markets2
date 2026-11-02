import { coreMarkets } from "./core-markets";
import type { EvaluationQuote } from "./feeds/additional-providers";

export function nativeUnavailableReason(id: string) {
  const core = coreMarkets.find((i) => i.id === id);
  if (!core || core.category === "Crypto")
    return "No native observation returned; check provider availability and quote freshness.";
  if (core.category === "Commodities")
    return "Spot references and broker CFD contracts are separate products, not substitutes. See the attributed TradingView quote table; native broker quotes require exact source identity and display permission.";
  if (core.category === "Indices")
    return "Missing official cash-index feed. Broker references have unresolved contract/source identity and are not approved substitutes.";
  if (core.category === "CFDs")
    return "Missing exact OANDA contract feed. Biquote Broker 1 is not verified as OANDA; subscriber display is unapproved.";
  if (core.category === "Stocks" || core.category === "ETFs")
    return "Missing exact listed-security feed. Broker/USDT products have unverified listing, units and display conditions.";
  return "Biquote observations are evaluation-only: broker/source identity and upstream subscriber display conditions remain unresolved.";
}
export function evaluationDiagnostics(
  quotes: EvaluationQuote[],
  automaticCollectionEnabled: string[],
  nativeIds: string[] = [],
) {
  return coreMarkets
    .filter((core) => !nativeIds.includes(core.id))
    .map((core) => {
      const reasons = [nativeUnavailableReason(core.id)];
      if (core.category !== "Crypto" && !automaticCollectionEnabled.length)
        reasons.push(
          "Automatic evaluation collection is disabled; administrators can still inspect cache or request a bounded refresh.",
        );
      if (core.category !== "Crypto")
        reasons.push(
          "Evaluation snapshots are not approved for subscriber display, analysis or export.",
        );
      const symbols =
        core.category === "Forex"
          ? [core.id.replace("/", "")]
          : core.category === "Stocks"
            ? [core.id.split("/")[0]]
            : core.category === "ETFs"
              ? [core.id.split("/")[0] + "USDT"]
              : core.id === "XAU/USD"
                ? ["XAU", "XAUUSD"]
                : core.id === "XAG/USD"
                  ? ["XAG", "XAGUSD"]
                  : core.id === "BIQUOTE:USOIL"
                    ? ["USOIL"]
                    : core.id === "BIQUOTE:UKOIL"
                      ? ["UKOIL"]
                      : core.id === "BIQUOTE:XNGUSD"
                        ? ["XNGUSD"]
                        : core.id === "BIQUOTE:XCUUSD"
                          ? ["HG", "XCUUSD"]
                          : (
                              {
                                "SPX/INDEX": ["US500"],
                                "NDX/INDEX": ["NAS100"],
                                "DJI/INDEX": ["US30"],
                                "FTSE/INDEX": ["UK100"],
                                "DAX/INDEX": ["DE30"],
                                "N225/INDEX": ["JP225"],
                                "OANDA:SPX500USD": ["US500"],
                                "OANDA:XAUUSD": ["XAUUSD"],
                              } as Record<string, string[]>
                            )[core.id] || [];
      const candidates = quotes.filter((q) =>
        symbols.includes(q.providerSymbol),
      );
      if (core.category !== "Crypto" && !candidates.length)
        reasons.push(
          "No cached provider response for a matching candidate; an exact approved instrument is still missing.",
        );
      if (candidates.some((q) => q.stale))
        reasons.push(
          "Candidate observation is stale; source timestamp has not been renewed.",
        );
      if (candidates.some((q) => q.marketState === "closed"))
        reasons.push(
          "Provider reports market closed: last-session observation only.",
        );
      return {
        id: core.id,
        name: core.name,
        category: core.category,
        reasons,
        candidates: candidates.map((q) => q.provider + ":" + q.providerSymbol),
      };
    });
}
