import { mkdir, writeFile, readFile } from "node:fs/promises";
import { coreMarkets, widgetRestricted } from "../lib/core-markets";
import { engineFetch } from "../lib/feeds/client";
import { feedConfig } from "../lib/feeds/config";
import type { Observation } from "../lib/feeds/types";

async function main() {
  const checkedAt = new Date().toISOString();
  const [snapshot, health] = await Promise.all(
    ["/snapshot", "/health"].map(async (p) => {
      const response = await engineFetch(p as "/snapshot" | "/health");
      if (!response.ok)
        throw new Error(
          "Existing central engine unavailable: " + response.status,
        );
      return response.json();
    }),
  );
  const config = feedConfig();
  const rows = [];
  for (const core of coreMarkets) {
    const quote = (snapshot.observations as Observation[]).find(
      (q) => q.instrumentId === core.id,
    );
    let history: any = null;
    if (quote) {
      const response = await engineFetch(
        `/history?instrument=${encodeURIComponent(core.id)}&timeframe=1h`,
      );
      if (response.ok) {
        const data = await response.json();
        history = {
          count: data.candles?.length || 0,
          provider: data.provider,
          stale: data.stale,
          cacheOnly: data.cacheOnly,
          lastBar: data.candles?.at(-1)?.time,
          gaps: data.gaps?.length || 0,
        };
      }
    }
    rows.push({
      ...core,
      native: quote
        ? {
            provider: quote.provider,
            providerSymbol: quote.providerSymbol,
            source: quote.source,
            exchange: quote.exchange,
            quoteCurrency: quote.quoteCurrency,
            price: quote.price,
            asOf: quote.asOf,
            receivedAt: quote.receivedAt,
            timestampKind: quote.timestampKind,
            ageMs: Date.now() - Date.parse(quote.asOf),
            latencyMs: quote.latencyMs,
            status: quote.status,
            warning: quote.warning,
            commercialDisplayAuthorised:
              config.scope === "commercial" &&
              config.allowed(quote.provider, "display"),
          }
        : null,
      history,
      widgetStatus: widgetRestricted(core.widget)
        ? "vendor-restricted; checked 2026-11-01"
        : "configured; see browser verification",
    });
  }
  const active = JSON.parse(
    await readFile("work/reliability/active.json", "utf8"),
  );
  const monitor = JSON.parse(
    await readFile(active.directory + "/summary.json", "utf8"),
  );
  const report = {
    checkedAt,
    scope: config.scope,
    coreCount: rows.length,
    nativeCount: rows.filter((r) => r.native).length,
    freshUnder60Seconds: rows.filter((r) => r.native && r.native.ageMs <= 60000)
      .length,
    realtimeFresh: rows.filter(
      (r) => r.native?.status === "realtime" && r.native.ageMs <= 60000,
    ).length,
    historicalCount: rows.filter((r) => r.history?.count > 0).length,
    engine: {
      instanceId: health.instanceId,
      startedAt: health.startedAt,
      refreshErrors: health.refreshErrors,
      usage: health.usage,
    },
    endurance: {
      directory: active.directory,
      status: monitor.status,
      deadline: monitor.deadline,
      freshness: monitor.freshness,
      elapsedSeconds: monitor.elapsedSeconds,
      engineRestarts: monitor.engineRestarts,
      workerRestarts: monitor.workerRestarts,
      appErrors: monitor.appErrors,
      quotaEvents: monitor.quotaEvents,
    },
    rows,
  };
  await mkdir("work/essential", { recursive: true });
  await writeFile(
    "work/essential/coverage.json",
    JSON.stringify(report, null, 2),
  );
  const matrix = [
    "# Essential instrument coverage",
    "",
    `Checked ${checkedAt}. Local evaluation only. Widget IDs are configured, not proof of live vendor data.`,
    "",
    "| Category | Instrument | Exact product | Widget ID | Native source | Hourly history |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.category} | ${r.name} (${r.id}) | ${r.product} | ${r.widget} | ${r.native ? r.native.provider + ":" + r.native.providerSymbol + " · " + r.native.status : "Unavailable — no authorised configured native feed"} | ${r.history ? r.history.count + " bars · " + r.history.provider : "Unavailable"} |`,
    ),
  ];
  await writeFile("docs/ESSENTIAL-COVERAGE.md", matrix.join("\n") + "\n");
  console.log(
    JSON.stringify(
      {
        checkedAt,
        coreCount: report.coreCount,
        nativeCount: report.nativeCount,
        freshUnder60Seconds: report.freshUnder60Seconds,
        realtimeFresh: report.realtimeFresh,
        historicalCount: report.historicalCount,
        engine: report.engine,
        endurance: report.endurance,
        quotes: rows
          .filter((r) => r.native)
          .map((r) => ({ id: r.id, ...r.native, history: r.history })),
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
