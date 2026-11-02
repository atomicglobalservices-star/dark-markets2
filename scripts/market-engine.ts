import { sessionAllows } from "../lib/market-hours";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import {
  CentralSchedule,
  marketSessionAllowed,
} from "../lib/feeds/central-schedule";
import { providerControls, collectionStatus } from "../lib/collection-control";
import { recordUsage } from "../lib/collection-usage";
import { db } from "../lib/db";
import { createServer, type ServerResponse } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { feedConfig } from "../lib/feeds/config";
import {
  instruments,
  resolveInstrument,
  timeframes,
  type Timeframe,
  type Observation,
} from "../lib/feeds/types";
import { MarketEngine } from "../lib/feeds/engine";
import { RestProvider } from "../lib/feeds/providers";
import { Transport } from "../lib/feeds/transport";
import { BinanceStream } from "../lib/feeds/binance-stream";
if (process.env.MARKET_PROVIDER !== "multi")
  throw new Error(
    "Shared engine requires explicit MARKET_PROVIDER=multi; stop it when returning to demo mode",
  );
const config = feedConfig();
if (config.token.length < 32)
  throw new Error("Set a random MARKET_ENGINE_TOKEN (32+ characters)");
const providers = config.priority
  .filter((id) => id !== "twelvedata" || config.twelveDataKey)
  .map(
    (id) =>
      new RestProvider(id, new Transport(fetch, Date.now, config.budgets[id]), {
        ...config,
        inlineHistory: false,
      }),
  );
const engine = new MarketEngine(providers, {
  priority: config.priority,
  cacheMs: Math.min(10000, Math.floor(config.pollMs * 0.6)),
  dwellMs: config.dwellMs,
  recoveryProbeMs: config.recoveryProbeMs,
  recoverySuccesses: config.recoverySuccesses,
  refreshMarginMs: 15000,
  staleMs: config.staleMs,
});
const selected =
  process.env.MARKET_INSTRUMENTS?.split(",").map((id) => {
    const i = instruments.find((i) => i.id === id.trim());
    if (!i) throw new Error("Unknown configured market instrument");
    return i;
  }) || instruments;
const instanceId = randomUUID();
const startedAt = new Date().toISOString();
let refreshes = 0,
  refreshErrors = 0,
  lastRefreshAt: string | null = null,
  requestCount = 0;
type HistoryData = Awaited<ReturnType<typeof engine.history>>;
const histories = new CentralSchedule<HistoryData>();
let initialized = false,
  historyBusy = false,
  lastSaved = 0;
let marketCalendarRows: any[] = [];
let nextHistoryScan = 0;
let controls: Awaited<ReturnType<typeof providerControls>> | null = null;
const pendingHistory: {
  instrument: (typeof selected)[number];
  timeframe: Timeframe;
}[] = [];
let observations: Observation[] = [];
async function checkpoint() {
  if (Date.now() - lastSaved < 60000) return;
  lastSaved = Date.now();
  await mkdir("work/central", { recursive: true });
  await writeFile(
    "work/central/market.tmp",
    JSON.stringify({
      savedAt: new Date().toISOString(),
      observations,
      histories: histories.entries(),
    }),
  );
  await rename("work/central/market.tmp", "work/central/market.json");
}
async function collectHistory() {
  if (!initialized || historyBusy || stopped || refreshing) return;
  if (!pendingHistory.length && Date.now() < nextHistoryScan) return;
  if (!pendingHistory.length) {
    nextHistoryScan = Date.now() + 10000;
    for (const tf of ["1h", "1m", "5m", "1d"] as Timeframe[])
      for (const i of selected) {
        const q = engine.cachedSnapshot([i])[0];
        if (
          q &&
          sessionAllows(i, marketCalendarRows) &&
          (!histories.read(i.id + ":" + tf) ||
            histories.read(i.id + ":" + tf)!.nextAt <= Date.now())
        )
          pendingHistory.push({ instrument: i, timeframe: tf });
      }
  }
  const task = pendingHistory.shift();
  if (!task || !sessionAllows(task.instrument, marketCalendarRows)) return;
  historyBusy = true;
  try {
    const interval = {
      "1m": 60000,
      "5m": 300000,
      "15m": 900000,
      "1h": 3600000,
      "1d": 86400000,
    }[task.timeframe];
    await histories.collect(
      task.instrument.id + ":" + task.timeframe,
      interval,
      () => engine.history(task.instrument, task.timeframe, true),
    );
    await checkpoint();
  } catch {
  } finally {
    historyBusy = false;
  }
}

