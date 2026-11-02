import { FeedError } from "./types";
export type Fetcher = typeof fetch;
export class Transport {
  private cache = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<any>>();
  private windowAt = 0;
  private count = 0;
  private blockedUntil = 0;
  cacheHits = 0;
  deduplicated = 0;
  rateLimits = 0;
  requests = 0;
  failures = 0;
  usedWeight: string | null = null;
  backgroundDeferred = 0;
  get usage() {
    return {
      used: this.now() - this.windowAt < 60000 ? this.count : 0,
      budget: this.budget,
      blockedUntil: this.blockedUntil,
      backgroundDeferred: this.backgroundDeferred,
    };
  }
  constructor(
    private fetcher: Fetcher = fetch,
    private now = Date.now,
    private budget = 30,
  ) {}
  async get(
    url: string,
    headers: Record<string, string> = {},
    ttl = 0,
    priority: "live" | "background" = "live",
  ): Promise<any> {
    const saved = this.cache.get(url);
    if (saved && saved.expires > this.now()) {
      this.cacheHits++;
      return saved.value;
    }
    if (this.pending.has(url)) {
      this.deduplicated++;
      return this.pending.get(url);
    }
    const promise = this.request(url, headers, ttl, priority).finally(() =>
      this.pending.delete(url),
    );
    this.pending.set(url, promise);
    return promise;
  }
  private async request(
    url: string,
    headers: Record<string, string>,
    ttl: number,
    priority: "live" | "background",
  ) {
    const now = this.now();
    if (now < this.blockedUntil)
      throw new FeedError("rate-limit", this.blockedUntil - now);
    if (now - this.windowAt >= 60000) {
      this.windowAt = now;
      this.count = 0;
    }
    if (
      priority === "background" &&
      this.count >= Math.floor(this.budget * 0.6)
    ) {
      this.backgroundDeferred++;
      throw new FeedError("budget", Math.max(1, this.windowAt + 60000 - now));
    }
    if (this.count >= this.budget)
      throw new FeedError("budget", Math.max(1, this.windowAt + 60000 - now));
    this.count++;
    this.requests++;
    try {
      const res = await this.fetcher(url, {
        headers,
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
        redirect: "error",
      });
      this.usedWeight = res.headers.get("x-mbx-used-weight-1m");
      const retry = res.headers.get("retry-after");
      const retryMs = retry
        ? /^\d+(\.\d+)?$/.test(retry)
          ? Number(retry) * 1000
          : Date.parse(retry) - now
        : 60000;
      if (res.status === 429 || res.status === 418) {
        this.rateLimits++;
        this.blockedUntil =
          now + Math.max(1000, Number.isFinite(retryMs) ? retryMs : 60000);
        throw new FeedError("rate-limit", this.blockedUntil - now);
      }
      if (!res.ok)
        throw new FeedError(res.status === 404 ? "unsupported" : "unavailable");
      const value = await res.json();
      // Twelve Data and Kraken can report quota exhaustion inside a successful HTTP response.
      if (
        value?.code === 429 ||
        value?.error?.some?.(
          (s: unknown) =>
            typeof s === "string" && /rate limit|throttl/i.test(s),
        )
      ) {
        this.rateLimits++;
        this.blockedUntil = now + 60000;
        throw new FeedError("rate-limit", 60000);
      }
      if (res.headers.get("x-ratelimit-remaining") === "0")
        this.blockedUntil =
          now + Math.max(1000, Number.isFinite(retryMs) ? retryMs : 60000);
      if (ttl) {
        if (this.cache.size >= 256)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(url, { expires: this.now() + ttl, value });
      }
      return value;
    } catch (e) {
      this.failures++;
      if (e instanceof FeedError) throw e;
      throw new FeedError("unavailable");
    }
  }
}
