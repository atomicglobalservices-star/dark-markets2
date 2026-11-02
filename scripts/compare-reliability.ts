import { readFile, writeFile } from "node:fs/promises";
async function window(name: string) {
  const path = "work/reliability/" + name;
  const summary = JSON.parse(await readFile(path + "/summary.json", "utf8"));
  const samples = (await readFile(path + "/samples.jsonl", "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const first = samples[0],
    last = samples.at(-1);
  const requestWindowSeconds =
    (Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 1000;
  const byProvider = Object.fromEntries(
    Object.keys(last.usage).map((id) => [
      id,
      {
        requests: Math.max(
          0,
          last.usage[id].requests - (first.usage[id]?.requests || 0),
        ),
        quotaEvents: Math.max(
          0,
          last.usage[id].rateLimits - (first.usage[id]?.rateLimits || 0),
        ),
        backgroundDeferred: Math.max(
          0,
          (last.usage[id].budget?.backgroundDeferred || 0) -
            (first.usage[id]?.budget?.backgroundDeferred || 0),
        ),
        configuredRequestsPerMinute: last.usage[id].configuredRequestsPerMinute,
      },
    ]),
  );
  const kinds: any = {};
  const stale: any = {};
  for (const sample of samples)
    for (const q of sample.ages) {
      const basis = q.timestampKind || "missing";
      kinds[basis] ||= { observations: 0, fresh: 0 };
      kinds[basis].observations++;
      if (q.fresh) kinds[basis].fresh++;
      else stale[q.id] = (stale[q.id] || 0) + 1;
    }
  return {
    ...summary,
    requestWindowSeconds,
    requestRatePerMinute: (summary.requests * 60) / requestWindowSeconds,
    switchRatePerMinute: (summary.switches * 60) / requestWindowSeconds,
    byProvider,
    timestampBasis: kinds,
    notFreshByInstrument: stale,
  };
}
async function main() {
  const before = await window("before"),
    after = await window("after");
  let finalStable: any = null;
  try {
    finalStable = await window("verified");
  } catch {}
  const result = {
    finalStable,
    checkedAt: new Date().toISOString(),
    before,
    after,
    notes: [
      "Different observation durations; use both raw counts and per-minute rates.",
      "No exclusions: every missing crypto pair fails freshness for that sample.",
      "Kraken receipt-time observations are reported separately and are not evidence of last-trade recency.",
      "Short windows cannot establish a 24-hour pass or prove a sustained reduction in source switching.",
    ],
  };
  await writeFile(
    "work/reliability/comparison.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      before: {
        freshness: before.freshness,
        observations: before.eligibleObservations,
        switches: before.switches,
        requests: before.requests,
        requestRate: before.requestRatePerMinute,
      },
      after: {
        status: after.status,
        freshness: after.freshness,
        observations: after.eligibleObservations,
        switches: after.switches,
        requests: after.requests,
        requestRate: after.requestRatePerMinute,
        byProvider: after.byProvider,
        timestampBasis: after.timestampBasis,
      },
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
