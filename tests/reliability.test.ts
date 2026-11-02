import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketEngine } from "../lib/feeds/engine";
import { Transport } from "../lib/feeds/transport";
import { RestProvider } from "../lib/feeds/providers";
import { feedConfig } from "../lib/feeds/config";
import {
  FeedError,
  resolveInstrument,
  type Observation,
  type Provider,
  type ProviderId,
} from "../lib/feeds/types";
const i = resolveInstrument("BTC/USD"),
  start = Date.parse("2026-11-01T00:00:00Z");
function q(id: ProviderId, at: number): Observation {
  return {
    instrumentId: i.id,
    provider: id,
    providerSymbol: i.mappings[id]!,
    baseCurrency: i.base,
    quoteCurrency: i.quote,
    price: 100,
    change: null,
    volume: null,
    exchange: id,
    source: id,
    asOf: new Date(at).toISOString(),
    receivedAt: new Date(at).toISOString(),
    latencyMs: 1,
    timestampKind: "exchange",
    status: "realtime",
    transport: "rest",
    candles: [],
    exchangeTimezone: "UTC",
    session: "24/7",
  };
}
const p = (id: ProviderId, quote: Provider["quote"]): Provider => ({
  id,
  quote,
  health: async () => {},
});
test("runtime refresh has margin within the unchanged 60-second threshold", () => {
  const c = feedConfig({});
  assert.equal(c.pollMs, 15000);
  assert.equal(c.staleMs, 60000);
  assert.equal(c.dwellMs, 300000);
  assert.equal(c.recoverySuccesses, 3);
  assert.equal(c.recoveryProbeMs, 30000);
});
test("preferred recovery requires dwell and two separated validated probes, but stale incumbent fails over immediately", async () => {
  let now = start,
    offline = true;
  const e = new MarketEngine(
    [
      p("coinbase", async () => {
        if (offline) throw new FeedError("unavailable");
        return q("coinbase", now);
      }),
      p("kraken", async () => q("kraken", now)),
    ],
    {
      priority: ["coinbase", "kraken"],
      now: () => now,
      cacheMs: 1000,
      dwellMs: 120000,
      recoveryProbeMs: 30000,
      recoverySuccesses: 2,
      random: () => 0,
    },
  );
  assert.equal((await e.quote(i))?.provider, "kraken");
  offline = false;
  now += 15000;
  assert.equal((await e.quote(i))?.provider, "kraken");
  for (let j = 0; j < 7; j++) {
    now += 15000;
    assert.equal((await e.quote(i))?.provider, "kraken");
  }
  now += 30000;
  assert.equal((await e.quote(i))?.provider, "coinbase");
  assert.equal(e.switches[0].reason, "preferred-provider recovery confirmed");
  now += 61000;
  offline = true;
  assert.equal((await e.quote(i))?.provider, "kraken");
  assert.equal(e.switches.at(-1)?.reason, "incumbent stale; fresh alternative");
});
test("background candles reserve live request capacity without bypassing Retry-After", async () => {
  let now = start,
    calls = 0;
  const t = new Transport(
    async () => {
      calls++;
      return new Response("{}");
    },
    () => now,
    10,
  );
  for (let n = 0; n < 6; n++)
    await t.get("https://fixture.test/history/" + n, {}, 0, "background");
  await assert.rejects(
    t.get("https://fixture.test/history/7", {}, 0, "background"),
    /budget/,
  );
  for (let n = 0; n < 4; n++) await t.get("https://fixture.test/quote/" + n);
  assert.equal(calls, 10);
  assert.equal(t.backgroundDeferred, 1);
  now += 60000;
  await t.get("https://fixture.test/quote/new");
});
test("live-only adapter never waits for a hung history endpoint", async () => {
  const urls: string[] = [];
  const provider = new RestProvider(
    "coinbase",
    new Transport(
      async (url) => {
        urls.push(String(url));
        if (String(url).includes("candles"))
          throw new Error("history must not run");
        return new Response(
          JSON.stringify(
            String(url).endsWith("ticker")
              ? { price: "100", time: new Date(start).toISOString() }
              : { open: "99", volume: "5" },
          ),
        );
      },
      () => start,
      100,
    ),
    { inlineHistory: false },
    () => start,
  );
  assert.equal((await provider.quote(i)).price, 100);
  assert.equal(urls.length, 2);
});
test("history deduplicates, retains genuine gaps and attributes fallback without fetching another live quote", async () => {
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const candles = [0, 120000].map((offset) => ({
    time: new Date(start - 180000 + offset).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 2,
  }));
  const e = new MarketEngine(
    [
      {
        ...p("coinbase", async () => q("coinbase", start)),
        candles: async () => {
          throw new FeedError("budget");
        },
      },
      {
        ...p("kraken", async () => {
          throw new Error("live quote must not run");
        }),
        candles: async () => {
          loads++;
          await gate;
          return candles;
        },
      },
    ],
    { priority: ["coinbase", "kraken"], now: () => start },
  );
  await e.quote(i);
  const tasks = Array.from({ length: 25 }, () => e.history(i, "1m", true));
  release();
  const results = await Promise.all(tasks);
  assert.equal(loads, 1);
  assert.equal(results[0].provider, "kraken");
  assert.equal(results[0].exchange, "Kraken Spot");
  assert.equal(results[0].gaps[0].missingIntervals, 1);
  assert.equal(e.health().coinbase.state, "closed");
  assert.equal(e.health().coinbase.lastError, null);
});
test("thin-trade old source timestamp is never renewed with local receipt time", async () => {
  const now = start + 120000;
  const e = new MarketEngine(
    [
      p("coinbase", async () => ({
        ...q("coinbase", start),
        receivedAt: new Date(now).toISOString(),
      })),
    ],
    { priority: ["coinbase"], now: () => now },
  );
  assert.equal(await e.quote(i), null);
});
test("newer socket event wins a REST refresh race and keeps prior same-source candles", async () => {
  let now = start;
  const pair = resolveInstrument("BTC/USDT");
  let release!: (x: Observation) => void;
  const response = new Promise<Observation>((r) => (release = r));
  const e = new MarketEngine([p("binance", async () => response)], {
    priority: ["binance"],
    now: () => now,
  });
  const pending = e.quote(pair);
  now += 5;
  const tick = {
    ...q("binance", now),
    instrumentId: pair.id,
    providerSymbol: pair.mappings.binance!,
    baseCurrency: pair.base,
    quoteCurrency: pair.quote,
    transport: "websocket" as const,
    price: 105,
  };
  e.acceptStream(pair, tick);
  release({
    ...tick,
    price: 100,
    asOf: new Date(start).toISOString(),
    transport: "rest",
  });
  assert.equal((await pending)?.price, 105);
});

