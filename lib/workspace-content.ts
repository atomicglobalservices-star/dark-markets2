import { marketDirectory } from "./market-directory";
import type { Article, EconomicEvent } from "./content-adapters";
const currencies: Record<string, string[]> = {
  USD: ["federal reserve", "us dollar"],
  EUR: ["european central bank", "euro"],
  GBP: ["bank of england", "sterling"],
  JPY: ["bank of japan", "yen"],
  CHF: ["swiss national bank", "swiss franc"],
  AUD: ["reserve bank of australia", "australian dollar"],
  CAD: ["bank of canada", "canadian dollar"],
  NZD: ["reserve bank of new zealand", "new zealand dollar"],
  ZAR: ["south african reserve bank", "rand"],
};
const indexCurrency: Record<string, string> = {
  "SPX/INDEX": "USD",
  "NDX/INDEX": "USD",
  "DJI/INDEX": "USD",
  "FTSE/INDEX": "GBP",
  "DAX/INDEX": "EUR",
  "N225/INDEX": "JPY",
  "NIKKEI/INDEX": "JPY",
};
const aliases: Record<string, string[]> = {
  "BTC/USD": ["bitcoin"],
  "ETH/USD": ["ethereum"],
  "SOL/USD": ["solana"],
  "XAU/USD": ["gold"],
  "XAG/USD": ["silver"],
  "BIQUOTE:USOIL": ["wti", "crude oil"],
  "BIQUOTE:UKOIL": ["brent", "crude oil"],
  "BIQUOTE:XNGUSD": ["natural gas"],
  "BIQUOTE:XCUUSD": ["copper"],
};
const regions: Record<string, string> = {
  "united states": "USD",
  us: "USD",
  usa: "USD",
  "united kingdom": "GBP",
  uk: "GBP",
  japan: "JPY",
  germany: "EUR",
  "euro area": "EUR",
  eurozone: "EUR",
  "european union": "EUR",
  france: "EUR",
  australia: "AUD",
  canada: "CAD",
  "new zealand": "NZD",
  switzerland: "CHF",
  "south africa": "ZAR",
};
export function workspaceTopics(ids: string[]) {
  const selected = marketDirectory([], "All markets", "", false).filter((i) =>
    ids.includes(i.id),
  );
  const currency = new Set<string>();
  const terms = new Set<string>();
  for (const instrument of selected) {
    const base = instrument.id.split(":").at(-1)!.split("/")[0];
    terms.add(base.toLowerCase());
    terms.add(instrument.id.replace(/[^a-z0-9]/gi, "").toLowerCase());
    for (const term of aliases[instrument.id] || []) terms.add(term);
    const name = instrument.name.split(" � ")[0].toLowerCase();
    if (name.length > 3) terms.add(name.replace(/ inc\.?$/, ""));
    if (instrument.category === "Forex")
      for (const c of instrument.id.split("/")) currency.add(c);
    else if (instrument.category === "Indices") {
      const c =
        indexCurrency[instrument.id] ||
        (instrument.name.toLowerCase().includes("nikkei") ? "JPY" : undefined);
      if (c) currency.add(c);
    } else if (
      ["Crypto", "Stocks", "ETFs", "Commodities", "CFDs"].includes(
        instrument.category,
      )
    )
      currency.add("USD");
  }
  for (const c of currency)
    for (const term of currencies[c] || []) terms.add(term);
  return { currency, terms, selected };
}
function matches(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9])" + escaped + "(?=$|[^a-z0-9])", "i").test(
    text,
  );
}
export function workspaceNews(
  articles: Article[],
  ids: string[],
  now = Date.now(),
) {
  const { terms, selected } = workspaceTopics(ids);
  if (!selected.length) return [];
  return articles
    .filter(
      (a) =>
        Date.parse(a.publishedAt) <= now + 60000 &&
        [...terms].some((term) =>
          matches(
            [
              a.title,
              a.summary,
              ...a.symbols,
              a.symbols.map((s) => s.replace(/[^a-z0-9]/gi, "")).join(" "),
            ].join(" "),
            term,
          ),
        ),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 50);
}
export function workspaceCalendar(
  events: EconomicEvent[],
  ids: string[],
  now = Date.now(),
) {
  const { currency } = workspaceTopics(ids);
  const today = new Date(now).toISOString().slice(0, 10);
  return events
    .filter((e) => {
      if (
        !currency.has(
          (e.currency || regions[e.region.toLowerCase()] || "").toUpperCase(),
        )
      )
        return false;
      if (e.dateWindowEnd) return e.dateWindowEnd >= today;
      if (e.date < today) return false;
      return !e.time || e.tentative
        ? e.date >= today
        : Date.parse(e.date + "T" + e.time + ":00Z") >= now;
    })
    .sort((a, b) =>
      (a.date + (a.time || "23:59")).localeCompare(
        b.date + (b.time || "23:59"),
      ),
    )
    .slice(0, 50);
}

export function workspaceCalendarCountries(ids: string[]) {
  const map: Record<string, string> = {
    USD: "US",
    EUR: "EU",
    GBP: "GB",
    JPY: "JP",
    CHF: "CH",
    AUD: "AU",
    CAD: "CA",
    NZD: "NZ",
    ZAR: "ZA",
  };
  return [...workspaceTopics(ids).currency]
    .flatMap((c) => (map[c] ? [map[c]] : []))
    .sort();
}
