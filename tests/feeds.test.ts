import { test } from "node:test";
import assert from "node:assert/strict";
import {
  instruments,
  resolveInstrument,
  FeedError,
  validate,
  finite,
  type Instrument,
  type Observation,
  type Provider,
  type ProviderId,
} from "../lib/feeds/types";
import { RestProvider, parseBinanceTicker } from "../lib/feeds/providers";
import { Transport } from "../lib/feeds/transport";
import { MarketEngine } from "../lib/feeds/engine";
import { BinanceStream, type SocketLike } from "../lib/feeds/binance-stream";
import { feedConfig } from "../lib/feeds/config";
import { mergeObservations, observationQuote, demoQuotes } from "../lib/market";
import { comparison } from "../lib/analytics";
const stamp = Date.parse("2026-11-01T00:00:00Z");
const usd = resolveInstrument("BTC/USD"),
  usdt = resolveInstrument("BTC/USDT");
function observation(
  i: Instrument = usd,
  provider: ProviderId = "coinbase",
  now = stamp,
  price = 100,
): Observation {
  return {
    instrumentId: i.id,
    baseCurrency: i.base,
    quoteCurrency: i.quote,
    provider,
    providerSymbol: i.mappings[provider]!,
    price,
    change: 1,
    volume: 10,
    exchange: provider,
    source: provider,
    asOf: new Date(now).toISOString(),
    receivedAt: new Date(now).toISOString(),
    latencyMs: 5,
    timestampKind: "exchange",
    status: "realtime",
    transport: "rest",
    candles: [],
    exchangeTimezone: "UTC",
    session: "24/7",
  };
}
const response = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });
function provider(id: ProviderId, quote: Provider["quote"]): Provider {
  return { id, quote, health: async () => {} };
}
const ticker = {
  symbol: "BTCUSDT",
  lastPrice: "101",
  priceChangePercent: "1",
  volume: "20",
  closeTime: stamp,
};

