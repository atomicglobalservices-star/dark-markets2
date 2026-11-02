export function workerHeartbeat(
  record: {
    pid: number;
    heartbeatAt: string;
    uptimeSeconds: number;
    tickHealthy?: boolean;
  },
  now = Date.now(),
) {
  const ageMs = now - Date.parse(record.heartbeatAt);
  return {
    ...record,
    heartbeatAgeMs: ageMs,
    healthy:
      record.tickHealthy !== false &&
      Number.isInteger(record.pid) &&
      record.pid > 0 &&
      Number.isFinite(ageMs) &&
      ageMs >= -5000 &&
      ageMs < 20000,
  };
}
