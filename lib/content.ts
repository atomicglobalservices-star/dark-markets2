import { z } from "zod";
import { db } from "./db";
import { demoNews, demoEvents } from "./market";
const newsSchema = z.array(
  z.object({
    id: z.string(),
    category: z.string(),
    title: z.string().max(300),
    summary: z.string().max(3000),
    symbols: z.array(z.string()),
    source: z.string(),
    url: z.url().refine((v) => v.startsWith("https://")),
    publishedAt: z.iso.datetime(),
  }),
);
const calendarSchema = z.array(
  z.object({
    id: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    region: z.string(),
    title: z.string().max(300),
    impact: z.enum(["High", "Medium", "Low"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string(),
    url: z.url().refine((v) => v.startsWith("https://")),
  }),
);
export type Article = z.infer<typeof newsSchema>[number];
export type EconomicEvent = z.infer<typeof calendarSchema>[number];
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
  const prefix = kind.toUpperCase();
  const provider = process.env[prefix + "_PROVIDER"] || "demo";
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
  if (
    process.env[prefix + "_COMMERCIAL_RIGHTS"] !== "true" ||
    !process.env[prefix + "_API_KEY"] ||
    !process.env[prefix + "_API_URL"]
  )
    throw new Error(prefix + " needs credentials and redistribution rights");
  const response = await fetch(process.env[prefix + "_API_URL"]!, {
    headers: { Authorization: "Bearer " + process.env[prefix + "_API_KEY"] },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(prefix + " provider unavailable: " + response.status);
  const raw = await response.json();
  const content =
    kind === "news" ? newsSchema.parse(raw) : calendarSchema.parse(raw);
  await db.snapshot.upsert({
    where: { key: kind },
    create: { key: kind, content, status: "licensed" },
    update: {
      content,
      status: "licensed",
      fetchedAt: new Date(),
      sourceError: null,
    },
  });
}
export async function contentFeed(kind: "news" | "calendar") {
  const demo =
    (process.env[kind.toUpperCase() + "_PROVIDER"] || "demo") === "demo";
  const snapshot = await db.snapshot.findUnique({ where: { key: kind } });
  if (
    !demo &&
    snapshot?.status === "licensed" &&
    Date.now() - snapshot.fetchedAt.getTime() < 15 * 60000
  )
    return {
      items: snapshot.content as unknown as Article[] & EconomicEvent[],
      status: "licensed",
      asOf: snapshot.fetchedAt.toISOString(),
      error: null,
    };
  return {
    items: kind === "news" ? fixtureNews : fixtureEvents,
    status: "demonstration",
    asOf: "2026-10-30T20:00:00Z",
    error: demo
      ? null
      : "Content feed unavailable or stale. Showing educational fixtures.",
  };
}