test("canonical USD and USDT pairs have explicit, separate provider mappings", () => {
  assert.notEqual(usd.id, usdt.id);
  assert.equal(usd.mappings.binance, undefined);
  assert.equal(usdt.mappings.binance, "BTCUSDT");
  assert.equal(usd.mappings.kraken, "XXBTZUSD");
  assert.equal(usd.mappings.coinbase, "BTC-USD");
  assert.throws(() => resolveInstrument("BTCCASH"));
});
test("Binance REST normalization keeps exchange, currency, timestamps and latency", () => {
  const q = parseBinanceTicker(ticker, usdt, stamp + 30, "rest", 30);
  assert.equal(q.price, 101);
  assert.equal(q.quoteCurrency, "USDT");
  assert.equal(q.exchange, "Binance Spot");
  assert.equal(q.latencyMs, 30);
  assert.equal(q.asOf, new Date(stamp).toISOString());
});
test("malformed numeric data, wrong symbols, future dates and bad candles are rejected", () => {
  for (const value of [null, true, "", " ", "NaN", Infinity])
    assert.throws(() => finite(value));
  assert.throws(() =>
    parseBinanceTicker(
      { ...ticker, symbol: "ETHUSDT", s: "BTCUSDT" },
      usdt,
      stamp,
    ),
  );
  assert.throws(() =>
    parseBinanceTicker({ ...ticker, lastPrice: "-1" }, usdt, stamp),
  );
  assert.throws(() =>
    validate(
      { ...observation(), asOf: new Date(stamp + 60000).toISOString() },
      usd,
      "coinbase",
      stamp,
    ),
  );
  assert.throws(() =>
    validate(
      { ...observation(), quoteCurrency: "USDT" },
      usd,
      "coinbase",
      stamp,
    ),
  );
  assert.throws(() =>
    validate(
      {
        ...observation(),
        candles: [
          {
            time: new Date(stamp).toISOString(),
            open: 10,
            high: 9,
            low: 8,
            close: 10,
            volume: 1,
          },
        ],
      },
      usd,
      "coinbase",
      stamp,
    ),
  );
});
test("Coinbase adapter binds product URL and keeps actual trade timestamp", async () => {
  const urls: string[] = [];
  const p = new RestProvider(
    "coinbase",
    new Transport(
      async (input) => {
        const u = String(input);
        urls.push(u);
        return response(
          u.endsWith("ticker")
            ? { price: "102", time: new Date(stamp).toISOString() }
            : u.endsWith("stats")
              ? { open: "100", volume: "30" }
              : [[stamp / 1000 - 7200, 98, 102, 99, 100, 20]],
        );
      },
      () => stamp,
    ),
    {},
    () => stamp,
  );
  const q = await p.quote(usd);
  assert.equal(q.price, 102);
  assert.ok(Math.abs(q.change! - 2) < 1e-10);
  assert.ok(urls.every((u) => u.includes("/products/BTC-USD/")));
  assert.equal(q.candles[0].close, 100);
  assert.equal(q.timestampKind, "exchange");
});
test("Kraken uses XBT aliases, rejects unexpected response keys and identifies receipt time", async () => {
  const p = new RestProvider(
    "kraken",
    new Transport(
      async (input) =>
        response(
          String(input).includes("OHLC")
            ? {
                error: [],
                result: {
                  XXBTZUSD: [
                    [
                      stamp / 1000 - 7200,
                      "99",
                      "102",
                      "98",
                      "100",
                      "100",
                      "10",
                      4,
                    ],
                    [stamp / 1000, "100", "102", "99", "101", "100", "10", 4],
                  ],
                  last: 1,
                },
              }
            : {
                error: [],
                result: { XXBTZUSD: { c: ["101"], v: ["10", "20"], o: "100" } },
              },
        ),
      () => stamp,
    ),
    {},
    () => stamp,
  );
  const q = await p.quote(usd);
  assert.equal(q.timestampKind, "receipt");
  assert.equal(q.change, null);
  assert.equal(q.candles.length, 1);
  const wrong = new RestProvider(
    "kraken",
    new Transport(
      async () => response({ error: [], result: { XETHZUSD: { c: ["1"] } } }),
      () => stamp,
    ),
    {},
    () => stamp,
  );
  await assert.rejects(() => wrong.quote(usd), /symbol/);
});
test("CoinGecko is explicitly aggregated/delayed and never manufactures OHLCV", async () => {
  const p = new RestProvider(
    "coingecko",
    new Transport(
      async () =>
        response({
          bitcoin: {
            usd: 100,
            usd_24h_change: 2,
            last_updated_at: stamp / 1000,
          },
        }),
      () => stamp,
    ),
    {},
    () => stamp,
  );
  const q = await p.quote(usd);
  assert.equal(q.status, "delayed");
  assert.match(q.exchange, /aggregate/);
  assert.equal(q.candles.length, 0);
  assert.equal(q.volume, null);
  assert.equal(q.quoteCurrency, "USD");
});
test("Twelve Data validates symbol/currency and does not presume realtime entitlements", async () => {
  const i = resolveInstrument("EURUSD");
  const urls: string[] = [];
  const p = new RestProvider(
    "twelvedata",
    new Transport(
      async (input) => {
        urls.push(String(input));
        return response(
          String(input).includes("/quote")
            ? {
                symbol: "EUR/USD",
                currency: "USD",
                close: "1.1",
                timestamp: stamp / 1000,
                percent_change: "1",
                exchange: "Forex",
                is_market_open: true,
              }
            : { meta: { symbol: "EUR/USD" }, values: [] },
        );
      },
      () => stamp,
    ),
    { twelveDataKey: "test-key" },
    () => stamp,
  );
  const q = await p.quote(i);
  assert.equal(q.status, "delayed");
  assert.equal(q.session, "open");
  assert.equal(q.quoteCurrency, "USD");
  assert.ok(urls[0].includes("EUR%2FUSD"));
  const wrong = new RestProvider(
    "twelvedata",
    new Transport(
      async () => response({ symbol: "GBP/USD", close: "1.2" }),
      () => stamp,
    ),
    { twelveDataKey: "test" },
    () => stamp,
  );
  await assert.rejects(() => wrong.quote(i), /symbol/);
});
test("HTTP requests deduplicate and shared cache avoids subscriber amplification", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const t = new Transport(
    async () => {
      calls++;
      await gate;
      return response({ price: 1 });
    },
    () => stamp,
  );
  const a = t.get("https://example.test/quote", {}, 10000),
    b = t.get("https://example.test/quote", {}, 10000);
  release();
  await Promise.all([a, b]);
  await t.get("https://example.test/quote");
  assert.equal(calls, 1);
});
test("429 Retry-After seconds and dates block all provider requests until recovery", async () => {
  for (const retry of ["120", new Date(stamp + 120000).toUTCString()]) {
    let now = stamp,
      calls = 0;
    const t = new Transport(
      async () => {
        calls++;
        return calls === 1
          ? response({}, 429, { "retry-after": retry })
          : response({ ok: true });
      },
      () => now,
    );
    await assert.rejects(
      () => t.get("https://example.test/a"),
      (e) => e instanceof FeedError && e.retryMs === 120000,
    );
    await assert.rejects(() => t.get("https://example.test/b"), /rate-limit/);
    assert.equal(calls, 1);
    now += 120001;
    await t.get("https://example.test/b");
    assert.equal(calls, 2);
  }
});
test("exchange bans, body-level quota errors and local budgets fail closed", async () => {
  for (const [body, status] of [
    [{}, 418],
    [{ code: 429 }, 200],
    [{ error: ["EAPI:Rate limit exceeded"] }, 200],
  ] as const) {
    const t = new Transport(
      async () => response(body, status),
      () => stamp,
    );
    await assert.rejects(() => t.get("https://example.test/a"), /rate-limit/);
  }
  let now = stamp;
  const t = new Transport(
    async () => response({ ok: true }),
    () => now,
    1,
  );
  await t.get("https://example.test/a");
  await assert.rejects(() => t.get("https://example.test/b"), /budget/);
  now += 60000;
  await t.get("https://example.test/b");
});
test("malformed JSON, timeout/network errors and provider 5xx are contained", async () => {
  for (const fetcher of [
    async () => new Response("not json"),
    async () => {
      throw new Error("network secret");
    },
    async () => response({}, 503),
  ]) {
    const t = new Transport(fetcher, () => stamp);
    await assert.rejects(() => t.get("https://example.test"), /unavailable/);
    assert.equal(t.failures, 1);
  }
});
test("preferred outage fails over without averaging and recovers after cooldown", async () => {
  let now = stamp,
    offline = true,
    preferredCalls = 0;
  const e = new MarketEngine(
    [
      provider("coinbase", async () => {
        preferredCalls++;
        if (offline) throw new Error("outage");
        return observation(usd, "coinbase", now, 101);
      }),
      provider("kraken", async () => observation(usd, "kraken", now, 99)),
    ],
    {
      priority: ["coinbase", "kraken"],
      now: () => now,
      random: () => 0,
      cacheMs: 100,
      breakerThreshold: 1,
    },
  );
  let q = await e.quote(usd);
  assert.equal(q?.price, 99);
  assert.equal(q?.provider, "kraken");
  assert.equal(e.health().coinbase.state, "open");
  now += 500;
  offline = false;
  assert.equal((await e.quote(usd))?.provider, "kraken");
  assert.equal(preferredCalls, 1);
  now += 600;
  q = await e.quote(usd);
  assert.equal(q?.price, 101);
  assert.equal(q?.provider, "coinbase");
  assert.equal(e.health().coinbase.state, "closed");
});
test("breaker backoff grows exponentially and Retry-After overrides short cooldowns", async () => {
  let now = stamp;
  const e = new MarketEngine(
    [
      provider("coinbase", async () => {
        throw new FeedError("unavailable");
      }),
    ],
    {
      priority: ["coinbase"],
      now: () => now,
      random: () => 0,
      breakerThreshold: 2,
    },
  );
  await e.quote(usd);
  assert.equal(e.health().coinbase.retryAt, now + 1000);
  now += 1001;
  await e.quote(usd);
  assert.equal(e.health().coinbase.retryAt, now + 2000);
  assert.equal(e.health().coinbase.state, "open");
});
test("invalid normalized identity never enters cache or escapes through failover", async () => {
  const e = new MarketEngine(
    [
      provider("coinbase", async () => ({
        ...observation(),
        quoteCurrency: "USDT",
      })),
      provider("kraken", async () => observation(usd, "kraken")),
    ],
    { priority: ["coinbase", "kraken"], now: () => stamp },
  );
  assert.equal((await e.quote(usd))?.provider, "kraken");
  assert.equal(e.health().coinbase.lastError, "symbol");
});
test("concurrent subscribers get one upstream quote request per instrument", async () => {
  let calls = 0;
  const e = new MarketEngine(
    [
      provider("coinbase", async () => {
        calls++;
        return observation();
      }),
    ],
    { priority: ["coinbase"], now: () => stamp },
  );
  const results = await Promise.all(
    Array.from({ length: 100 }, () => e.quote(usd)),
  );
  assert.equal(calls, 1);
  assert.equal(results.length, 100);
});
test("total outage returns original last-known source/time with stale warning", async () => {
  let now = stamp,
    offline = false;
  const e = new MarketEngine(
    [
      provider("coinbase", async () => {
        if (offline) throw new Error();
        return observation();
      }),
    ],
    { priority: ["coinbase"], now: () => now, cacheMs: 10, staleMs: 100 },
  );
  await e.quote(usd);
  now += 1000;
  offline = true;
  const q = await e.quote(usd);
  assert.equal(q?.status, "stale");
  assert.equal(q?.asOf, new Date(stamp).toISOString());
  assert.equal(q?.provider, "coinbase");
  assert.match(q!.warning!, /not a live/);
});
test("old quotes cannot close a circuit and first-time total failure has no fake price", async () => {
  const e = new MarketEngine(
    [
      provider("coinbase", async () =>
        observation(usd, "coinbase", stamp - 100000),
      ),
    ],
    { priority: ["coinbase"], now: () => stamp },
  );
  assert.equal(await e.quote(usd), null);
  assert.equal(e.health().coinbase.lastSuccess, null);
});
test("stream updates retain only same-provider candles and REST priority remains explicit", async () => {
  const original = observation(usdt, "binance");
  original.candles = [
    {
      time: new Date(stamp - 3600000).toISOString(),
      open: 99,
      high: 101,
      low: 98,
      close: 100,
      volume: 5,
    },
  ];
  const e = new MarketEngine(
    [
      provider("binance", async () => original),
      provider("coinbase", async () =>
        observation(usdt, "coinbase", stamp, 110),
      ),
    ],
    { priority: ["coinbase", "binance"], now: () => stamp },
  );
  e.acceptStream(usdt, { ...original, transport: "websocket", price: 90 });
  assert.equal((await e.quote(usdt))?.provider, "coinbase");
});
test("stream disconnect invalidates cache so polling recovers without altering original timestamp", async () => {
  let calls = 0;
  const e = new MarketEngine(
    [
      provider("binance", async () => {
        calls++;
        return observation(usdt, "binance", stamp, 105);
      }),
    ],
    { priority: ["binance"], now: () => stamp },
  );
  e.acceptStream(usdt, {
    ...observation(usdt, "binance"),
    transport: "websocket",
  });
  assert.equal((await e.quote(usdt))?.price, 100);
  e.acceptStream(usdt, {
    ...observation(usdt, "binance"),
    transport: "websocket",
  });
  e.disconnect("binance");
  assert.equal((await e.quote(usdt))?.price, 105);
  assert.equal(calls, 1);
});
class FakeSocket implements SocketLike {
  events = new Map<string, ((event: any) => void)[]>();
  closed = false;
  addEventListener(t: string, l: (event: any) => void) {
    this.events.set(t, [...(this.events.get(t) || []), l]);
  }
  emit(t: string, e: any = {}) {
    for (const l of this.events.get(t) || []) l(e);
  }
  close() {
    this.closed = true;
  }
}
const message = {
  stream: "btcusdt@ticker",
  data: { e: "24hrTicker", s: "BTCUSDT", c: "101", P: "1", v: "20", E: stamp },
};
test("one combined Binance socket serves a fixed instrument set, validates and disconnects safely", () => {
  const sockets: FakeSocket[] = [];
  let calls = 0,
    disconnects = 0,
    url = "";
  const stream = new BinanceStream(
    [usdt],
    () => calls++,
    () => disconnects++,
    (u) => {
      url = u;
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    () => stamp,
    () => 0,
  );
  stream.start();
  stream.start();
  assert.equal(sockets.length, 1);
  assert.match(
    url,
    /^wss:\/\/data-stream.binance.vision\/stream\?streams=btcusdt@ticker$/,
  );
  sockets[0].emit("open");
  sockets[0].emit("message", { data: JSON.stringify(message) });
  assert.equal(calls, 1);
  assert.equal(stream.state, "connected");
  sockets[0].emit("close");
  assert.equal(disconnects, 1);
  assert.equal(stream.state, "backoff");
  stream.stop();
  assert.equal(sockets[0].closed, true);
});
test("malformed, cross-symbol and stale stream messages force reconnect, never become quotes", () => {
  for (const data of [
    "bad json",
    JSON.stringify({ ...message, data: { ...message.data, s: "ETHUSDT" } }),
    JSON.stringify({
      ...message,
      data: { ...message.data, E: stamp - 120000 },
    }),
  ]) {
    const socket = new FakeSocket();
    let quotes = 0,
      disconnects = 0;
    const stream = new BinanceStream(
      [usdt],
      () => quotes++,
      () => disconnects++,
      () => socket,
      () => stamp,
      () => 0,
    );
    stream.start();
    socket.emit("message", { data });
    assert.equal(quotes, 0);
    assert.equal(disconnects, 1);
    assert.equal(stream.state, "backoff");
    stream.stop();
  }
});
test("socket recovery opens one replacement connection after backoff", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const stream = new BinanceStream(
    [usdt],
    () => {},
    () => {},
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    () => stamp,
    () => 0,
  );
  stream.start();
  sockets[0].emit("error");
  t.mock.timers.tick(999);
  assert.equal(sockets.length, 1);
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 2);
  stream.stop();
  t.mock.timers.reset();
});
test("commercial display/cache/stream/export permissions fail closed; local scope is loopback only", () => {
  assert.throws(() =>
    feedConfig({
      APP_URL: "https://public.example",
      MARKET_DATA_SCOPE: "local",
    }),
  );
  const denied = feedConfig({ MARKET_DATA_SCOPE: "commercial" });
  assert.equal(denied.priority.length, 0);
  assert.equal(denied.allowed("binance", "export"), false);
  const allowed = feedConfig({
    MARKET_DATA_SCOPE: "commercial",
    MARKET_PROVIDER_RIGHTS: JSON.stringify({
      coinbase: {
        display: true,
        cache: true,
        redistribution: true,
        reference: "contract reference number",
        verifiedAt: "2026-10-01",
      },
    }),
  });
  assert.deepEqual(allowed.priority, ["coinbase"]);
  assert.equal(allowed.allowed("coinbase", "stream"), false);
  assert.equal(allowed.allowed("coinbase", "export"), false);
  assert.throws(() =>
    feedConfig({ MARKET_PROVIDER_PRIORITY: "binance,unknown" }),
  );
  assert.throws(() => feedConfig({ MARKET_POLL_MS: "0" }));
});
test("live observations never inherit synthetic history or synthetic fallback prices", () => {
  const q = observation(usd, "coinbase", Date.now());
  const mapped = observationQuote(q);
  assert.equal(mapped.history.length, 0);
  assert.equal(mapped.sma, null);
  assert.equal(mapped.rsi, null);
  assert.equal(mapped.volatility, null);
  assert.equal(mapped.volumeRatio, null);
  const merged = mergeObservations([q]);
  assert.equal(
    merged.quotes.find((q) => q.symbol === "BTC")?.status,
    "realtime",
  );
  assert.equal(
    merged.quotes.find((q) => q.symbol === "AAPL")?.status,
    undefined,
  );
  assert.equal(merged.error, null);
  assert.equal(mergeObservations([]).quotes.length, 0);
});
test("USD and USDT results coexist without replacing or blending each other", () => {
  const merged = mergeObservations([
    observation(usd, "coinbase", Date.now(), 100),
    observation(usdt, "binance", Date.now(), 101),
  ]);
  assert.equal(merged.quotes.find((q) => q.symbol === "BTC")?.price, 100);
  assert.equal(merged.quotes.find((q) => q.symbol === "BTCUSDT")?.price, 101);
});
test("comparisons intersect real timestamps instead of aligning unrelated samples by index", () => {
  const [a, b] = demoQuotes();
  b.history = b.history.slice(2);
  const result = comparison(a, b);
  assert.equal(result.series.length, b.history.length);
  assert.equal(result.series[0].time, b.history[0].time);
  assert.equal(result.series[0][a.symbol], 0);
  assert.equal(result.series[0][b.symbol], 0);
});

