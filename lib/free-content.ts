import {
  normaliseNews,
  normaliseCalendar,
  type Article,
  type EconomicEvent,
} from "./content-adapters";
function countryCurrency(country: unknown): string | null {
  const map: Record<string, string> = {
    US: "USD",
    GB: "GBP",
    UK: "GBP",
    EU: "EUR",
    EA: "EUR",
    DE: "EUR",
    FR: "EUR",
    JP: "JPY",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    CH: "CHF",
    CN: "CNY",
    IN: "INR",
    NO: "NOK",
    SE: "SEK",
    HK: "HKD",
  };
  return typeof country === "string" ? map[country] || null : null;
}
export function capitalWire(raw: any, now = Date.now()): Article[] {
  if (!Array.isArray(raw?.data) || raw.meta?.demo_data === true)
    throw new Error("Missing genuine news payload");
  const articles = raw.data
    .filter((a: any) => a.is_demo === false)
    .map((a: any) => {
      if (
        !a.id ||
        !a.license?.includes("Free to republish") ||
        !String(a.url).startsWith("https://capitaldatawire.com/stories/")
      )
        throw new Error("Missing source identity or reuse notice");
      const category = /crypto|bitcoin|blockchain/i.test(a.category)
        ? "Crypto"
        : /forex|currenc/i.test(a.category)
          ? "Forex"
          : /commod|oil|gold|energy/i.test(a.category)
            ? "Commodities"
            : "Stocks";
      const explicit = Array.isArray(a.symbols)
        ? a.symbols.filter((s: unknown) => typeof s === "string")
        : Array.isArray(a.tickers)
          ? a.tickers.filter((s: unknown) => typeof s === "string")
          : [];
      const mentioned = [
        ...String(a.body || a.title || "").matchAll(
          /\b(?:NASDAQ|NYSE|AMEX):\s*([A-Z][A-Z0-9.-]{0,9})\b/g,
        ),
      ].map((m) => m[1]);
      const names: Record<string, RegExp> = {
        AAPL: /\bApple\b/i,
        NVDA: /\bNVIDIA\b/i,
        MSFT: /\bMicrosoft\b/i,
        AMZN: /\bAmazon\b/i,
        GOOGL: /\bAlphabet\b/i,
        META: /\bMeta Platforms\b/i,
        TSLA: /\bTesla\b/i,
        JPM: /\bJPMorgan\b/i,
        BTC: /\bBitcoin\b/i,
        ETH: /\bEthereum\b/i,
      };
      const symbols = [
        ...new Set([
          ...explicit,
          ...mentioned,
          ...Object.entries(names)
            .filter(([, pattern]) => pattern.test(a.title + " " + a.summary))
            .map(([symbol]) => symbol),
        ]),
      ];
      const [base] = normaliseNews(
        [
          {
            id: "cdw:" + a.id,
            title: a.title,
            summary: a.summary || a.subheadline || "",
            symbols,
            category,
            source: "Capital Data Wire",
            url: a.url,
            publishedAt: new Date(a.published_at).toISOString(),
            breaking: false,
          },
        ],
        "licensed",
        category,
        now,
      );
      return {
        ...base,
        provider: "capitaldatawire",
        providerCategory: a.category,
        aiGenerated: true,
        corroborated: false,
        verification:
          "AI-written source material; not independently corroborated",
        license: a.license,
        attribution: a.attribution || "Capital Data Wire",
        freshness:
          now - Date.parse(base.publishedAt) > 86400000
            ? "historical"
            : "recent",
      };
    });
  return normaliseNews(articles, "licensed", "general", now);
}
export function financeCalendar(raw: any): EconomicEvent[] {
  if (!Array.isArray(raw?.events) || !raw.attribution?.terms)
    throw new Error("Calendar requires records and attribution");
  const seen = new Set<string>();
  return raw.events
    .filter((e: any) => {
      if (e.status === "cancelled" || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .map((e: any) => {
      if (typeof e.id !== "string" || !e.id || typeof e.date !== "string")
        throw new Error("Missing event identity/date");
      const instant =
        typeof e.release_at_utc === "string"
          ? new Date(e.release_at_utc)
          : null;
      if (instant && !Number.isFinite(instant.getTime()))
        throw new Error("Invalid UTC instant");
      const knownTime = instant
        ? instant.toISOString().slice(11, 16)
        : typeof e.time_utc === "string"
          ? e.time_utc.slice(0, 5)
          : null;
      const country = e.country || "Unspecified";
      const mapped = {
        id: "fc:" + e.id,
        date: instant ? instant.toISOString().slice(0, 10) : e.date,
        time: knownTime,
        region: country,
        currency: e.currency || countryCurrency(e.country),
        currencyBasis: e.currency
          ? "provider"
          : "derived from country; not the indicator unit",
        title: e.title || e.name,
        impact:
          e.impact === "high"
            ? "High"
            : e.impact === "medium"
              ? "Medium"
              : e.impact === "low"
                ? "Low"
                : null,
        source: e.source_name || "Finance Calendar",
        url: e.source_url || e.url || "https://www.financecalendar.com",
        figureEvidence: e.data_quality?.fields
          ? Object.fromEntries(
              [
                ["previous", "prior"],
                ["forecast", "consensus"],
                ["actual", "actual"],
              ].map(([target, source]) => [
                target,
                {
                  availability: e.data_quality.fields[source]?.availability,
                  evidence: e.data_quality.fields[source]?.evidence,
                },
              ]),
            )
          : undefined,
        previous: e.prior ?? null,
        forecast: e.consensus ?? null,
        actual: e.actual ?? null,
        unit: e.unit ?? null,
        tentative:
          !knownTime ||
          e.status === "estimated" ||
          !["instant", "exact", "minute", null, undefined].includes(
            e.time_precision,
          ),
        provider: "financecalendar",
        providerUrl: "https://www.financecalendar.com",
        attribution: raw.attribution,
        sourceLicense: e.source_license ?? null,
        sourceRights: e.source_rights ?? null,
        sourceStatus: e.status || "unknown",
        datePrecision: e.time_precision || "unknown",
        lastVerifiedAt: e.last_verified_at || null,
        dataStale: e.data_stale === true,
        dateWindowStart: e.date_window_start || null,
        dateWindowEnd: e.date_window_end || null,
      };
      // Reuse shared validation without turning unknown impact/time into known values.
      normaliseCalendar(
        [
          {
            ...mapped,
            time: knownTime || "00:00",
            impact: mapped.impact || "Low",
          },
        ],
        "licensed",
      );
      return mapped as EconomicEvent;
    });
}
