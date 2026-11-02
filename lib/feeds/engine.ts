import {
  FeedError,
  validate,
  type Instrument,
  type Observation,
  type Provider,
  type ProviderId,
  type Timeframe,
} from "./types";
export type Health = {
  state: "closed" | "open" | "half-open";
  failures: number;
  retryAt: number;
  lastSuccess: number | null;
  lastError: string | null;
  requests: number;
  latencyMs: number | null;
};
export type EngineOptions = {
  priority: ProviderId[];
  cacheMs?: number;
  staleMs?: number;
  breakerThreshold?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
  random?: () => number;
  dwellMs?: number;
  recoveryProbeMs?: number;
  recoverySuccesses?: number;
  refreshMarginMs?: number;
};
export class MarketEngine {
  readonly metrics = {
    cacheHits: 0,
    deduplicated: 0,
    failovers: 0,
    recoveries: 0,
    quoteUpdates: 0,
  };
  readonly switches: {
    at: string;
    instrumentId: string;
    from: ProviderId;
    to: ProviderId;
    reason: string;
    oldAgeMs: number | null;
    newAgeMs: number;
  }[] = [];
  readonly sourceWarnings = new Map<
    string,
    { at: string; ageMs: number; receivedAt: string; asOf: string }
  >();
  private selectedAt = new Map<string, number>();
  private recovery = new Map<string, { count: number; nextAt: number }>();
  private historyInflight = new Map<string, Promise<any>>();
  private lastSelection = new Map<string, ProviderId>();
  private disabled = new Set<ProviderId>();
  setEnabled(id: ProviderId, enabled: boolean) {
    if (enabled) this.disabled.delete(id);
    else this.disabled.add(id);
  }
  cachedSnapshot(list: Instrument[]) {
    return list.flatMap((i) => {
      const provider = this.lastSelection.get(i.id);
      if (!provider || this.disabled.has(provider)) return [];
      const q = this.cache.get(provider + ":" + i.id);
      return q ? [{ ...q, unit: i.unit, kind: i.kind }] : [];
    });
  }
  private cache = new Map<string, Observation>();
  hydrateHistory(
    instrumentId: string,
    provider: ProviderId,
    candles: Observation["candles"],
  ) {
    const key = provider + ":" + instrumentId;
    const q = this.cache.get(key);
    if (q) this.cache.set(key, { ...q, candles });
  }

