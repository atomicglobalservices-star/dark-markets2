import type { EvaluationQuote } from "./feeds/additional-providers";

// Website display only: provider terms §9 and FAQ checked 2026-11-01.
// Spot references retain their provider identity; they never price broker CFDs or futures.
export type SpotReference = Pick<
  EvaluationQuote,
  | "providerSymbol"
  | "price"
  | "quoteCurrency"
  | "unit"
  | "source"
  | "asOf"
  | "receivedAt"
  | "timestampKind"
  | "latencyMs"
> & {
  relatedWidget: string;
  status: "indicative" | "stale";
};
const metals: Record<string, string> = {
  XAU: "FX_IDC:XAUUSD",
  XAG: "FX_IDC:XAGUSD",
  XPT: "NYMEX:PL1!",
  XPD: "NYMEX:PA1!",
};

// Account remains ADMIN even when previewing the ordinary layout. These records
// are local evaluation observations, not subscriber-approved native quotes.
export function localFxReferences(quotes: EvaluationQuote[], now = Date.now()) {
  const symbols = [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "USDCHF",
    "AUDUSD",
    "USDCAD",
    "NZDUSD",
    "USDZAR",
  ];
  return quotes
    .filter(
      (q) =>
        q.provider === "biquote" &&
        symbols.includes(q.providerSymbol) &&
        q.priceType === "indicative-midpoint" &&
        q.timestampKind === "provider-quote" &&
        q.quoteCurrency === q.providerSymbol.slice(3) &&
        q.unit === `${q.quoteCurrency} per ${q.providerSymbol.slice(0, 3)}` &&
        Number.isFinite(q.price) &&
        q.price > 0 &&
        q.bid != null &&
        q.ask != null &&
        Number.isFinite(q.bid) &&
        Number.isFinite(q.ask) &&
        q.bid > 0 &&
        q.ask >= q.bid &&
        Math.abs(q.price - (q.bid + q.ask) / 2) <=
          Math.max(1e-8, q.price * 1e-7) &&
        Number.isFinite(Date.parse(q.asOf)) &&
        Number.isFinite(Date.parse(q.receivedAt)) &&
        Date.parse(q.asOf) <= Date.parse(q.receivedAt) + 5000 &&
        Date.parse(q.receivedAt) <= now + 5000 &&
        q.publicDisplayEnabled === false &&
        q.analysisAllowed === false &&
        q.exportAllowed === false,
    )
    .map((q) => ({ ...q, stale: q.stale || now - Date.parse(q.asOf) > 60000 }));
}
export function websiteSpotReferences(
  quotes: EvaluationQuote[],
  now = Date.now(),
): SpotReference[] {
  return quotes.flatMap((q) => {
    const sourceTime = Date.parse(q.asOf),
      received = Date.parse(q.receivedAt);
    if (
      q.provider !== "goldapi" ||
      !metals[q.providerSymbol] ||
      q.id !== `goldapi:${q.providerSymbol}/USD:spot-reference` ||
      q.priceType !== "spot-reference" ||
      q.quoteCurrency !== "USD" ||
      q.unit !== "USD per troy ounce" ||
      q.timestampKind !== "provider-source-fetch" ||
      !Number.isFinite(q.price) ||
      q.price <= 0 ||
      !Number.isFinite(sourceTime) ||
      !Number.isFinite(received) ||
      sourceTime > received + 5000 ||
      received > now + 5000 ||
      !Number.isFinite(q.latencyMs) ||
      q.latencyMs < 0
    )
      return [];
    return [
      {
        providerSymbol: q.providerSymbol,
        price: q.price,
        quoteCurrency: q.quoteCurrency,
        unit: q.unit,
        source: q.source,
        asOf: q.asOf,
        receivedAt: q.receivedAt,
        timestampKind: q.timestampKind,
        latencyMs: q.latencyMs,
        relatedWidget: metals[q.providerSymbol],
        status:
          q.stale || now - sourceTime > 60000
            ? ("stale" as const)
            : ("indicative" as const),
      },
    ];
  });
}
