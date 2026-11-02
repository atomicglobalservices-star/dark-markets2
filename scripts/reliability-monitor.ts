import {
  mkdir,
  readFile,
  writeFile,
  rename,
  appendFile,
} from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { engineFetch } from "../lib/feeds/client";
import { instruments } from "../lib/feeds/types";
import { workerHeartbeat } from "../lib/feeds/runtime-health";
const directory =
  process.argv[2] ||
  process.env.RELIABILITY_DIRECTORY ||
  "work/reliability/acceptance";
const duration =
  Number(process.argv[3] || process.env.RELIABILITY_MINUTES || 1440) * 60000;
const period = 5000;
const expected = instruments
  .filter((i) => i.category === "Crypto")
  .map((i) => i.id);
async function main() {
  await mkdir(directory, { recursive: true });
  try {
    await readFile(directory + "/summary.json");
    throw new Error(
      "Choose a new evidence directory; existing evidence is never overwritten",
    );
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const start = Date.now(),
    mono = performance.now();
  const summary: any = {
    startedAt: new Date(start).toISOString(),
    deadline: new Date(start + duration).toISOString(),
    status: "running",
    samplingIntervalMs: period,
    thresholdMs: 60000,
    eligibleInstruments: expected,
    exclusions: [],
    samples: 0,
    eligibleObservations: 0,
    freshObservations: 0,
    missing: 0,
    exchangeTimestampObservations: 0,
    receiptTimestampObservations: 0,
    exchangeFreshObservations: 0,
    receiptFreshObservations: 0,
    maxCpuPercent: 0,
    sourceStale: 0,
    processingStale: 0,
    engineRestarts: 0,
    workerRestarts: 0,
    engineErrors: 0,
    workerUnhealthy: 0,
    appErrors: 0,
    switches: 0,
    quotaEvents: 0,
    requests: 0,
    maxRss: 0,
    maxWorkerRss: 0,
    failuresWithoutSwitchReason: 0,
  };
  let engineId: string | undefined,
    workerPid: number | undefined,
    lastTotals: any,
    lastCpu: number | undefined,
    lastCpuAt: number | undefined;
  let next = performance.now();
  while (performance.now() - mono < duration) {
    const at = Date.now();
    let h: any,
      quotes: any[] = [];
    let error = false;
    try {
      [h, quotes] = await Promise.all([
        engineFetch("/health").then((r) => r.json()),
        engineFetch("/snapshot")
          .then((r) => r.json())
          .then((s) => s.observations),
      ]);
      if (engineId && engineId !== h.instanceId) summary.engineRestarts++;
      const same = engineId === h.instanceId;
      engineId = h.instanceId;
      summary.maxRss = Math.max(summary.maxRss, h.memory.rss);
      const cpu = h.cpu.user + h.cpu.system;
      if (same && lastCpu !== undefined && lastCpuAt !== undefined)
        summary.maxCpuPercent = Math.max(
          summary.maxCpuPercent,
          (100 * (cpu - lastCpu)) / ((Date.now() - lastCpuAt) * 1000),
        );
      lastCpu = cpu;
      lastCpuAt = Date.now();
      if (!summary.initialProviderUsage) summary.initialProviderUsage = h.usage;
      summary.lastProviderUsage = h.usage;
      summary.lastHistory = h.historyCollection;
      summary.lastWorker = h.worker;
      const totals = {
        switches: h.metrics.failovers + h.metrics.recoveries,
        quotaEvents: Object.values(h.usage).reduce(
          (n: number, p: any) => n + p.rateLimits,
          0,
        ),
        requests: Object.values(h.usage).reduce(
          (n: number, p: any) => n + p.requests,
          0,
        ),
      };
      if (lastTotals)
        for (const k of Object.keys(totals))
          summary[k] += Math.max(
            0,
            (totals as any)[k] - (same ? lastTotals[k] : 0),
          );
      if (!summary.initialTotals) summary.initialTotals = totals;
      lastTotals = totals;
      if (h.switches?.some((e: any) => !e.reason))
        summary.failuresWithoutSwitchReason++;
    } catch {
      summary.engineErrors++;
      error = true;
    }
    const measuredAt = Date.now();
    const ages = expected.map((id) => {
      const q = quotes.find((q) => q.instrumentId === id);
      summary.eligibleObservations++;
      if (!q) {
        summary.missing++;
        return { id, missing: true };
      }
      const sourceAgeMs = measuredAt - Date.parse(q.asOf),
        receiptAgeMs = measuredAt - Date.parse(q.receivedAt);
      const fresh =
        q.status !== "stale" && sourceAgeMs >= -5000 && sourceAgeMs <= 60000;
      if (fresh) {
        summary.freshObservations++;
        if (q.timestampKind === "receipt") summary.receiptFreshObservations++;
        else summary.exchangeFreshObservations++;
      }
      if (q.timestampKind === "receipt") summary.receiptTimestampObservations++;
      else summary.exchangeTimestampObservations++;
      if (sourceAgeMs > 60000) summary.sourceStale++;
      if (receiptAgeMs > 60000) summary.processingStale++;
      return {
        id,
        provider: q.provider,
        status: q.status,
        timestampKind: q.timestampKind,
        asOf: q.asOf,
        receivedAt: q.receivedAt,
        sourceAgeMs,
        receiptAgeMs,
        fresh,
      };
    });
    try {
      const w = JSON.parse(await readFile("work/monitor/worker.json", "utf8"));
      if (workerPid && workerPid !== w.pid) summary.workerRestarts++;
      workerPid = w.pid;
      if (!workerHeartbeat(w).healthy) summary.workerUnhealthy++;
      summary.maxWorkerRss = Math.max(summary.maxWorkerRss, w.memory.rss);
    } catch {
      summary.workerUnhealthy++;
    }
    try {
      const r = await fetch("http://localhost:3100/api/health", {
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) summary.appErrors++;
    } catch {
      summary.appErrors++;
    }
    summary.samples++;
    summary.sampleCoverage =
      summary.samples /
      Math.max(1, Math.floor((performance.now() - mono) / period) + 1);
    summary.lastTotals = lastTotals;
    summary.elapsedSeconds = (performance.now() - mono) / 1000;
    summary.freshness =
      summary.freshObservations / summary.eligibleObservations;
    summary.lastSampleAt = new Date().toISOString();
    summary.lastEngineInstance = engineId;
    await appendFile(
      directory + "/samples.jsonl",
      JSON.stringify({
        at: new Date(at).toISOString(),
        measuredAt: new Date(measuredAt).toISOString(),
        engineError: error,
        ages,
        usage: h?.usage,
        switchCounts: h?.metrics,
        switches: h?.switches,
        history: h?.historyCollection,
      }) + "\n",
    );
    await writeFile(
      directory + "/summary.tmp",
      JSON.stringify(summary, null, 2),
    );
    await rename(directory + "/summary.tmp", directory + "/summary.json");
    next = Math.max(next + period, performance.now());
    await new Promise((r) =>
      setTimeout(r, Math.max(0, next - performance.now())),
    );
  }
  summary.status = "completed";
  summary.elapsedSeconds = (performance.now() - mono) / 1000;
  summary.passed =
    duration >= 86400000 &&
    summary.elapsedSeconds >= 86400 &&
    summary.freshness >= 0.99 &&
    summary.sampleCoverage >= 0.95 &&
    !summary.failuresWithoutSwitchReason &&
    !summary.engineRestarts &&
    !summary.workerRestarts &&
    !summary.engineErrors &&
    !summary.workerUnhealthy &&
    !summary.appErrors;
  await writeFile(directory + "/summary.tmp", JSON.stringify(summary, null, 2));
  await rename(directory + "/summary.tmp", directory + "/summary.json");
  console.log(JSON.stringify(summary));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
