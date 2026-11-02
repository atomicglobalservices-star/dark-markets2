import { db } from "./db";
export const controlledProviders = [
  "binance",
  "coinbase",
  "kraken",
  "coingecko",
  "twelvedata",
  "capitaldatawire",
  "financecalendar",
  "sec",
  "tradingview",
] as const;
export type ControlledProvider = (typeof controlledProviders)[number];
export async function providerControls() {
  const rows = await db.snapshot.findMany({
    where: { key: { in: controlledProviders.map((p) => "control:" + p) } },
  });
  return Object.fromEntries(
    controlledProviders.map((p) => {
      const row = rows.find((r) => r.key === "control:" + p);
      return [
        p,
        (row?.content as { enabled?: boolean } | undefined)?.enabled !== false,
      ];
    }),
  ) as Record<ControlledProvider, boolean>;
}
export async function providerEnabled(provider: string) {
  if (!controlledProviders.includes(provider as ControlledProvider))
    return true;
  const row = await db.snapshot.findUnique({
    where: { key: "control:" + provider },
  });
  return (row?.content as { enabled?: boolean } | undefined)?.enabled !== false;
}
export async function setProviderEnabled(
  provider: ControlledProvider,
  enabled: boolean,
  actorId: string,
) {
  await db.$transaction([
    db.snapshot.upsert({
      where: { key: "control:" + provider },
      create: {
        key: "control:" + provider,
        content: { enabled },
        status: "control",
      },
      update: { content: { enabled }, fetchedAt: new Date() },
    }),
    db.audit.create({
      data: {
        actorId,
        action: "provider.control",
        detail: JSON.stringify({ provider, enabled }),
      },
    }),
  ]);
}
export async function collectionStatus(
  provider: string,
  data: Record<string, unknown>,
  error: string | null = null,
) {
  const key = "status:" + provider;
  await db.snapshot.upsert({
    where: { key },
    create: {
      key,
      content: JSON.parse(JSON.stringify(data)),
      status: error ? "error" : "collected",
      sourceError: error,
    },
    update: {
      content: JSON.parse(JSON.stringify(data)),
      status: error ? "error" : "collected",
      sourceError: error,
      fetchedAt: new Date(),
    },
  });
}
export async function collectionStatuses() {
  const rows = await db.snapshot.findMany({
    where: {
      OR: [
        { key: { startsWith: "status:" } },
        { key: "news" },
        { key: "calendar" },
        { key: { startsWith: "sec:" } },
        { key: { startsWith: "usage:" } },
      ],
    },
  });
  return rows.map((r) => ({
    key: r.key,
    status: r.status,
    asOf: r.fetchedAt.toISOString(),
    error: r.sourceError,
    details:
      r.key.startsWith("status:") || r.key.startsWith("usage:")
        ? r.content
        : undefined,
  }));
}