  private invalidated = new Set<string>();
  private inflight = new Map<string, Promise<Observation | null>>();
  private state = new Map<ProviderId, Health>();
  private unsupported = new Map<string, number>();
  private busy = new Set<ProviderId>();
  private listeners = new Set<() => void>();
  readonly options: Required<EngineOptions>;
  constructor(
    private providers: Provider[],
    options: EngineOptions,
  ) {
    this.options = {
      cacheMs: 10000,
      dwellMs: 0,
      recoveryProbeMs: 30000,
      recoverySuccesses: 1,
      refreshMarginMs: 0,
      staleMs: 60000,
      breakerThreshold: 2,
      backoffMs: 1000,
      maxBackoffMs: 60000,
      now: Date.now,
      random: Math.random,
      ...options,
    };
    if (
      !options.priority.length ||
      new Set(options.priority).size !== options.priority.length
    )
      throw new Error("Invalid provider priority");
    for (const p of providers)
      this.state.set(p.id, {
        state: "closed",
        failures: 0,
        retryAt: 0,
        lastSuccess: null,
        lastError: null,
        requests: 0,
        latencyMs: null,
      });
  }
  health() {
    return Object.fromEntries([...this.state].map(([id, s]) => [id, { ...s }]));
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }
  private success(id: ProviderId, latency: number) {
    const s = this.state.get(id)!;
    Object.assign(s, {
      state: "closed",
      failures: 0,
      retryAt: 0,
      lastSuccess: this.options.now(),
      lastError: null,
      latencyMs: latency,
    });
  }
  private fail(id: ProviderId, error: unknown) {
    const s = this.state.get(id)!;
    const e = error instanceof FeedError ? error : new FeedError("unavailable");
    s.failures++;
    s.lastError = e.code;
    const delay =
      Math.min(
        this.options.maxBackoffMs,
        this.options.backoffMs * 2 ** Math.min(s.failures - 1, 16),
      ) *
      (1 + this.options.random() * 0.25);
    s.retryAt = this.options.now() + Math.max(delay, e.retryMs);
    s.state =
      s.failures >= this.options.breakerThreshold ||
      e.code === "rate-limit" ||
      e.code === "budget"
        ? "open"
        : "closed";
  }
  acceptStream(i: Instrument, q: Observation) {
    validate(q, i, q.provider, this.options.now());
    const key = q.provider + ":" + i.id;
    const old = this.cache.get(key);
    if (old && Date.parse(old.asOf) > Date.parse(q.asOf)) return;
    if (old && !q.candles.length) q = { ...q, candles: old.candles };
    this.metrics.quoteUpdates++;
    this.cache.set(key, q);
    this.invalidated.delete(key);
    this.notify();
    // A socket message does not clear a REST rate-limit ban or count as a REST health probe.
  }
  disconnect(id: ProviderId) {
    for (const [key, q] of this.cache)
      if (q.provider === id && q.transport === "websocket")
        this.invalidated.add(key);
    this.notify();
  }
  async quote(i: Instrument): Promise<Observation | null> {
    const pending = this.inflight.get(i.id);
    if (pending) {
      this.metrics.deduplicated++;
      return pending;
    }
    const p = this.resolve(i)
      .then((q) => {
        if (q && q.status !== "stale") {
          const old = this.lastSelection.get(i.id);
          if (old && old !== q.provider) {
            if (
              this.options.priority.indexOf(q.provider) <
              this.options.priority.indexOf(old)
            )
              this.metrics.recoveries++;
            else this.metrics.failovers++;
            const previous = this.cache.get(old + ":" + i.id);
            const reason = this.disabled.has(old)
              ? "provider disabled"
              : this.invalidated.has(old + ":" + i.id)
                ? "stream disconnected"
                : !previous ||
                    this.options.now() - Date.parse(previous.asOf) >
                      this.options.staleMs
                  ? "incumbent stale; fresh alternative"
                  : this.options.priority.indexOf(q.provider) <
                      this.options.priority.indexOf(old)
                    ? "preferred-provider recovery confirmed"
                    : this.sourceWarnings.has(old + ":" + i.id)
                      ? "source timestamp lacks refresh headroom"
                      : "provider unavailable or cooldown";
            const event = {
              at: new Date(this.options.now()).toISOString(),
              instrumentId: i.id,
              from: old,
              to: q.provider,
              reason,
              oldAgeMs: previous
                ? this.options.now() - Date.parse(previous.asOf)
                : null,
              newAgeMs: this.options.now() - Date.parse(q.asOf),
            };
            this.switches.push(event);
            if (this.switches.length > 200) this.switches.shift();
            console.log(JSON.stringify({ event: "provider_switch", ...event }));
          }
          if (old !== q.provider) this.selectedAt.set(i.id, this.options.now());
          this.lastSelection.set(i.id, q.provider);
        }
        return q;
      })
      .finally(() => this.inflight.delete(i.id));
    this.inflight.set(i.id, p);
    return p;
  }
  private async resolve(i: Instrument) {
    let last: Observation | undefined;
    const currentId = this.lastSelection.get(i.id);
    const current = currentId
      ? this.cache.get(currentId + ":" + i.id)
      : undefined;
    const currentUsable =
      current &&
      !this.disabled.has(currentId!) &&
      !this.invalidated.has(currentId + ":" + i.id) &&
      this.options.now() - Date.parse(current.asOf) <= this.options.staleMs;
    const recovering =
      currentUsable &&
      this.options.now() - (this.selectedAt.get(i.id) || 0) >=
        this.options.dwellMs;
    const order =
      currentUsable && !recovering
        ? [
            currentId!,
            ...this.options.priority.filter((id) => id !== currentId),
          ]
        : this.options.priority;
    for (const id of order) {
      const recoveryKey = id + ":" + i.id;
      const preferredProbe =
        currentUsable &&
        id !== currentId &&
        this.options.priority.indexOf(id) <
          this.options.priority.indexOf(currentId!);
      const confidence = this.recovery.get(recoveryKey);
      if (
        preferredProbe &&
        confidence &&
        confidence.nextAt > this.options.now()
      )
        continue;
      const p = this.providers.find((p) => p.id === id);
      if (!p || this.disabled.has(id) || !i.mappings[id]) continue;
      const key = id + ":" + i.id,
        now = this.options.now(),
        saved = this.cache.get(key),
        state = this.state.get(id)!;
      if (saved && (!last || Date.parse(saved.asOf) > Date.parse(last.asOf)))
        last = saved;
      const fresh =
        saved &&
        !this.invalidated.has(key) &&
        now - Date.parse(saved.receivedAt) < this.options.cacheMs &&
        now - Date.parse(saved.asOf) <=
          this.options.staleMs - this.options.refreshMarginMs;
      if (fresh && !preferredProbe) {
        this.metrics.cacheHits++;
        return { ...saved };
      }
      if (
        this.busy.has(id) &&
        !preferredProbe &&
        saved &&
        !this.invalidated.has(key) &&
        now - Date.parse(saved.asOf) <= this.options.staleMs
      ) {
        this.metrics.cacheHits++;
        return { ...saved };
      }
      if (
        state.retryAt > now ||
        (this.unsupported.get(key) || 0) > now ||
        this.busy.has(id)
      )
        continue;
      this.busy.add(id);
      if (state.state === "open") state.state = "half-open";
      state.requests++;
      try {
        if (p.supports && !(await p.supports(i)))
          throw new FeedError("unsupported");
        const q = validate(await p.quote(i), i, id, this.options.now());
        // Delayed sources retain delayed status; stale observations never count as successful recovery.
        if (
          this.options.now() - Date.parse(q.asOf) >
          this.options.staleMs - this.options.refreshMarginMs
        ) {
          this.sourceWarnings.set(key, {
            at: new Date(this.options.now()).toISOString(),
            ageMs: this.options.now() - Date.parse(q.asOf),
            receivedAt: q.receivedAt,
            asOf: q.asOf,
          });
          throw new FeedError("source-stale");
        }
        this.sourceWarnings.delete(key);
        // Hydrating candles must not overwrite a newer socket observation with an older REST price.
        const latest = this.cache.get(key);
        const accepted =
          latest?.transport === "websocket" &&
          Date.parse(latest.asOf) > Date.parse(q.asOf)
            ? { ...latest, candles: q.candles }
            : !q.candles.length && latest?.candles.length
              ? { ...q, candles: latest.candles }
              : q;
        this.metrics.quoteUpdates++;
        this.cache.set(key, accepted);
        this.invalidated.delete(key);
        this.success(id, q.latencyMs);
        if (preferredProbe) {
          const count = (confidence?.count || 0) + 1;
          this.recovery.set(recoveryKey, {
            count,
            nextAt: this.options.now() + this.options.recoveryProbeMs,
          });
          if (count < this.options.recoverySuccesses) continue;
          this.recovery.delete(recoveryKey);
        }
        return { ...accepted };
      } catch (e) {
        this.recovery.delete(recoveryKey);
        if (e instanceof FeedError && e.code === "unsupported")
          this.unsupported.set(key, now + 300000);
        else if (!(e instanceof FeedError && e.code === "source-stale"))
          this.fail(id, e);
        if (fresh && saved)
          return {
            ...saved,
            warning: [
              saved.warning,
              "REST/history refresh unavailable; connected stream price retained.",
            ]
              .filter(Boolean)
              .join(" "),
          };
      } finally {
        this.busy.delete(id);
      }
    }
    // A refresh headroom miss is not itself stale. Retain the valid incumbent
    // until the real 60-second deadline; do not bounce to a different stale cache.
    const incumbentKey = currentId + ":" + i.id;
    const retained =
      currentId && !this.disabled.has(currentId)
        ? this.cache.get(incumbentKey)
        : undefined;
    if (
      retained &&
      !this.disabled.has(currentId!) &&
      !this.invalidated.has(incumbentKey) &&
      this.options.now() - Date.parse(retained.asOf) <= this.options.staleMs
    )
      return {
        ...retained,
        warning:
          "Refresh deferred/unavailable; last validated quote remains within freshness deadline.",
      };
    if (
      last &&
      !this.disabled.has(last.provider) &&
      !this.invalidated.has(last.provider + ":" + i.id) &&
      this.options.now() - Date.parse(last.asOf) <= this.options.staleMs
    )
      return {
        ...last,
        warning:
          "Incumbent unavailable; latest validated alternative retained within the actual freshness deadline.",
      };
    return retained || last
      ? {
          ...(retained || last!),
          status: "stale" as const,
          warning:
            "All configured sources unavailable or stale. Last known observation; not a live quote.",
        }
      : null;
  }
  async snapshot(list: Instrument[], onQuote?: (q: Observation) => void) {
    // Sequential admission keeps one half-open probe and conservative exchange quotas.
    const results: Observation[] = [];
    for (const i of list) {
      const q = await this.quote(i);
      if (q) {
        results.push(q);
        onQuote?.(q);
      }
    }
    return results;
  }
  diagnostics(list: Instrument[]) {
    return list.map((i) => ({
      instrumentId: i.id,
      symbol: i.symbol,
      category: i.category,
      unit: i.unit,
      kind: i.kind,
      providers: this.options.priority.map((id) => ({
        provider: id,
        mapping: i.mappings[id] || null,
        configured: this.providers.some((p) => p.id === id),
        supported:
          this.unsupported.get(id + ":" + i.id)! > this.options.now()
            ? false
            : null,
        circuit: this.state.get(id)?.state || "disabled",
      })),
      selectedProvider: this.lastSelection.get(i.id) || null,
      asOf:
        this.cache.get((this.lastSelection.get(i.id) || "") + ":" + i.id)
          ?.asOf || null,
    }));
  }
  async history(
    i: Instrument,
    timeframe: Timeframe,
    cachedQuoteOnly = false,
  ): Promise<Awaited<ReturnType<MarketEngine["loadHistory"]>>> {
    const key = i.id + ":" + timeframe;
    const pending = this.historyInflight.get(key);
    if (pending) return pending;
    const task = this.loadHistory(i, timeframe, cachedQuoteOnly).finally(() =>
      this.historyInflight.delete(key),
    );
    this.historyInflight.set(key, task);
    return task;
  }
  private async loadHistory(
    i: Instrument,
    timeframe: Timeframe,
    cachedQuoteOnly: boolean,
  ) {
    const selected = cachedQuoteOnly
      ? this.cachedSnapshot([i])[0] || null
      : await this.quote(i);
    const order = selected
      ? [
          selected.provider,
          ...this.options.priority.filter((p) => p !== selected.provider),
        ]
      : this.options.priority;
    for (const id of order) {
      const p = this.providers.find((p) => p.id === id);
      if (
        this.disabled.has(id) ||
        !p?.candles ||
        !i.mappings[id] ||
        (this.state.get(id)?.retryAt || 0) > this.options.now()
      )
        continue;
      try {
        if (p.supports && !(await p.supports(i))) continue;
        const stored = this.cache.get(id + ":" + i.id);
        const q =
          selected?.provider === id
            ? selected
            : cachedQuoteOnly
              ? stored || selected!
              : validate(await p.quote(i), i, id, this.options.now());
        if (!selected && !stored) continue;
        const candles = await p.candles(i, timeframe);
        if (!candles.length) continue;
        validate({ ...q, candles }, i, q.provider, this.options.now());
        const step = {
          "1m": 60000,
          "5m": 300000,
          "15m": 900000,
          "1h": 3600000,
          "1d": 86400000,
        }[timeframe];
        const gaps = candles.slice(1).flatMap((c, index) =>
          Date.parse(c.time) - Date.parse(candles[index].time) > step
            ? [
                {
                  after: candles[index].time,
                  before: c.time,
                  missingIntervals:
                    Math.floor(
                      (Date.parse(c.time) - Date.parse(candles[index].time)) /
                        step,
                    ) - 1,
                },
              ]
            : [],
        );
        if (timeframe === "1h" && stored)
          this.cache.set(id + ":" + i.id, { ...stored, candles });
        return {
          gaps,
          dataType: "historical",
          instrumentId: i.id,
          provider: id,
          source: q.provider === id ? q.source : id,
          exchange:
            q.provider === id
              ? q.exchange
              : {
                  binance: "Binance Spot",
                  coinbase: "Coinbase Exchange",
                  kraken: "Kraken Spot",
                  coingecko: "CoinGecko aggregate",
                  twelvedata: i.venue || "Twelve Data",
                }[id],
          quoteCurrency: i.quote,
          unit: i.unit,
          timeframe,
          exchangeTimezone: q.exchangeTimezone,
          session: q.session,
          candles,
          asOf: new Date(this.options.now()).toISOString(),
          status: q.status,
          warning:
            id !== selected?.provider
              ? "Historical source differs from current quote; attributed separately"
              : q.warning,
        };
      } catch (e) {
        if (e instanceof FeedError && e.code === "rate-limit") this.fail(id, e);
      }
    }
    throw new FeedError("unavailable");
  }
  async probe() {
    for (const p of this.providers) {
      const s = this.state.get(p.id)!;
      if (this.disabled.has(p.id)) continue;
      if (
        s.retryAt > this.options.now() ||
        this.busy.has(p.id) ||
        (s.lastSuccess && this.options.now() - s.lastSuccess < 30000)
      )
        continue;
      this.busy.add(p.id);
      s.requests++;
      const start = this.options.now();
      try {
        await p.health();
        s.lastSuccess = this.options.now();
        s.latencyMs = this.options.now() - start;
      } catch (e) {
        this.fail(p.id, e);
      } finally {
        this.busy.delete(p.id);
      }
      // Only a successful, validated quote closes a circuit. Ping alone cannot mask bad symbols/data.
    }
  }
}
