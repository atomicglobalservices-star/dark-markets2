import { z } from "zod";
export const newsSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      category: z.string().min(1),
      title: z.string().min(1).max(300),
      summary: z.string().max(3000),
      symbols: z.array(z.string()),
      source: z.string().min(1),
      url: z.url().refine((v) => v.startsWith("https://")),
      publishedAt: z.iso.datetime(),
      breaking: z.boolean().optional(),
      provider: z.string().optional(),
      providerCategory: z.string().optional(),
      aiGenerated: z.boolean().optional(),
      corroborated: z.boolean().optional(),
      verification: z.string().optional(),
      license: z.string().optional(),
      attribution: z.string().optional(),
      freshness: z.enum(["recent", "historical"]).optional(),
    }),
  )
  .max(1000);
const nullableValue = z
  .union([z.string().max(200), z.number().finite()])
  .nullable()
  .optional();
export const calendarSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable(),
      region: z.string().min(1),
      currency: z.string().max(10).nullable().optional(),
      title: z.string().min(1),
      impact: z.enum(["High", "Medium", "Low"]).nullable(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (s) => new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
        ),
      source: z.string().min(1),
      url: z.url().refine((v) => v.startsWith("https://")),
      figureEvidence: z
        .object({
          previous: z
            .object({
              availability: z.string().optional(),
              evidence: z.string().optional(),
            })
            .optional(),
          forecast: z
            .object({
              availability: z.string().optional(),
              evidence: z.string().optional(),
            })
            .optional(),
          actual: z
            .object({
              availability: z.string().optional(),
              evidence: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      previous: nullableValue,
      forecast: nullableValue,
      actual: nullableValue,
      unit: z.string().nullable().optional(),
      tentative: z.boolean().optional(),
      provider: z.string().optional(),
      providerUrl: z.string().optional(),
      attribution: z.record(z.string(), z.string()).optional(),
      sourceLicense: z.json().optional(),
      sourceRights: z.json().optional(),
      sourceStatus: z.string().optional(),
      datePrecision: z.string().optional(),
      currencyBasis: z.string().optional(),
      lastVerifiedAt: z.string().nullable().optional(),
      dataStale: z.boolean().optional(),
      dateWindowStart: z.string().nullable().optional(),
      dateWindowEnd: z.string().nullable().optional(),
    }),
  )
  .max(2000);
export type Article = z.infer<typeof newsSchema>[number];
export type EconomicEvent = z.infer<typeof calendarSchema>[number];
function contentDate(input: unknown, assumeUTC = false) {
  if (typeof input !== "string" && typeof input !== "number")
    throw new Error("Invalid content timestamp");
  let value = typeof input === "number" ? input * 1000 : input;
  if (
    assumeUTC &&
    typeof value === "string" &&
    !/(Z|[+-]\d\d:\d\d)$/.test(value)
  )
    value += "Z";
  const time = new Date(value);
  if (!Number.isFinite(time.getTime()))
    throw new Error("Invalid content timestamp");
  return time.toISOString();
}
export function normaliseNews(
  raw: unknown,
  provider: string,
  category = "general",
  now = Date.now(),
): Article[] {
  let rows: unknown = raw;
  if (provider === "finnhub") {
    if (!Array.isArray(raw)) throw new Error("Invalid Finnhub response");
    rows = raw.map((d) => {
      if (!Number.isSafeInteger(d.id) || !Number.isFinite(d.datetime))
        throw new Error("Missing news identity/time");
      return {
        id: "finnhub:" + String(d.id),
        title: d.headline,
        summary: d.summary || "",
        category:
          category === "crypto"
            ? "Crypto"
            : category === "forex"
              ? "Forex"
              : category === "commodities"
                ? "Commodities"
                : "Stocks",
        symbols:
          typeof d.related === "string"
            ? d.related
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
        source: d.source,
        url: d.url,
        publishedAt: contentDate(d.datetime),
        breaking: false,
      };
    });
  }
  const parsed = newsSchema.parse(rows);
  const seen = new Set<string>();
  const seenHeadlines = new Set<string>();
  return parsed
    .filter((a) => {
      if (Date.parse(a.publishedAt) > now + 60000)
        throw new Error("Future news timestamp");
      const url = new URL(a.url);
      for (const key of [...url.searchParams.keys()])
        if (key.startsWith("utm_")) url.searchParams.delete(key);
      url.hash = "";
      // URL paths may be case-sensitive. Deduplicate publisher syndication only
      // within the same UTC publication day; do not collapse unrelated sources.
      const canonical = url.href;
      const headline = [
        a.source.toLowerCase().trim(),
        a.publishedAt.slice(0, 10),
        a.title
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim(),
      ].join("|");
      if (seen.has(canonical)) return false;
      if (seenHeadlines.has(headline)) return false;
      seen.add(canonical);
      seenHeadlines.add(headline);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
export function normaliseCalendar(
  raw: unknown,
  provider: string,
): EconomicEvent[] {
  let rows: unknown = raw;
  if (provider === "tradingeconomics") {
    if (!Array.isArray(raw))
      throw new Error("Invalid Trading Economics response");
    rows = raw.map((d) => {
      if (
        !["string", "number"].includes(typeof d.CalendarId) ||
        ![1, 2, 3].includes(Number(d.Importance))
      )
        throw new Error("Missing calendar identity/importance");
      const at = contentDate(d.Date, true);
      const value = (v: unknown) => (v == null || v === "" ? null : v);
      return {
        id: "te:" + String(d.CalendarId),
        date: at.slice(0, 10),
        time: at.slice(11, 16),
        region: d.Country,
        currency: d.Currency || null,
        title: d.Event,
        impact:
          Number(d.Importance) === 3
            ? "High"
            : Number(d.Importance) === 2
              ? "Medium"
              : "Low",
        source: d.Source || "Trading Economics",
        url: d.SourceURL || "https://tradingeconomics.com/calendar",
        previous: value(d.Previous),
        forecast: value(d.Forecast),
        actual: value(d.Actual),
        unit: d.Unit || null,
        tentative: Number(d.DateSpan) !== 0,
      };
    });
  }
  const parsed = calendarSchema.parse(rows);
  const seen = new Set<string>();
  return parsed
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
export function filterNews(
  items: Article[],
  query = "",
  category = "",
  symbol = "",
) {
  const q = query.toLowerCase().slice(0, 100);
  return items.filter(
    (n) =>
      (!category || n.category === category) &&
      (!symbol || n.symbols.includes(symbol)) &&
      (!q ||
        [n.title, n.summary, n.source].some((s) =>
          s.toLowerCase().includes(q),
        )),
  );
}
export function filterCalendar(
  items: EconomicEvent[],
  country = "",
  currency = "",
  importance = "",
  date = "",
) {
  return items.filter(
    (e) =>
      (!country ||
        e.region.toLowerCase().includes(country.toLowerCase().slice(0, 100))) &&
      (!currency || e.currency === currency) &&
      (!importance || e.impact === importance) &&
      (!date || e.date === date),
  );
}
