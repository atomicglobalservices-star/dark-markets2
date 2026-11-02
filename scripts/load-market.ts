import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { MarketEngine } from "../lib/feeds/engine";
import {
  resolveInstrument,
  type Provider,
  type Observation,
} from "../lib/feeds/types";
async function main() {
  let upstream = 0;
  const i = resolveInstrument("BTC/USDT");
  const mock: Provider = {
    id: "binance",
    health: async () => {},
    quote: async () => {
      upstream++;
      const now = new Date().toISOString();
      return {
        instrumentId: i.id,
        provider: "binance",
        providerSymbol: "BTCUSDT",
        exchange: "Local load fixture",
        source: "Local load fixture",
        baseCurrency: "BTC",
        quoteCurrency: "USDT",
        price: 100,
        change: 1,
        volume: 1,
        asOf: now,
        receivedAt: now,
        latencyMs: 0,
        timestampKind: "exchange",
        status: "realtime",
        transport: "rest",
        candles: [],
        exchangeTimezone: "UTC",
        session: "fixture",
      };
    },
  };
  const engine = new MarketEngine([mock], {
    priority: ["binance"],
    cacheMs: 300000,
  });
  const consumers = new Set<import("node:http").ServerResponse>();
  const server = createServer(async (req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      consumers.add(res);
      res.write("data: connected\n\n");
      req.on("close", () => consumers.delete(res));
      return;
    }
    if (req.url !== "/quotes") {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(await engine.quote(i)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as import("node:net").AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const cpu = process.cpuUsage(),
    started = performance.now(),
    beforeRss = process.memoryUsage().rss;
  const count = 5000,
    concurrency = 100;
  const durations: number[] = [];
  let next = 0,
    failures = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count) {
        next++;
        const at = performance.now();
        try {
          const r = await fetch(base + "/quotes");
          const q = await r.json();
          if (!r.ok || q.price !== 100) failures++;
        } catch {
          failures++;
        }
        durations.push(performance.now() - at);
      }
    }),
  );
  const controllers = Array.from({ length: 250 }, () => new AbortController());
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  try {
    for (let n = 0; n < controllers.length; n += 25)
      await Promise.all(
        controllers.slice(n, n + 25).map(async (c) => {
          const r = await fetch(base + "/events", { signal: c.signal });
          readers.push(r.body!.getReader());
        }),
      );
    const update = "data: " + JSON.stringify(await engine.quote(i)) + "\n\n";
    for (const c of consumers) c.write(update);
    await Promise.all(
      readers.map(async (r) => {
        let data = "";
        while (!data.includes("instrumentId")) {
          const part = await r.read();
          if (part.done) throw new Error("Unexpected disconnect");
          data += new TextDecoder().decode(part.value);
        }
      }),
    );
  } finally {
    controllers.forEach((c) => c.abort());
    await Promise.allSettled(readers.map((r) => r.cancel()));
  }
  const elapsed = performance.now() - started;
  durations.sort((a, b) => a - b);
  const usage = process.cpuUsage(cpu);
  const report = {
    checkedAt: new Date().toISOString(),
    mockOnly: true,
    externalRequests: 0,
    httpRequests: count,
    concurrency,
    sseConsumers: 250,
    failures,
    upstreamCalls: upstream,
    cacheHits: engine.metrics.cacheHits,
    deduplicated: engine.metrics.deduplicated,
    p50Ms: durations[Math.floor(count * 0.5)],
    p95Ms: durations[Math.floor(count * 0.95)],
    p99Ms: durations[Math.floor(count * 0.99)],
    elapsedMs: elapsed,
    cpuMs: (usage.user + usage.system) / 1000,
    rssBefore: beforeRss,
    rssAfter: process.memoryUsage().rss,
    limitation:
      "Local mock engine/HTTP/fan-out test, not a complete authenticated application/database or 20,000-user capacity test",
  };
  await mkdir("work/load", { recursive: true });
  await writeFile("work/load/results.json", JSON.stringify(report, null, 2));
  console.log(report);
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  if (failures || upstream !== 1) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
