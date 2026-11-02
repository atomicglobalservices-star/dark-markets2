import {
  mkdir,
  readFile,
  writeFile,
  rename,
  appendFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { engineFetch } from "../lib/feeds/client";
const directory = "work/endurance";
const period = 60000;
const duration = 24 * 3600000;
awaitMain().catch((error) => {
  console.error(
    "Endurance monitor failed:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
async function awaitMain() {
  await mkdir(directory, { recursive: true });
  let saved: any;
  try {
    saved = JSON.parse(await readFile(directory + "/state.json", "utf8"));
  } catch {}
  if (saved?.finishedAt) {
    console.log(
      "Existing run has finished. Archive work/endurance explicitly before starting a new run.",
    );
    return;
  }
  const start = saved?.startedAt || new Date().toISOString();
  const state: any = saved || {
    startedAt: start,
    deadline: new Date(Date.parse(start) + duration).toISOString(),
    samples: 0,
    engineUp: 0,
    appUp: 0,
    workerHealthy: 0,
    quoteObservations: 0,
    freshQuotes: 0,
    quoteUpdates: 0,
    engineRestarts: 0,
    workerRestarts: 0,
    monitorRestarts: 0,
    gaps: 0,
    maxRss: 0,
    maxCpuPercent: 0,
    failovers: 0,
    recoveries: 0,
    rateLimits: 0,
    socketDisconnects: 0,
    socketReconnects: 0,
    cacheHits: 0,
    upstreamRequests: 0,
    errors: {},
    lastQuotes: {},
    providerSamples: {},
  };
  const monotonicStart = process.uptime();
  const priorMonotonic = state.monitoredMonotonicSeconds || 0;
  state.monitorRestarts += saved ? 1 : 0;
  state.monitorPid = process.pid;
  if (!saved) {
    const test = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", "tests/feeds.test.ts"],
      { encoding: "utf8", timeout: 60000, windowsHide: true },
    );
    await writeFile(
      directory + "/controlled-failures.txt",
      (test.stdout || "") + (test.stderr || ""),
    );
    state.controlledFailureTests = {
      exitCode: test.status,
      completedAt: new Date().toISOString(),
    };
  }
  while (Date.now() < Date.parse(state.deadline)) {
    const at = Date.now();
    const sample: any = { at: new Date(at).toISOString() };
    state.samples++;
    if (state.lastSampleAt && at - Date.parse(state.lastSampleAt) > period * 2)
      state.gaps++;
    try {
      const res = await engineFetch("/health");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const health = await res.json();
      const snapshot = await (await engineFetch("/snapshot")).json();
      state.engineUp++;
      if (state.engineId && state.engineId !== health.instanceId)
        state.engineRestarts++;
      const same = state.engineId === health.instanceId;
      const cpu =
        same && state.lastCpu
          ? Math.max(
              0,
              ((health.cpu.user + health.cpu.system - state.lastCpu) /
                (Math.max(1, at - Date.parse(state.lastSampleAt)) * 1000)) *
                100,
            )
          : null;
      state.maxCpuPercent = Math.max(state.maxCpuPercent, cpu || 0);
      state.maxRss = Math.max(state.maxRss, health.memory.rss);
      const totals = {
        failovers: health.metrics.failovers,
        recoveries: health.metrics.recoveries,
        socketDisconnects: health.streamMetrics?.disconnects || 0,
        socketReconnects: health.streamMetrics?.reconnects || 0,
        cacheHits: health.metrics.cacheHits,
        rateLimits: Object.values(health.usage).reduce(
          (n: number, u: any) => n + u.rateLimits,
          0,
        ),
        upstreamRequests: Object.values(health.usage).reduce(
          (n: number, u: any) => n + u.requests,
          0,
        ),
      };
      for (const [key, value] of Object.entries(totals))
        state[key] += Math.max(
          0,
          Number(value) - (same ? state.lastTotals?.[key] || 0 : 0),
        );
      state.lastTotals = totals;
      state.lastCpu = health.cpu.user + health.cpu.system;
      state.engineId = health.instanceId;
      let fresh = 0,
        updates = 0;
      for (const q of snapshot.observations) {
        state.quoteObservations++;
        if (q.status !== "stale" && at - Date.parse(q.asOf) <= 60000) {
          fresh++;
          state.freshQuotes++;
        }
        const key = q.instrumentId + ":" + q.provider;
        if (state.lastQuotes[key] && state.lastQuotes[key] !== q.asOf) {
          updates++;
          state.quoteUpdates++;
        }
        state.lastQuotes[key] = q.asOf;
      }
      for (const [id, p] of Object.entries(health.providers) as [
        string,
        any,
      ][]) {
        const stat = state.providerSamples[id] || {
          samples: 0,
          open: 0,
          successful: 0,
        };
        stat.samples++;
        if (p.state === "open") stat.open++;
        if (p.lastSuccess && at - p.lastSuccess < 120000 && p.state !== "open")
          stat.successful++;
        state.providerSamples[id] = stat;
      }
      Object.assign(sample, {
        engine: true,
        enginePid: health.pid,
        stream: health.stream,
        quoteCount: snapshot.observations.length,
        freshQuotes: fresh,
        quoteUpdates: updates,
        cpuPercent: cpu,
        rss: health.memory.rss,
        totals,
        refreshErrors: health.refreshErrors,
      });
    } catch {
      sample.engine = false;
      state.errors.engine = (state.errors.engine || 0) + 1;
    }
    try {
      const response = await fetch(
        (process.env.APP_URL || "http://localhost:3100") + "/api/health",
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error();
      state.appUp++;
      sample.app = true;
    } catch {
      sample.app = false;
      state.errors.app = (state.errors.app || 0) + 1;
    }
    try {
      const worker = JSON.parse(
        await readFile("work/monitor/worker.json", "utf8"),
      );
      if (at - Date.parse(worker.heartbeatAt) > 120000) throw new Error();
      state.workerHealthy++;
      sample.workerPid = worker.pid;
      sample.workerMemory = worker.memory;
      sample.workerCpu = worker.cpu;
      state.maxWorkerRss = Math.max(
        state.maxWorkerRss || 0,
        worker.memory?.rss || 0,
      );
      if (state.workerPid && state.workerPid !== worker.pid)
        state.workerRestarts++;
      state.workerPid = worker.pid;
    } catch {
      state.errors.worker = (state.errors.worker || 0) + 1;
      sample.worker = false;
    }
    state.lastSampleAt = new Date(at).toISOString();
    state.monitoredMonotonicSeconds =
      priorMonotonic + process.uptime() - monotonicStart;
    state.elapsedSeconds = (Date.now() - Date.parse(state.startedAt)) / 1000;
    state.status = "running";
    await appendFile(
      directory + "/samples.jsonl",
      JSON.stringify(sample) + "\n",
    );
    await persist(state);
    await new Promise((r) =>
      setTimeout(
        r,
        Math.max(
          1,
          Math.min(
            period - (Date.now() - at),
            Date.parse(state.deadline) - Date.now(),
          ),
        ),
      ),
    );
  }
  const remaining = 86400 - (priorMonotonic + process.uptime() - monotonicStart);
  // Allow a bounded rounding margin at the deadline, without crediting downtime.
  if (remaining > 0 && remaining <= 2)
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(remaining * 1000)));
  state.monitoredMonotonicSeconds =
    priorMonotonic + process.uptime() - monotonicStart;
  state.finishedAt = new Date().toISOString();
  state.elapsedSeconds = (Date.now() - Date.parse(state.startedAt)) / 1000;
  state.coverage = state.samples / Math.ceil(duration / period);
  state.status =
    state.coverage >= 0.95
      ? "completed"
      : "completed_insufficient_monitoring_coverage";
  state.engineUptimeRatio = state.engineUp / state.samples;
  state.freshnessRatio = state.quoteObservations
    ? state.freshQuotes / state.quoteObservations
    : 0;
  state.passed =
    state.elapsedSeconds >= 86400 &&
    state.monitoredMonotonicSeconds >= 86400 &&
    state.coverage >= 0.95 &&
    state.engineUptimeRatio >= 0.99 &&
    state.freshnessRatio >= 0.99 &&
    state.controlledFailureTests?.exitCode === 0 &&
    state.engineRestarts === 0 &&
    state.workerRestarts === 0;
  await persist(state);
  console.log(
    "Finite 24-hour monitoring completed; inspect state.json for measured findings.",
  );
}
async function persist(state: any) {
  await writeFile(directory + "/state.tmp", JSON.stringify(state, null, 2));
  await rename(directory + "/state.tmp", directory + "/state.json");
  const summary = {
    status: state.status,
    startedAt: state.startedAt,
    deadline: state.deadline,
    elapsedSeconds: state.elapsedSeconds,
    monitoredMonotonicSeconds: state.monitoredMonotonicSeconds || 0,
    samples: state.samples,
    engineUp: state.engineUp,
    appUp: state.appUp,
    workerHealthy: state.workerHealthy,
    quoteUpdates: state.quoteUpdates,
    freshnessRatio: state.quoteObservations
      ? state.freshQuotes / state.quoteObservations
      : null,
    maxRss: state.maxRss,
    maxCpuPercent: state.maxCpuPercent,
    maxWorkerRss: state.maxWorkerRss || 0,
    providerSamples: state.providerSamples,
    failovers: state.failovers,
    recoveries: state.recoveries,
    rateLimits: state.rateLimits,
    socketDisconnects: state.socketDisconnects,
    socketReconnects: state.socketReconnects,
    engineRestarts: state.engineRestarts,
    workerRestarts: state.workerRestarts,
    monitorRestarts: state.monitorRestarts,
    gaps: state.gaps,
    passed: state.passed ?? null,
  };
  await writeFile(directory + "/summary.tmp", JSON.stringify(summary, null, 2));
  await rename(directory + "/summary.tmp", directory + "/summary.json");
}