let refreshing = false;
let stopped = false;
const clients = new Set<ServerResponse>();
let publishTimer: ReturnType<typeof setTimeout> | undefined;
function reliability() {
  const now = Date.now();
  const eligible = selected.filter((i) => i.category === "Crypto");
  const rows = eligible.map((i) => {
    const q = observations.find((q) => q.instrumentId === i.id);
    const ageMs = q ? now - Date.parse(q.asOf) : null;
    const receiptAgeMs = q ? now - Date.parse(q.receivedAt) : null;
    return {
      instrumentId: i.id,
      provider: q?.provider || null,
      timestampKind: q?.timestampKind || null,
      sourceAgeMs: ageMs,
      receiptAgeMs,
      fresh:
        !!q &&
        q.status !== "stale" &&
        ageMs !== null &&
        ageMs >= -5000 &&
        ageMs <= config.staleMs,
      sourceLagMs: q ? Date.parse(q.receivedAt) - Date.parse(q.asOf) : null,
    };
  });
  return {
    thresholdMs: config.staleMs,
    eligible: rows.length,
    fresh: rows.filter((r) => r.fresh).length,
    percentage: rows.length
      ? (100 * rows.filter((r) => r.fresh).length) / rows.length
      : 0,
    rows,
  };
}
async function workerHealth() {
  try {
    const w = JSON.parse(await readFile("work/monitor/worker.json", "utf8"));
    return { ...w, healthy: Date.now() - Date.parse(w.heartbeatAt) < 20000 };
  } catch {
    return { healthy: false };
  }
}
const snapshot = () => ({
  observations: observations.map((q) =>
    Date.now() - Date.parse(q.asOf) > config.staleMs
      ? {
          ...q,
          status: "stale",
          warning: "Observation is stale; not a live quote.",
        }
      : q,
  ),
  asOf: new Date().toISOString(),
});
function broadcast() {
  const message =
    "data: " +
    JSON.stringify({
      ...snapshot(),
      observations: snapshot().observations.filter((q) =>
        config.allowed(q.provider, "stream"),
      ),
    }) +
    "\n\n";
  for (const client of clients) {
    if (client.writableLength > 262144) {
      client.destroy();
      clients.delete(client);
    } else client.write(message);
  }
}
async function refresh() {
  if (!initialized || refreshing || stopped) return;
  refreshing = true;
  try {
    controls = await providerControls();
    for (const id of config.priority) engine.setEnabled(id, controls[id]);
    if (controls.binance && config.websocket) stream?.start();
    else stream?.stop();
    histories.invalidateProvider((h) => controls?.[h.provider] === false);
    const calendar = await db.snapshot.findUnique({
      where: { key: "sessions" },
    });
    const sessions = Array.isArray(calendar?.content) ? calendar!.content : [];
    marketCalendarRows = sessions;
    const active = selected.filter((i) => sessionAllows(i, sessions));
    const collected = await engine.snapshot(active, (q) => {
      const history = histories.read(q.instrumentId + ":1h");
      if (!q.candles.length && history?.value.provider === q.provider) {
        q = { ...q, candles: history.value.candles };
        engine.hydrateHistory(q.instrumentId, q.provider, q.candles);
      }
      const index = observations.findIndex(
        (old) => old.instrumentId === q.instrumentId,
      );
      if (index < 0) observations.push(q);
      else observations[index] = q;
    });
    const activeIds = new Set(active.map((i) => i.id));
    observations = [
      ...collected.map((q) =>
        q.status === "stale"
          ? q
          : engine.cachedSnapshot([
              selected.find((i) => i.id === q.instrumentId)!,
            ])[0] || q,
      ),
      ...observations
        .filter(
          (q) =>
            !activeIds.has(q.instrumentId) && controls?.[q.provider] !== false,
        )
        .map((q) => ({
          ...q,
          session: "closed or unverified session; REST polling paused",
        })),
    ];
    refreshes++;
    lastRefreshAt = new Date().toISOString();
    broadcast();
    await checkpoint();
    const previous = await db.snapshot.findUnique({
      where: { key: "status:market" },
    });
    const last = previous?.content as any;
    for (const p of providers) {
      const old = last?.instanceId === instanceId ? last?.usage?.[p.id] : null;
      await recordUsage(
        p.id,
        Math.max(0, p.transport.requests - (old?.requests || 0)),
        Math.max(0, p.transport.cacheHits - (old?.cacheHits || 0)),
        Math.max(0, p.transport.rateLimits - (old?.rateLimits || 0)),
      );
    }
    await collectionStatus("market", {
      instanceId,
      intervalSeconds: config.pollMs / 1000,
      lastSuccess: lastRefreshAt,
      observations: observations.length,
      requestCount,
      usage: Object.fromEntries(
        providers.map((p) => [
          p.id,
          {
            requests: p.transport.requests,
            rateLimits: p.transport.rateLimits,
            cacheHits: p.transport.cacheHits,
          },
        ]),
      ),
    });
  } catch {
    refreshErrors++;
    console.error(
      JSON.stringify({
        event: "collection_failed",
        at: new Date().toISOString(),
        refreshErrors,
      }),
    );
  } finally {
    refreshing = false;
  }
}
const stream = config.websocket
  ? new BinanceStream(
      selected,
      (i, q) => {
        engine.acceptStream(i, q);
        // Coalesce exchange updates and resolve provider priority before publishing; never let a secondary stream silently win.
        if (!publishTimer)
          publishTimer = setTimeout(() => {
            publishTimer = undefined;
            const cached = engine.cachedSnapshot(selected);
            observations = observations.map((q) =>
              q.provider === "binance"
                ? cached.find(
                    (c) =>
                      c.instrumentId === q.instrumentId &&
                      c.provider === q.provider,
                  ) || q
                : q,
            );
            broadcast();
          }, 1000);
      },
      () => {
        engine.disconnect("binance");
        void refresh();
      },
    )
  : null;