test("thin instrument freshness failures are local, do not poison provider circuits, and preserve original timestamps", async () => {
  let now = start;
  const e = new MarketEngine(
    [
      p("coinbase", async () => ({
        ...q("coinbase", now - 50000),
        receivedAt: new Date(now).toISOString(),
      })),
      p("kraken", async () => q("kraken", now)),
    ],
    {
      priority: ["coinbase", "kraken"],
      now: () => now,
      refreshMarginMs: 15000,
    },
  );
  assert.equal((await e.quote(i))?.provider, "kraken");
  assert.equal(e.health().coinbase.failures, 0);
  assert.equal(e.sourceWarnings.get("coinbase:" + i.id)?.ageMs, 50000);
});
test("worker heartbeat detects expired heartbeat and a replacement process without assuming matching uptime", async () => {
  const { workerHeartbeat } = await import("../lib/feeds/runtime-health");
  assert.equal(
    workerHeartbeat(
      {
        pid: 10,
        uptimeSeconds: 100,
        heartbeatAt: new Date(start).toISOString(),
      },
      start + 21000,
    ).healthy,
    false,
  );
  const replacement = workerHeartbeat(
    {
      pid: 11,
      uptimeSeconds: 1,
      heartbeatAt: new Date(start + 21000).toISOString(),
    },
    start + 22000,
  );
  assert.equal(replacement.healthy, true);
  assert.equal(replacement.pid, 11);
  assert.equal(
    workerHeartbeat({ pid: 11, uptimeSeconds: 1, heartbeatAt: "bad" }, start)
      .healthy,
    false,
  );
});

test("Windows heartbeat sharing failures retry within a bound and unrecoverable failures remain visible", async () => {
  const { replaceHeartbeat } = await import("../lib/worker-runtime");
  let calls = 0;
  const waits: number[] = [];
  await replaceHeartbeat(
    "source",
    "target",
    async () => {
      calls++;
      if (calls < 3)
        throw Object.assign(new Error("sharing"), { code: "EPERM" });
    },
    async (ms) => {
      waits.push(ms);
    },
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [50, 100]);
  calls = 0;
  await assert.rejects(
    replaceHeartbeat(
      "source",
      "target",
      async () => {
        calls++;
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      async () => {},
    ),
    /missing/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    replaceHeartbeat(
      "source",
      "target",
      async () => {
        calls++;
        throw Object.assign(new Error("locked"), { code: "EBUSY" });
      },
      async () => {},
    ),
    /locked/,
  );
  assert.equal(calls, 4);
});
test("worker job failure remains unhealthy even when process heartbeats are fresh", async () => {
  const { workerHeartbeat } = await import("../lib/feeds/runtime-health");
  assert.equal(
    workerHeartbeat(
      {
        pid: 20,
        uptimeSeconds: 5,
        heartbeatAt: new Date(start).toISOString(),
        tickHealthy: false,
      },
      start,
    ).healthy,
    false,
  );
});

test("headroom refresh misses retain a valid incumbent and stale fallback cannot count as confirmed recovery", async () => {
  let now = start,
    mode = 0;
  const e = new MarketEngine(
    [
      p("coinbase", async () => {
        if (mode === 0) throw new FeedError("unavailable");
        return q("coinbase", now - 50000);
      }),
      p("kraken", async () => {
        if (mode === 2) throw new FeedError("unavailable");
        return q("kraken", now);
      }),
    ],
    {
      priority: ["coinbase", "kraken"],
      now: () => now,
      cacheMs: 1000,
      dwellMs: 300000,
      refreshMarginMs: 15000,
      recoverySuccesses: 3,
    },
  );
  assert.equal((await e.quote(i))?.provider, "kraken");
  mode = 2;
  now += 50000;
  const retained = await e.quote(i);
  assert.equal(retained?.provider, "kraken");
  assert.equal(retained?.status, "realtime");
  assert.equal(e.switches.length, 0);
  now += 70000;
  const stale = await e.quote(i);
  assert.equal(stale?.provider, "kraken");
  assert.equal(stale?.status, "stale");
  assert.equal(e.switches.length, 0);
});

test("disabled providers cannot escape through stale incumbent retention", async () => {
  const e = new MarketEngine(
    [p("coinbase", async () => q("coinbase", start))],
    { priority: ["coinbase"], now: () => start },
  );
  assert.ok(await e.quote(i));
  e.setEnabled("coinbase", false);
  assert.equal(await e.quote(i), null);
  assert.equal(e.cachedSnapshot([i]).length, 0);
});