test("unsupported products do not open a circuit for other pairs", async () => {
  const e = new MarketEngine(
    [
      provider("coinbase", async (i) => {
        if (i.quote === "USDT") throw new FeedError("unsupported");
        return observation(i, "coinbase");
      }),
      provider("kraken", async (i) => observation(i, "kraken")),
    ],
    { priority: ["coinbase", "kraken"], now: () => stamp },
  );
  assert.equal((await e.quote(usdt))?.provider, "kraken");
  assert.equal(e.health().coinbase.failures, 0);
  assert.equal((await e.quote(usd))?.provider, "coinbase");
});
test("successful health ping cannot prematurely close an open quote circuit", async () => {
  let now = stamp,
    offline = true,
    pings = 0;
  const p = provider("coinbase", async () => {
    if (offline) throw new FeedError("unavailable");
    return observation(usd, "coinbase", now);
  });
  p.health = async () => {
    pings++;
  };
  const e = new MarketEngine([p], {
    priority: ["coinbase"],
    now: () => now,
    breakerThreshold: 1,
    random: () => 0,
  });
  await e.quote(usd);
  await e.probe();
  assert.equal(pings, 0);
  now += 1001;
  await e.probe();
  assert.equal(pings, 1);
  assert.equal(e.health().coinbase.state, "open");
  offline = false;
  await e.quote(usd);
  assert.equal(e.health().coinbase.state, "closed");
});
test("socket hydration retains fresh streamed prices and same-source candle history", async () => {
  let now = stamp;
  const row = observation(usdt, "binance", now, 95);
  row.candles = [
    {
      time: new Date(stamp - 3600000).toISOString(),
      open: 90,
      high: 99,
      low: 89,
      close: 95,
      volume: 1,
    },
  ];
  const e = new MarketEngine(
    [
      {
        ...provider("binance", async () => row),
        candles: async () => row.candles,
      },
    ],
    {
      priority: ["binance"],
      now: () => now,
    },
  );
  e.acceptStream(usdt, {
    ...observation(usdt, "binance", stamp + 1, 100),
    transport: "websocket",
  });
  now++;
  assert.equal((await e.quote(usdt))?.candles.length, 0);
  await e.history(usdt, "1h", true);
  const hydrated = await e.quote(usdt);
  assert.equal(hydrated?.price, 100);
  assert.equal(hydrated?.candles.length, 1);
  assert.equal(hydrated?.provider, "binance");
  e.acceptStream(usdt, {
    ...observation(usdt, "binance", stamp + 2, 101),
    transport: "websocket",
  });
  now++;
  const latest = await e.quote(usdt);
  assert.equal(latest?.price, 101);
  assert.equal(latest?.candles[0].close, 95);
});

test("duplicate socket close/error events and brief successful reconnects cannot create a reconnect storm", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const stream = new BinanceStream(
    [usdt],
    () => {},
    () => {},
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    () => stamp,
    () => 0,
  );
  stream.start();
  sockets[0].emit("error");
  sockets[0].emit("close");
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  sockets[1].emit("open");
  sockets[1].emit("message", { data: JSON.stringify(message) });
  sockets[1].emit("close");
  sockets[1].emit("error");
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 3);
  assert.equal(stream.metrics.disconnects, 2);
  stream.stop();
  t.mock.timers.tick(60000);
  assert.equal(sockets.length, 3);
  t.mock.timers.reset();
});
