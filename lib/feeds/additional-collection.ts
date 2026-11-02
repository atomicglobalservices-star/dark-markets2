import { randomUUID } from "node:crypto";
import { db } from "../db";
import {
  BiquoteAdapter,
  GoldApiAdapter,
  type AdditionalProvider,
  type EvaluationQuote,
} from "./additional-providers";
import { FeedError } from "./types";

const ids: AdditionalProvider[] = ["biquote", "goldapi"];
export function additionalConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const enabled = ids.filter(
    (id) =>
      env[
        id === "biquote"
          ? "BIQUOTE_EVALUATION_ENABLED"
          : "GOLD_API_EVALUATION_ENABLED"
      ] === "true",
  );
  const origin = new URL(env.APP_URL || "http://localhost:3100");
  const local =
    (env.MARKET_DATA_SCOPE || "local") === "local" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (enabled.length && !local)
    throw new Error(
      "Additional provider evaluation is local-only; public enablement is not implemented",
    );
  return { enabled, local };
}
export function refreshedEvaluationQuote(
  quote: EvaluationQuote,
  now = Date.now(),
): EvaluationQuote {
  const stale = quote.stale || now - Date.parse(quote.asOf) > 60000;
  return {
    ...quote,
    stale,
    status:
      quote.marketState === "closed"
        ? "closed"
        : stale
          ? "stale"
          : "indicative",
  };
}
const biquote = new BiquoteAdapter(),
  gold = new GoldApiAdapter();
