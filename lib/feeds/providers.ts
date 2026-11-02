import { exchangeSchedule } from "./schedule";
import { Transport } from "./transport";
import {
  FeedError,
  finite,
  iso,
  validate,
  type Candle,
  type Instrument,
  type Observation,
  type Provider,
  type ProviderId,
  type Timeframe,
  timeframes,
} from "./types";
export type Credentials = {
  coingeckoKey?: string;
  twelveDataKey?: string;
  scheduleEnabled?: boolean;
  inlineHistory?: boolean;
};
const roots = {
  binance: "https://data-api.binance.vision",
  coinbase: "https://api.exchange.coinbase.com",
  kraken: "https://api.kraken.com",
  coingecko: "https://api.coingecko.com/api/v3",
  twelvedata: "https://api.twelvedata.com",
};
const percent = (price: number, open: unknown) =>
  (price / finite(open, true) - 1) * 100;
export function parseBinanceTicker(
  d: any,
  i: Instrument,
  received = Date.now(),
  transport: "rest" | "websocket" = "rest",
  latencyMs = 0,
): Observation {
  if ((transport === "rest" ? d?.symbol : d?.s) !== i.mappings.binance)
    throw new FeedError("symbol");
  return validate(
    {
      instrumentId: i.id,
      provider: "binance",
      providerSymbol: i.mappings.binance!,
      exchange: "Binance Spot",
      source: "Binance Spot",
      baseCurrency: i.base,
      quoteCurrency: i.quote,
      price: finite(transport === "rest" ? d.lastPrice : d.c, true),
      change: finite(transport === "rest" ? d.priceChangePercent : d.P),
      volume: finite(transport === "rest" ? d.volume : d.v),
      asOf: iso(transport === "rest" ? d.closeTime : d.E),
      receivedAt: iso(received),
      latencyMs,
      timestampKind: "exchange",
      status: "realtime",
      transport,
      candles: [],
      exchangeTimezone: "UTC",
      session: "24/7",
    },
    i,
    "binance",
    received,
  );
}
export class RestProvider implements Provider {
  constructor(
    public id: ProviderId,
    public transport = new Transport(),
    private keys: Credentials = {},
    private now = Date.now,
  ) {}
  async supports(i: Instrument): Promise<boolean> {
    const symbol = i.mappings[this.id];
    if (!symbol) return false;
    if (this.id === "binance") {
      const d = await this.transport.get(
        roots.binance + "/api/v3/exchangeInfo",
        {},
        600000,
      );
      if (!Array.isArray(d.symbols)) throw new FeedError("malformed");
      return d.symbols.some(
        (s: any) =>
          s.symbol === symbol &&
          s.baseAsset === i.base &&
          s.quoteAsset === i.quote &&
          s.status === "TRADING",
      );
    }
    if (this.id === "coinbase") {
      const d = await this.transport.get(
        roots.coinbase + "/products",
        {},
        600000,
      );
      if (!Array.isArray(d)) throw new FeedError("malformed");
      return d.some(
        (s: any) =>
          s.id === symbol &&
          s.base_currency === i.base &&
          s.quote_currency === i.quote &&
          s.status === "online" &&
          !s.trading_disabled,
      );
    }
    if (this.id === "kraken") {
      const d = await this.transport.get(
        roots.kraken + "/0/public/AssetPairs",
        {},
        600000,
      );
      if (d.error?.length || !d.result) throw new FeedError("unavailable");
      const p =
        d.result[symbol] ||
        (Object.values(d.result).find((p: any) => p.altname === symbol) as any);
      if (!p) return false;
      const [base, quote] = String(p.wsname).split("/");
      return (
        (base === i.base ||
          (i.base === "BTC" && base === "XBT") ||
          (i.base === "DOGE" && base === "XDG")) &&
        quote === i.quote &&
        (!p.status || p.status === "online")
      );
    }
    return this.id !== "twelvedata" || !!this.keys.twelveDataKey;
  }
  async health() {
    const paths: Record<ProviderId, string> = {
      binance: "/api/v3/ping",
      coinbase: "/time",
      kraken: "/0/public/SystemStatus",
      coingecko: "/ping",
      twelvedata: "/api_usage",
    };
    const path =
      paths[this.id] +
      (this.id === "twelvedata"
        ? `?apikey=${encodeURIComponent(this.keys.twelveDataKey || "")}`
        : "");
    const d = await this.transport.get(
      roots[this.id] + path,
      this.headers(),
      5000,
    );
    if (
      this.id === "kraken" &&
      (d.error?.length || d.result?.status !== "online")
    )
      throw new FeedError("unavailable");
    if (d?.status === "error") throw new FeedError("unavailable");
    if (!d || typeof d !== "object" || Array.isArray(d))
      throw new FeedError("malformed");
    if (this.id === "coinbase") finite(d.epoch, true);
    if (this.id === "coingecko" && typeof d.gecko_says !== "string")
      throw new FeedError("malformed");
    if (this.id === "twelvedata" && !Number.isFinite(Number(d.current_usage)))
      throw new FeedError("malformed");
  }
  private headers(): Record<string, string> {
    return this.id === "coingecko" && this.keys.coingeckoKey
      ? { "x-cg-demo-api-key": this.keys.coingeckoKey }
      : {};
  }
  async quote(i: Instrument): Promise<Observation> {
    const s = i.mappings[this.id];
    if (!s) throw new FeedError("unsupported");
    if (this.id === "twelvedata" && !this.keys.twelveDataKey)
      throw new FeedError("unavailable");
    const start = this.now();
    let q: Observation;
    if (this.id === "binance") {
      const d = await this.transport.get(
        `${roots.binance}/api/v3/ticker/24hr?symbol=${encodeURIComponent(s)}`,
      );
      q = parseBinanceTicker(d, i, this.now(), "rest", this.now() - start);
    } else if (this.id === "coinbase") {
      const d = await this.transport.get(
        `${roots.coinbase}/products/${encodeURIComponent(s)}/ticker`,
      );
      const stats = await this.transport.get(
        `${roots.coinbase}/products/${encodeURIComponent(s)}/stats`,
        {},
        60000,
      );
      const price = finite(d?.price, true);
      q = this.base(
        i,
        s,
        "Coinbase Exchange",
        price,
        iso(d?.time),
        percent(price, stats?.open),
        finite(stats?.volume),
        start,
      );
    } else if (this.id === "kraken") {
      const d = await this.transport.get(
        `${roots.kraken}/0/public/Ticker?pair=${encodeURIComponent(s)}`,
      );
      if (d?.error?.length) throw new FeedError("unavailable");
      const row = d?.result?.[s];
      if (!row || Object.keys(d.result).length !== 1)
        throw new FeedError("symbol");
      // Ticker has no timestamp; report receipt time explicitly, never invent an exchange time.
      q = this.base(
        i,
        s,
        "Kraken Spot",
        finite(row.c?.[0], true),
        iso(this.now()),
        null,
        finite(row.v?.[1]),
        start,
      );
      q.timestampKind = "receipt";
      q.warning =
        "Kraken ticker timestamp is local receipt time; comparable 24h change is unavailable.";
    } else if (this.id === "coingecko") {
      const currency = i.quote.toLowerCase();
      const d = await this.transport.get(
        `${roots.coingecko}/simple/price?ids=${s}&vs_currencies=${currency}&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`,
        this.headers(),
      );
      const row = d?.[s];
      if (!row) throw new FeedError("symbol");
      q = this.base(
        i,
        s,
        "CoinGecko aggregate (not an exchange)",
        finite(row[currency], true),
        iso(finite(row.last_updated_at, true) * 1000),
        row[`${currency}_24h_change`] == null
          ? null
          : finite(row[`${currency}_24h_change`]),
        null,
        start,
      );
      q.status = "delayed";
      q.warning =
        "CoinGecko is a disclosed aggregate; volume is not comparable to exchange base volume.";
    } else {
      const d = await this.transport.get(
        `${roots.twelvedata}/quote?symbol=${encodeURIComponent(s)}${i.venue ? "&exchange=" + encodeURIComponent(i.venue) : ""}&apikey=${encodeURIComponent(this.keys.twelveDataKey!)}&timezone=UTC`,
      );
      if (d?.status === "error") throw new FeedError("unavailable");
      if (
        d?.symbol !== s ||
        (d.currency && d.currency !== i.quote) ||
        (i.venue && d.exchange !== i.venue)
      )
        throw new FeedError("symbol");
      q = this.base(
        i,
        s,
        typeof d.exchange === "string" && d.exchange
          ? d.exchange
          : "Twelve Data",
        finite(d.close, true),
        iso(finite(d.timestamp, true) * 1000),
        d.percent_change == null ? null : finite(d.percent_change),
        d.volume == null ? null : finite(d.volume),
        start,
      );
      q.bid = d.bid == null ? null : finite(d.bid, true);
      q.ask = d.ask == null ? null : finite(d.ask, true);
      q.status = "delayed"; // Entitlements/delays differ per exchange and plan. Never infer realtime access.
      q.exchangeTimezone =
        typeof d.exchange_timezone === "string" ? d.exchange_timezone : "UTC";
      q.session =
        d.is_market_open === true
          ? "open"
          : d.is_market_open === false
            ? "closed"
            : "unknown";
    }
    try {
      if (this.keys.inlineHistory !== false) q.candles = await this.candles(i);
    } catch {
      q.warning = [
        q.warning,
        "Historical candles unavailable; indicators require sufficient same-source history.",
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (this.id === "twelvedata" && this.keys.scheduleEnabled && i.venue) {
      try {
        q.calendar = await exchangeSchedule(
          i,
          new Date(this.now()),
          this.keys.twelveDataKey!,
          this.transport,
        );
      } catch {
        q.warning = [
          q.warning,
          "Exchange-specific calendar unavailable; session remains provider-reported/unknown.",
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    q.unit = i.unit;
    q.kind = i.kind;
    q.venue = i.venue;
    q.latencyMs = this.now() - start;
    return validate(q, i, this.id, this.now());
  }
  private base(
    i: Instrument,
    s: string,
    exchange: string,
    price: number,
    asOf: string,
    change: number | null,
    volume: number | null,
    start: number,
  ): Observation {
    return {
      instrumentId: i.id,
      provider: this.id,
      providerSymbol: s,
      baseCurrency: i.base,
      quoteCurrency: i.quote,
      exchange,
      source: exchange,
      price,
      asOf,
      change,
      volume,
      receivedAt: iso(this.now()),
      latencyMs: this.now() - start,
      timestampKind: "exchange",
      status: "realtime",
      transport: "rest",
      candles: [],
      exchangeTimezone: "UTC",
      session: i.category === "Crypto" ? "24/7" : "unknown",
    };
  }
  async candles(i: Instrument, timeframe: Timeframe = "1h"): Promise<Candle[]> {
    const seconds = timeframes[timeframe];
    if (!seconds) throw new FeedError("unsupported");
    const s = i.mappings[this.id];
    if (!s) throw new FeedError("unsupported");
    let rows: Candle[] = [];
    if (this.id === "binance") {
      const d = await this.transport.get(
        `${roots.binance}/api/v3/klines?symbol=${s}&interval=${timeframe}&limit=300`,
        {},
        60000,
        "background",
      );
      if (!Array.isArray(d)) throw new FeedError("malformed");
      rows = d
        .filter((r) => finite(r[6]) < this.now())
        .map((r) => this.candle(r[0], r[1], r[2], r[3], r[4], r[5]));
    } else if (this.id === "coinbase") {
      const d = await this.transport.get(
        `${roots.coinbase}/products/${encodeURIComponent(s)}/candles?granularity=${seconds}`,
        {},
        60000,
        "background",
      );
      if (!Array.isArray(d)) throw new FeedError("malformed");
      rows = d
        .filter((r) => finite(r[0]) * 1000 + seconds * 1000 <= this.now())
        .map((r) =>
          this.candle(finite(r[0]) * 1000, r[3], r[2], r[1], r[4], r[5]),
        );
    } else if (this.id === "kraken") {
      const d = await this.transport.get(
        `${roots.kraken}/0/public/OHLC?pair=${s}&interval=${seconds / 60}`,
        {},
        60000,
        "background",
      );
      if (d?.error?.length) throw new FeedError("unavailable");
      if (!Array.isArray(d?.result?.[s])) throw new FeedError("symbol");
      rows = d.result[s]
        .slice(0, -1)
        .map((r: any) =>
          this.candle(finite(r[0]) * 1000, r[1], r[2], r[3], r[4], r[6]),
        );
    } else if (this.id === "coingecko") {
      // Do not manufacture OHLCV from simple-price snapshots. Paid historical access is separate.
      return [];
    } else {
      const d = await this.transport.get(
        `${roots.twelvedata}/time_series?symbol=${encodeURIComponent(s)}${i.venue ? "&exchange=" + encodeURIComponent(i.venue) : ""}&interval=${{ "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "1d": "1day" }[timeframe]}&outputsize=300&timezone=UTC&apikey=${encodeURIComponent(this.keys.twelveDataKey || "")}`,
        {},
        60000,
        "background",
      );
      if (
        d?.meta?.symbol !== s ||
        (d.meta.currency && d.meta.currency !== i.quote) ||
        (i.venue && d.meta.exchange !== i.venue)
      )
        throw new FeedError("symbol");
      if (!Array.isArray(d.values)) throw new FeedError("malformed");
      rows = d.values
        .map((r: any) =>
          this.candle(
            Date.parse(r.datetime.replace(" ", "T") + "Z"),
            r.open,
            r.high,
            r.low,
            r.close,
            r.volume ?? null,
          ),
        )
        .filter(
          (c: Candle) => Date.parse(c.time) + seconds * 1000 <= this.now(),
        );
    }
    return rows
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .slice(-300);
  }
  private candle(
    time: unknown,
    open: unknown,
    high: unknown,
    low: unknown,
    close: unknown,
    volume: unknown,
  ): Candle {
    return {
      time: iso(time),
      open: finite(open, true),
      high: finite(high, true),
      low: finite(low, true),
      close: finite(close, true),
      volume: volume === null ? null : finite(volume),
    };
  }
}
