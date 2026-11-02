import { marketDirectory } from "./market-directory";
import type { Quote } from "./market";
import type { SpotReference } from "./spot-display";
export function marketTicker(
  quotes: Quote[],
  spots: SpotReference[] = [],
  now = Date.now(),
) {
  return marketDirectory(quotes, "All markets", "", true).map((row) => {
    const native = row.quote;
    const spot = ["XAU/USD", "XAG/USD"].includes(row.id)
      ? spots.find(
          (s) =>
            s.relatedWidget === row.symbol &&
            Number.isFinite(s.price) &&
            s.price > 0 &&
            Number.isFinite(Date.parse(s.asOf)) &&
            Date.parse(s.asOf) <= now + 5000,
        )
      : undefined;
    const closed = row.session.startsWith("MARKET CLOSED");
    const status = closed
      ? "MARKET CLOSED"
      : native
        ? native.status === "realtime" && now - Date.parse(native.asOf) <= 60000
          ? "LIVE"
          : "DATA DELAYED"
        : spot
          ? "DATA DELAYED"
          : "VISUAL ONLY";
    return {
      ...row,
      price: native?.price ?? spot?.price ?? null,
      currency: native?.quoteCurrency || spot?.quoteCurrency || "",
      unit: native?.unit || spot?.unit || row.unit,
      asOf: native?.asOf || spot?.asOf || null,
      source:
        native?.exchange ||
        native?.source ||
        (spot ? "Gold API" : "TradingView"),
      tickerStatus: status,
      change:
        native?.change != null && Number.isFinite(native.change)
          ? native.change
          : null,
    };
  });
}
