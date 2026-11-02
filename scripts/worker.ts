import { mkdir, writeFile, rename } from "node:fs/promises";
import { setupJobs, tick } from "../lib/jobs";
import { db } from "../lib/db";
import { replaceHeartbeat } from "../lib/worker-runtime";
let stopping = false,
  writing = false;
let tickStartedAt: string | null = null,
  lastTickCompletedAt: string | null = null,
  lastError: string | null = null,
  failures = 0,
  ready = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function diagnostic(error: unknown) {
  const e = error as { name?: string; code?: string; message?: string };
  return {
    type: e?.name || "Error",
    code: e?.code || null,
    message: String(e?.message || "unknown")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL redacted]")
      .slice(0, 600),
  };
}
async function heartbeat() {
  if (writing) return;
  writing = true;
  try {
    await mkdir("work/monitor", { recursive: true });
    const tickAgeMs = tickStartedAt
      ? Date.now() - Date.parse(tickStartedAt)
      : 0;
    const record = {
      pid: process.pid,
      heartbeatAt: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      tickStartedAt,
      lastTickCompletedAt,
      tickHealthy: ready && !lastError && tickAgeMs < 300000,
      lastError,
      consecutiveFailures: failures,
    };
    const temp = `work/monitor/worker.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(record));
    await replaceHeartbeat(temp, "work/monitor/worker.json", rename, delay);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "worker_heartbeat_failed",
        at: new Date().toISOString(),
        ...diagnostic(error),
      }),
    );
  } finally {
    writing = false;
  }
}
async function main() {
  const timer = setInterval(() => void heartbeat(), 5000);
  try {
    while (!stopping) {
      tickStartedAt = new Date().toISOString();
      try {
        if (!ready) {
          await setupJobs();
          ready = true;
        }
        await tick();
        lastTickCompletedAt = new Date().toISOString();
        if (failures)
          console.log(
            JSON.stringify({
              event: "worker_recovered",
              at: lastTickCompletedAt,
              previousFailures: failures,
            }),
          );
        failures = 0;
        lastError = null;
      } catch (error) {
        failures++;
        const details = diagnostic(error);
        lastError = details.code || details.type;
        console.error(
          JSON.stringify({
            event: "worker_tick_failed",
            at: new Date().toISOString(),
            attempt: failures,
            ...details,
          }),
        );
      } finally {
        tickStartedAt = null;
        await heartbeat();
      }
      await delay(Math.min(60000, 5000 * 2 ** Math.min(failures, 4)));
    }
  } finally {
    clearInterval(timer);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "worker_failed",
      at: new Date().toISOString(),
      ...diagnostic(error),
    }),
  );
  process.exitCode = 1;
});