const server = createServer(async (req, res) => {
  requestCount++;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const provided = Buffer.from(req.headers.authorization || ""),
    expected = Buffer.from("Bearer " + config.token);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    res.writeHead(401).end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/snapshot") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(snapshot()));
  } else if (url.pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        instanceId,
        pid: process.pid,
        startedAt,
        uptimeSeconds: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        requestCount,
        refreshes,
        refreshErrors,
        lastRefreshAt,
        collectionIntervalSeconds: config.pollMs / 1000,
        reliability: reliability(),
        switches: engine.switches,
        sourceWarnings: Object.fromEntries(engine.sourceWarnings),
        worker: await workerHealth(),
        historyCollection: { ...histories.stats, failures: histories.failures },
        historyCached: histories.entries().length,
        metrics: engine.metrics,
        streamMetrics: stream?.metrics || null,
        coverage: engine.diagnostics(selected),
        scope: config.scope,
        providers: engine.health(),
        usage: Object.fromEntries(
          providers.map((p) => [
            p.id,
            {
              configuredRequestsPerMinute: config.budgets[p.id],
              cacheHits: p.transport.cacheHits,
              deduplicated: p.transport.deduplicated,
              rateLimits: p.transport.rateLimits,
              requests: p.transport.requests,
              failures: p.transport.failures,
              usedWeight: p.transport.usedWeight,
              budget: p.transport.usage,
            },
          ]),
        ),
        stream: stream?.state || "disabled",
        subscribers: clients.size,
      }),
    );
  } else if (url.pathname === "/history") {
    try {
      const i = resolveInstrument(url.searchParams.get("instrument") || "");
      const tf = url.searchParams.get("timeframe") || "1h";
      if (
        !selected.some((s) => s.id === i.id) ||
        !Object.hasOwn(timeframes, tf)
      ) {
        res.writeHead(400).end();
        return;
      }
      const cached = histories.read(i.id + ":" + tf);
      if (!cached) {
        res.writeHead(503, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error:
              "Central history collection warming/unavailable; no page-triggered upstream request",
          }),
        );
        return;
      }
      const result = {
        ...cached.value,
        collectedAt: new Date(cached.at).toISOString(),
        cacheOnly: true,
        stale: Date.now() > cached.nextAt + 60000,
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(503).end(
        JSON.stringify({
          error: "Historical data unavailable; no substitute instrument used",
        }),
      );
    }
  } else if (url.pathname === "/events") {
    if (clients.size >= 1000) {
      res.writeHead(503).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    clients.add(res);
    res.write(
      "data: " +
        JSON.stringify({
          ...snapshot(),
          observations: snapshot().observations.filter((q) =>
            config.allowed(q.provider, "stream"),
          ),
        }) +
        "\n\n",
    );
    req.on("close", () => clients.delete(res));
  } else res.writeHead(404).end();
});
let poll: ReturnType<typeof setTimeout>;
function schedulePoll() {
  poll = setTimeout(
    async () => {
      await refresh();
      if (!stopped) schedulePoll();
    },
    Math.max(1000, config.pollMs - 1000 + Math.floor(Math.random() * 1000)),
  );
}
schedulePoll();
const probes = setInterval(() => void engine.probe(), 60000);
const heartbeat = setInterval(() => {
  for (const c of clients) c.write(": heartbeat\n\n");
}, 15000);
const historyTimer = setInterval(() => void collectHistory(), 250);
async function boot() {
  try {
    controls = await providerControls();
    for (const id of config.priority) engine.setEnabled(id, controls[id]);
    const saved = JSON.parse(
      await readFile("work/central/market.json", "utf8"),
    );
    if (Date.now() - Date.parse(saved.savedAt) < 86400000) {
      histories.restore(saved.histories || []);
      histories.invalidateProvider(
        (h) =>
          !config.allowed(h.provider, "cache") ||
          controls?.[h.provider] === false,
      );
      observations = (saved.observations || [])
        .filter(
          (q: Observation) =>
            config.allowed(q.provider, "display") &&
            controls?.[q.provider] !== false,
        )
        .map((q: Observation) => ({ ...q, status: "stale" }));
    }
  } catch {}
  initialized = true;
  server.listen(config.port, "127.0.0.1", () => {
    console.log(
      "Central market collector listening on loopback " + config.port,
    );
    void refresh();
  });
}
void boot();
function stop() {
  stopped = true;
  clearInterval(poll);
  clearInterval(historyTimer);
  clearInterval(probes);
  clearInterval(heartbeat);
  clearTimeout(publishTimer);
  stream?.stop();
  for (const c of clients) c.end();
  server.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
