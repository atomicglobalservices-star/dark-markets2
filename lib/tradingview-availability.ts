// Observed in the official widgets on 2026-11-01. This is embed availability,
// never native-feed entitlement or a promise that a displayed value is current.
export type RelatedVisual = {
  id: string;
  symbol: string;
  name: string;
  category: string;
  kind: string;
  unit: string;
  source: string;
};
export type WidgetAvailability = {
  symbol: string;
  checkedAt: string;
  quotes: "restricted" | "available";
  chart: "restricted" | "available";
  reason: string;
  exactChartUrl: string;
  related: RelatedVisual;
};
const related = (
  symbol: string,
  name: string,
  category: string,
  kind: string,
  unit: string,
): RelatedVisual => ({
  id: symbol,
  symbol,
  name,
  category,
  kind,
  unit,
  source: symbol.split(":")[0],
});
const index = (symbol: string, name: string, currency = "USD") =>
  related(
    symbol,
    name + " · FOREX.com CFD",
    "CFDs",
    "broker-specific CFD; not the official cash index",
    currency + " broker index quote units; contract size unverified",
  );
const reference = (symbol: string, name: string, unit: string) =>
  related(
    symbol,
    name + " · TradingView calculated reference",
    "References",
    "TradingView-calculated reference / CFD-style product; not exchange futures or a verified spot feed",
    unit,
  );
const definitions: [string, RelatedVisual][] = [
  ["SP:SPX", index("FOREXCOM:SPXUSD", "US 500")],
  ["NASDAQ:NDX", index("FOREXCOM:NSXUSD", "US 100")],
  ["DJ:DJI", index("FOREXCOM:DJI", "US Wall Street 30")],
  ["FTSE:UKX", index("FOREXCOM:UKXGBP", "UK 100", "GBP")],
  ["COMEX:GC1!", reference("TVC:GOLD", "Gold", "USD per troy ounce reference")],
  [
    "COMEX:SI1!",
    reference("TVC:SILVER", "Silver", "USD per troy ounce reference"),
  ],
  ["NYMEX:CL1!", reference("TVC:USOIL", "WTI", "USD per barrel reference")],
  ["ICEEUR:BRN1!", reference("TVC:UKOIL", "Brent", "USD per barrel reference")],
  [
    "NYMEX:NG1!",
    related(
      "FX:NGAS",
      "Natural gas · FXCM CFD",
      "CFDs",
      "FXCM broker CFD; not NYMEX continuous futures",
      "USD per MMBtu broker reference; contract size unverified",
    ),
  ],
  [
    "COMEX:HG1!",
    related(
      "CAPITALCOM:XCUUSD",
      "Copper · Capital.com CFD",
      "CFDs",
      "Capital.com broker CFD; not COMEX continuous futures",
      "Vendor copper quote units; contract size unverified",
    ),
  ],
];
export const tradingViewAvailability: WidgetAvailability[] = definitions.map(
  ([symbol, related]) => ({
    symbol,
    related,
    checkedAt: "2026-11-01",
    quotes: "restricted",
    chart: "restricted",
    reason:
      "TradingView reports this symbol is only available on TradingView; its embed distribution is restricted. The identifier is valid.",
    exactChartUrl:
      "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(symbol),
  }),
);
export function widgetAvailability(symbol: string) {
  return tradingViewAvailability.find((row) => row.symbol === symbol);
}
export function relatedVisualDefinition(symbol: string) {
  return (
    tradingViewAvailability.find((row) => row.related.symbol === symbol)
      ?.related || null
  );
}
export function quoteWidgetSelection<T extends { symbol: string }>(items: T[]) {
  const alternatives = items.flatMap((original) => {
    const availability = widgetAvailability(original.symbol);
    return availability?.quotes === "restricted" && availability.exactChartUrl
      ? [{ original, availability }]
      : [];
  });
  // Omit a failed row only when its exact external view remains available below.
  const omitted = new Set(alternatives.map((row) => row.original.symbol));
  return {
    displayed: items.filter((row) => !omitted.has(row.symbol)),
    alternatives,
  };
}
