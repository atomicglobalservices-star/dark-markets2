import { FeedError } from "./types";
import type { Instrument } from "./types";
/** UTC session decisions are taken only from validated provider calendars. Unknown means skip. */
export function marketSessionAllowed(
  i: Instrument,
  session: string,
  extended = false,
) {
  if (i.category === "Crypto") return true;
  return (
    session === "open" ||
    session === "regular" ||
    (extended && ["pre", "post", "extended"].includes(session))
  );
}
export class CentralSchedule<T> {
  private rows = new Map<string, { value: T; at: number; nextAt: number }>();
  private running = new Set<string>();
  private retry = new Map<string, { at: number; attempts: number }>();
  stats = { collected: 0, failed: 0, reads: 0, skipped: 0 };
  readonly failures: { key: string; at: string; reason: string }[] = [];
  constructor(
    private now = Date.now,
    private capacity = 512,
  ) {}
  read(key: string) {
    this.stats.reads++;
    return this.rows.get(key) || null;
  }
  entries() {
    return [...this.rows.entries()];
  }
  restore(entries: [string, { value: T; at: number; nextAt: number }][]) {
    for (const [key, row] of entries.slice(0, this.capacity))
      if (Number.isFinite(row.at) && Number.isFinite(row.nextAt))
        this.rows.set(key, row);
  }
  async collect(key: string, interval: number, loader: () => Promise<T>) {
    const old = this.rows.get(key);
    if (
      this.running.has(key) ||
      (this.retry.get(key)?.at || 0) > this.now() ||
      (old && old.nextAt > this.now())
    ) {
      this.stats.skipped++;
      return;
    }
    this.running.add(key);
    try {
      const value = await loader();
      if (!this.rows.has(key) && this.rows.size >= this.capacity)
        throw new FeedError("budget");
      this.rows.set(key, {
        value,
        at: this.now(),
        nextAt: this.now() + interval,
      });
      this.stats.collected++;
      this.retry.delete(key);
    } catch (error) {
      this.failures.push({
        key,
        at: new Date(this.now()).toISOString(),
        reason: error instanceof FeedError ? error.code : "unavailable",
      });
      if (this.failures.length > 100) this.failures.shift();
      const attempts = (this.retry.get(key)?.attempts || 0) + 1;
      this.retry.set(key, {
        attempts,
        at:
          this.now() +
          Math.min(3600000, 60000 * 2 ** Math.min(attempts - 1, 6)),
      });
      this.stats.failed++;
      if (old) this.rows.set(key, { ...old, nextAt: this.now() + 60000 });
    } finally {
      this.running.delete(key);
    }
  }
  invalidateProvider(predicate: (value: T) => boolean) {
    for (const [key, row] of this.rows)
      if (predicate(row.value)) this.rows.delete(key);
  }
}
