import { coreMarkets, widgetRestricted } from "./core-markets";
import { embeddedSelection } from "./embedded-markets";
import type { Quote } from "./market";
import { directorySession } from "./market-hours";

// Registry membership determines visibility. Quotes only enrich a row.
export function marketDirectory(
  quotes: Quote[],
  category = "All markets",
  query = "",
  featured = true,
  sort = "directory",
) {
  const search = query.trim().toLowerCase();
  const rows = embeddedSelection("All markets", "", featured).map((visual) => {
    const core = coreMarkets.find((i) => i.widget === visual.symbol);
    const id = core?.id || visual.id;
    const quote =
      quotes.find(
        (q) =>
          q.instrumentId === id &&
          (visual.category !== "ETFs" ||
            (q.kind === "etf" &&
              q.quoteCurrency === "USD" &&
              ["USD per share", "USD per ETF share"].includes(q.unit || ""))) &&
          q.status !== "demonstration" &&
          Number.isFinite(q.price) &&
          q.price > 0 &&
          Number.isFinite(Date.parse(q.asOf)) &&
          Date.parse(q.asOf) <= Date.now() + 5000,
      ) || null;
    const session = directorySession(
      visual.category,
      visual.symbol,
      Date.now(),
      quote?.session,
    );
    return {
      ...visual,
      id,
      quote,
      session,
      status: quote
        ? session.startsWith("MARKET CLOSED")
          ? "MARKET CLOSED"
          : Date.now() - Date.parse(quote.asOf) > 60000 ||
              quote.status === "stale"
            ? "STALE"
            : quote.status
        : widgetRestricted(visual.symbol)
          ? "Unavailable · external chart only"
          : "Visual-only · vendor timing applies",
      chart: quote
        ? ("native" as const)
        : widgetRestricted(visual.symbol)
          ? ("external" as const)
          : ("visual" as const),
      chartUrl:
        "https://www.tradingview.com/chart/?symbol=" +
        encodeURIComponent(visual.symbol),
    };
  });
  return rows
    .filter(
      (row) =>
        (category === "All markets" || row.category === category) &&
        (!search ||
          [
            row.id,
            row.name,
            row.symbol,
            row.category,
            row.kind,
            row.quote?.symbol || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(search)),
    )
    .sort((a, b) => {
      if (sort === "directory") return 0;
      const av = sort === "volume" ? a.quote?.volumeRatio : a.quote?.change;
      const bv = sort === "volume" ? b.quote?.volumeRatio : b.quote?.change;
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return sort === "losers" ? av - bv : bv - av;
    });
}
