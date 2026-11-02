import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolveInstrument, timeframes } from "../lib/feeds/types";
async function main() {
  const saved = JSON.parse(await readFile("work/central/market.json", "utf8"));
  const rows = saved.histories.map(([key, row]: [string, any]) => {
    const h = row.value,
      i = resolveInstrument(h.instrumentId),
      step = timeframes[h.timeframe as keyof typeof timeframes] * 1000;
    const errors: string[] = [];
    if (!key.startsWith(i.id + ":")) errors.push("cache key mismatch");
    if (h.quoteCurrency !== i.quote) errors.push("quote currency mismatch");
    if (!i.mappings[h.provider as keyof typeof i.mappings])
      errors.push("unmapped provider");
    let gaps = 0,
      missing = 0,
      prior: number | undefined;
    for (const c of h.candles) {
      const at = Date.parse(c.time);
      if (!Number.isFinite(at) || at % step !== 0)
        errors.push("invalid or unaligned candle timestamp");
      if (prior !== undefined) {
        if (at <= prior) errors.push("non-increasing candle timestamps");
        if (at - prior > step) {
          gaps++;
          missing += Math.floor((at - prior) / step) - 1;
        }
      }
      if (at + step > Date.now()) errors.push("unclosed candle");
      if (
        c.low > Math.min(c.open, c.close) ||
        c.high < Math.max(c.open, c.close) ||
        c.low <= 0 ||
        c.high <= 0
      )
        errors.push("invalid OHLC");
      prior = at;
    }
    return {
      key,
      instrumentId: i.id,
      timeframe: h.timeframe,
      provider: h.provider,
      exchange: h.exchange,
      quoteCurrency: h.quoteCurrency,
      candles: h.candles.length,
      collectedAt: new Date(row.at).toISOString(),
      lastCandle: h.candles.at(-1)?.time,
      gaps,
      missingIntervals: missing,
      errors: [...new Set(errors)],
    };
  });
  const result = {
    checkedAt: new Date().toISOString(),
    entries: rows.length,
    byTimeframe: rows.reduce(
      (a: any, r: any) => ((a[r.timeframe] = (a[r.timeframe] || 0) + 1), a),
      {},
    ),
    entriesWithGaps: rows.filter((r: any) => r.gaps > 0).length,
    invalidEntries: rows.filter((r: any) => r.errors.length).length,
    rows,
  };
  await mkdir("work/reliability", { recursive: true });
  await writeFile(
    "work/reliability/history-audit.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ ...result, rows: undefined }));
  if (result.invalidEntries) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