type Loader = (provider: AdditionalProvider) => Promise<EvaluationQuote[]>;
async function load(provider: AdditionalProvider) {
  if (provider === "biquote")
    return biquote.inspectionQuotes(await biquote.catalog());
  const catalog = await gold.catalog();
  const result: EvaluationQuote[] = [];
  for (const symbol of ["XAU", "XAG", "XPT", "XPD", "HG"]) {
    if (!catalog.some((i) => i.symbol === symbol)) continue;
    try {
      result.push(await gold.inspectionQuote(symbol));
    } catch {
      /* Keep other verified assets; missing candidates remain explicit. */
    }
  }
  return result;
}
// Called by the existing market job only. Durable leases coordinate concurrent
// workers/serverless invocations; cache readers never call this function.
export async function collectAdditionalMarkets(
  config = additionalConfig(),
  loader: Loader = load,
) {
  if (!config.local && config.enabled.length)
    throw new Error("Local evaluation required");
  const results: { provider: AdditionalProvider; state: string }[] = [];
  for (const provider of config.enabled) {
    const owner = randomUUID(),
      now = Date.now(),
      leaseKey = "evaluation:lease:" + provider;
    const claim = await db.$queryRaw<{ content: { failures?: number } }[]>`
      INSERT INTO "Snapshot" (key,content,status,"fetchedAt") VALUES (${leaseKey},jsonb_build_object('owner',${owner}::text,'nextAt',${now + 120000}::bigint,'failures',0),'lease',NOW())
      ON CONFLICT (key) DO UPDATE SET content=("Snapshot".content || jsonb_build_object('owner',${owner}::text,'nextAt',${now + 120000}::bigint)),"fetchedAt"=NOW()
      WHERE COALESCE(("Snapshot".content->>'nextAt')::bigint,0)<=${now}::bigint RETURNING content`;
    if (!claim.length) {
      results.push({ provider, state: "cached-or-circuit-open" });
      continue;
    }
    let failure: string | null = null,
      quotes: EvaluationQuote[] = [];
    let retryMs = 0;
    try {
      quotes = await loader(provider);
      if (
        !quotes.length ||
        quotes.some(
          (q) =>
            q.provider !== provider ||
            q.publicDisplayEnabled !== false ||
            q.analysisAllowed !== false,
        )
      )
        throw new FeedError("malformed");
    } catch (error) {
      failure =
        error instanceof FeedError ? error.code : "malformed-or-unavailable";
      retryMs = error instanceof FeedError ? error.retryMs : 0;
    }
    const failures = failure ? (claim[0].content.failures || 0) + 1 : 0;
    const nextAt =
      Date.now() +
      Math.max(
        failure
          ? Math.min(3600000, 60000 * 2 ** Math.min(failures - 1, 6))
          : 60000,
        retryMs,
      );
    const published = await db.$transaction(async (tx) => {
      const committed =
        await tx.$executeRaw`UPDATE "Snapshot" SET content=jsonb_build_object('owner',${owner}::text,'nextAt',${nextAt}::bigint,'failures',${failures}::int,'state',${failure ? "open" : "closed"}::text,'lastError',${failure}::text),"fetchedAt"=NOW() WHERE key=${leaseKey} AND content->>'owner'=${owner} AND (content->>'nextAt')::bigint>=${Date.now()}::bigint`;
      if (!committed) return false;
      const key = "evaluation:" + provider;
      if (failure) {
        await tx.snapshot.updateMany({
          where: { key },
          data: { status: "degraded", sourceError: failure },
        });
        return true;
      }
      const content = JSON.parse(
        JSON.stringify({
          provider,
          evaluationOnly: true,
          publicDisplayEnabled: false,
          analysisAllowed: false,
          exportAllowed: false,
          collectedAt: new Date().toISOString(),
          lastSuccessfulSymbols: quotes.map((q) => q.providerSymbol),
          quotes,
        }),
      );
      const previous = await tx.snapshot.findUnique({ where: { key } });
      const old = (previous?.content as any)?.quotes;
      if (Array.isArray(old))
        content.quotes.push(
          ...old
            .filter(
              (q: EvaluationQuote) =>
                q.provider === provider &&
                q.publicDisplayEnabled === false &&
                !quotes.some(
                  (fresh) => fresh.providerSymbol === q.providerSymbol,
                ),
            )
            .map((q: EvaluationQuote) => ({
              ...q,
              stale: true,
              status: q.marketState === "closed" ? "closed" : "stale",
              warning:
                q.warning +
                " No new response in latest refresh; cached observation retained with original source time.",
            })),
        );
      await tx.snapshot.upsert({
        where: { key },
        create: { key, content, status: "evaluation" },
        update: {
          content,
          status: "evaluation",
          fetchedAt: new Date(),
          sourceError: null,
        },
      });
      return true;
    });
    results.push({
      provider,
      state: !published ? "lease-lost" : failure ? "circuit-open" : "collected",
    });
  }
  return results;
}
export async function additionalSnapshots(config = additionalConfig()) {
  if (!config.local) throw new Error("Local evaluation required");
  const rows = await db.snapshot.findMany({
    where: {
      key: {
        in: config.enabled.flatMap((id) => [
          "evaluation:" + id,
          "evaluation:lease:" + id,
        ]),
      },
    },
  });
  return {
    evaluationOnly: true,
    publicDisplayEnabled: false,
    enabled: config.enabled,
    providers: config.enabled.map((provider) => {
      const row = rows.find((row) => row.key === "evaluation:" + provider);
      const lease = rows.find(
        (row) => row.key === "evaluation:lease:" + provider,
      )?.content as any;
      const content = row?.content as any;
      const quotes = Array.isArray(content?.quotes)
        ? content.quotes
            .filter(
              (q: EvaluationQuote) =>
                q &&
                q.provider === provider &&
                Number.isFinite(q.price) &&
                q.price > 0 &&
                Number.isFinite(Date.parse(q.asOf)) &&
                q.publicDisplayEnabled === false &&
                q.analysisAllowed === false &&
                q.exportAllowed === false,
            )
            .map((q: EvaluationQuote) => refreshedEvaluationQuote(q))
        : [];
      return {
        provider,
        status: row?.status || "not-collected",
        collectedAt: content?.collectedAt,
        lastSuccessfulSymbols:
          content?.lastSuccessfulSymbols ||
          quotes.map((q: EvaluationQuote) => q.providerSymbol),
        sourceError: row?.sourceError || lease?.lastError || null,
        circuit: lease
          ? {
              state: lease.state || "half-open",
              failures: lease.failures || 0,
              nextAt: lease.nextAt,
            }
          : null,
        quotes,
      };
    }),
  };
}
