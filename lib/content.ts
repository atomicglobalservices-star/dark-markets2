import { capitalWire, financeCalendar } from "./free-content";
import { providerEnabled, collectionStatus } from "./collection-control";
import { recordUsage } from "./collection-usage";
import { db } from "./db";
import { demoNews, demoEvents } from "./market";
import {
  normaliseNews,
  normaliseCalendar,
  type Article,
  type EconomicEvent,
} from "./content-adapters";
export type { Article, EconomicEvent } from "./content-adapters";
import { Transport } from "./feeds/transport";
const contentTransport = new Transport(fetch, Date.now, 10);
export const fixtureNews: Article[] = demoNews.map((n) => ({
  ...n,
  publishedAt: "2026-10-30T20:00:00Z",
}));
export const fixtureEvents: EconomicEvent[] = demoEvents.map((e) => ({
  ...e,
  impact: e.impact as "High" | "Medium" | "Low",
  source: "DARK MARKETS educational fixture",
  url: "/disclosures",
}));
export async function ingest(kind: "news" | "calendar") {
  const provider = process.env[kind.toUpperCase() + "_PROVIDER"] || "demo";
  const before = contentTransport.requests,
    hits = contentTransport.cacheHits,
    limits = contentTransport.rateLimits;
  try {
    await ingestImpl(kind);
  } catch {
    await collectionStatus(
      provider,
      { intervalSeconds: 3600, lastAttempt: new Date().toISOString() },
      "Collection failed; inspect source availability/validation/rights",
    );
    throw new Error(kind + " central collection failed");
  } finally {
    const requests = contentTransport.requests - before,
      cacheHits = contentTransport.cacheHits - hits,
      rateLimits = contentTransport.rateLimits - limits;
    if (requests || cacheHits || rateLimits)
      await recordUsage(provider, requests, cacheHits, rateLimits);
  }
}
async function ingestImpl(kind: "news" | "calendar") {
  const prefix = kind.toUpperCase();
  const provider = process.env[prefix + "_PROVIDER"] || "demo";
  if (!(await providerEnabled(provider))) return;
  const existing = await db.snapshot.findUnique({ where: { key: kind } });
  if (
    existing?.status === "licensed:" + provider &&
    Date.now() - existing.fetchedAt.getTime() < 3600000
  )
    return;
  if (provider === "demo") {
    const data = kind === "news" ? fixtureNews : fixtureEvents;
    await db.snapshot.upsert({
      where: { key: kind },
      create: { key: kind, content: data, status: "demonstration" },
      update: {
        content: data,
        status: "demonstration",
        fetchedAt: new Date(),
        sourceError: null,
      },
    });
    return;
  }
  const isFree =
    provider === "capitaldatawire" || provider === "financecalendar";
  if (
    !isFree &&
    (process.env[prefix + "_COMMERCIAL_RIGHTS"] !== "true" ||
      !process.env[prefix + "_API_KEY"] ||
      (!process.env[prefix + "_API_URL"] &&
        !["finnhub", "tradingeconomics"].includes(provider)) ||
      !process.env[prefix + "_RIGHTS_REFERENCE"])
  )
    throw new Error(prefix + " needs credentials and redistribution rights");
  let raw: unknown;
  const before = contentTransport.requests,
    hits = contentTransport.cacheHits,
    limits = contentTransport.rateLimits;
  if (kind === "news" && provider === "capitaldatawire")
    raw = await contentTransport.get(
      "https://capitaldatawire.com/api/v1/articles?limit=100",
      {},
      3600000,
    );
  else if (kind === "calendar" && provider === "financecalendar") {
    const groups = [];
    for (const category of [
      "economic-indicators",
      "central-banks-monetary-policy",
    ]) {
      groups.push(
        await contentTransport.get(
          "https://www.financecalendar.com/wp-json/fc/v1/calendar?category=" +
            category +
            "&limit=200",
          {},
          3600000,
        ),
      );
    }
    raw = {
      events: groups.flatMap((g) => g.events || []),
      attribution: groups[0].attribution,
    };
    const sessions = [];
    for (const exchange of ["nyse", "lse", "tse", "xetra"]) {
      try {
        const data = await contentTransport.get(
          "https://www.financecalendar.com/wp-json/fc/v1/market-status?exchange=" +
            exchange,
          {},
          3600000,
        );
        if (data.exchange === exchange && data.tz && data.session)
          sessions.push({ ...data, collectedAt: new Date().toISOString() });
      } catch {}
    }
    await db.snapshot.upsert({
      where: { key: "sessions" },
      create: { key: "sessions", content: sessions, status: "recorded" },
      update: { content: sessions, fetchedAt: new Date(), status: "recorded" },
    });
  } else if (kind === "news" && provider === "finnhub") {
    const categories = (
      process.env.NEWS_CATEGORIES || "general,crypto,forex"
    ).split(",");
    if (
      categories.some(
        (c) => !["general", "crypto", "forex", "merger"].includes(c),
      )
    )
      throw new Error("Unsupported Finnhub category");
    const groups = await Promise.all(
      categories.map((c) =>
        contentTransport
          .get(
            "https://finnhub.io/api/v1/news?category=" + c,
            { "X-Finnhub-Token": process.env.NEWS_API_KEY! },
            300000,
          )
          .then((data) => normaliseNews(data, provider, c)),
      ),
    );
    raw = groups.flat();
  } else if (kind === "calendar" && provider === "tradingeconomics") {
    raw = await contentTransport.get(
      "https://api.tradingeconomics.com/calendar?c=" +
        encodeURIComponent(process.env.CALENDAR_API_KEY!) +
        "&f=json",
      {},
      300000,
    );
  } else {
    const endpoint = new URL(process.env[prefix + "_API_URL"]!);
    if (endpoint.protocol !== "https:")
      throw new Error("Licensed content endpoint must use HTTPS");
    raw = await contentTransport.get(
      endpoint.href,
      { Authorization: "Bearer " + process.env[prefix + "_API_KEY"] },
      300000,
    );
  }
  const content =
    provider === "capitaldatawire"
      ? capitalWire(raw)
      : provider === "financecalendar"
        ? financeCalendar(raw)
        : kind === "news"
          ? normaliseNews(raw, "licensed")
          : normaliseCalendar(raw, provider);
  await collectionStatus(provider, {
    intervalSeconds: 3600,
    items: content.length,
    lastSuccess: new Date().toISOString(),
    approval: isFree
      ? "public free reuse terms reviewed"
      : "operator licence reference",
    terms:
      provider === "capitaldatawire"
        ? "https://capitaldatawire.com/copyright"
        : provider === "financecalendar"
          ? "https://www.financecalendar.com/api/"
          : process.env[prefix + "_RIGHTS_REFERENCE"],
    aiRights:
      provider !== "capitaldatawire" &&
      process.env[prefix + "_AI_RIGHTS"] === "true",
  });
  await db.snapshot.upsert({
    where: { key: kind },
    create: {
      key: kind,
      content: JSON.parse(JSON.stringify(content)),
      status: "licensed:" + provider,
    },
    update: {
      content: JSON.parse(JSON.stringify(content)),
      status: "licensed:" + provider,
      fetchedAt: new Date(),
      sourceError: null,
    },
  });
}
type Feed<T> = {
  items: T[];
  status: string;
  asOf: string;
  error: string | null;
};
export function contentFeed(kind: "news"): Promise<Feed<Article>>;
export function contentFeed(kind: "calendar"): Promise<Feed<EconomicEvent>>;
export async function contentFeed(kind: "news" | "calendar") {
  const provider = process.env[kind.toUpperCase() + "_PROVIDER"] || "demo";
  if (!(await providerEnabled(provider)))
    return {
      items: [],
      status: "disabled",
      asOf: new Date().toISOString(),
      error: "Provider disabled by administrator",
    };
  const free = provider === "capitaldatawire" || provider === "financecalendar";
  const demo =
    (process.env[kind.toUpperCase() + "_PROVIDER"] || "demo") === "demo";
  if (demo)
    return {
      items: kind === "news" ? fixtureNews : fixtureEvents,
      status: "demonstration",
      asOf: "2026-10-30T20:00:00Z",
      error:
        "No authorised " +
        kind +
        " provider is configured. Educational fixtures only.",
    };
  const snapshot = await db.snapshot.findUnique({ where: { key: kind } });
  if (
    !demo &&
    (free ||
      (process.env[kind.toUpperCase() + "_COMMERCIAL_RIGHTS"] === "true" &&
        !!process.env[kind.toUpperCase() + "_RIGHTS_REFERENCE"])) &&
    snapshot?.status ===
      "licensed:" + (process.env[kind.toUpperCase() + "_PROVIDER"] || "demo") &&
    Date.now() - snapshot.fetchedAt.getTime() < 2 * 3600000
  )
    return {
      items: snapshot.content as unknown as (Article | EconomicEvent)[],
      status: "licensed",
      asOf: snapshot.fetchedAt.toISOString(),
      error: null,
    };
  return {
    items: [],
    status: "unavailable",
    asOf: snapshot?.fetchedAt.toISOString() || new Date().toISOString(),
    error: demo
      ? "No authorised " +
        kind +
        " provider is configured. Educational fixtures only."
      : "Content feed unavailable or stale. Showing educational fixtures.",
  };
}
