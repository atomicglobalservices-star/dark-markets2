import { db } from "./db";
import { secCompanies, parseSubmissions, parseCompanyFacts } from "./sec-data";
import { providerEnabled, collectionStatus } from "./collection-control";
import { recordUsage } from "./collection-usage";
export class SecClient {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  private blockedUntil = 0;
  constructor(
    private userAgent: string,
    private fetcher: typeof fetch = fetch,
    private account = (rate = false) => recordUsage("sec", 1, 0, rate ? 1 : 0),
  ) {
    if (
      !/^[^\r\n]{5,200}$/.test(userAgent) ||
      !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(userAgent) ||
      /example\.|localhost|your-domain/.test(userAgent)
    )
      throw new Error(
        "Configure a real SEC_USER_AGENT with company and contact email",
      );
  }
  async get(
    path: string,
    etag?: string,
    lastModified?: string,
  ): Promise<{
    body: any;
    notModified: boolean;
    etag: string | null;
    lastModified: string | null;
  }> {
    const operation = this.tail.then(async () => {
      if (Date.now() < this.blockedUntil)
        throw new Error("SEC fair-access cooldown active");
      const wait = 1000 - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      };
      if (etag) headers["If-None-Match"] = etag;
      if (lastModified) headers["If-Modified-Since"] = lastModified;
      const res = await this.fetcher("https://data.sec.gov/" + path, {
        headers,
        signal: AbortSignal.timeout(20000),
        redirect: "error",
        cache: "no-store",
      });
      await this.account(res.status === 429);
      if (res.status === 429 || res.status === 403) {
        const seconds = Number(res.headers.get("retry-after"));
        this.blockedUntil =
          Date.now() +
          Math.max(60000, Number.isFinite(seconds) ? seconds * 1000 : 60000);
        throw new Error("SEC fair-access refusal; collection paused");
      }
      if (res.status !== 304 && !res.ok)
        throw new Error("SEC source unavailable");
      return {
        body: res.status === 304 ? null : await res.json(),
        notModified: res.status === 304,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
      };
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
let client: SecClient | undefined;
export async function collectFundamentals() {
  if (process.env.SEC_ENABLED !== "true" || !(await providerEnabled("sec")))
    return;
  client ||= new SecClient(process.env.SEC_USER_AGENT || "");
  let checked = 0,
    changed = 0,
    errors = 0;
  for (const [symbol, cik] of Object.entries(secCompanies)) {
    const row = await db.snapshot.findUnique({
      where: { key: "sec:" + symbol },
    });
    const previous = row?.content as any;
    if (row && Date.now() - row.fetchedAt.getTime() < 3600000) continue;
    try {
      const submissions = await client.get(
        `submissions/CIK${cik}.json`,
        previous?.submissionsEtag,
        previous?.submissionsLastModified,
      );
      const identity = submissions.notModified
        ? previous
        : parseSubmissions(submissions.body, symbol, cik);
      if (!identity)
        throw new Error(
          "SEC returned unchanged without an existing checkpoint",
        );
      let metrics = previous?.metrics || null,
        factsFetchedAt = previous?.factsFetchedAt || null;
      let factsCheckedAt = previous?.factsCheckedAt || factsFetchedAt;
      const needsFacts =
        !metrics ||
        identity.signature !== previous?.signature ||
        Date.now() - Date.parse(factsCheckedAt || "") > 7 * 86400000;
      if (needsFacts) {
        const facts = await client.get(
          `api/xbrl/companyfacts/CIK${cik}.json`,
          previous?.factsEtag,
          previous?.factsLastModified,
        );
        if (!facts.notModified) {
          metrics = parseCompanyFacts(facts.body, cik);
          changed++;
          factsFetchedAt = new Date().toISOString();
        }
        factsCheckedAt = new Date().toISOString();
        identity.factsEtag = facts.etag;
        identity.factsLastModified = facts.lastModified;
      }
      const data = {
        ...previous,
        ...identity,
        metrics,
        factsFetchedAt,
        factsCheckedAt,
        checkedAt: new Date().toISOString(),
        submissionsEtag: submissions.etag || previous?.submissionsEtag || null,
        submissionsLastModified:
          submissions.lastModified || previous?.submissionsLastModified || null,
        provider: "SEC EDGAR",
        sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        status: "historical reported fundamentals",
        limitations: [
          "Company facts are as filed; not live prices.",
          "Durations and instant balances differ. Q2/Q3 cash-flow observations may be year-to-date.",
          "Missing concepts are unavailable, never zero. Competing taxonomy concepts are retained separately.",
        ],
      };
      await db.snapshot.upsert({
        where: { key: "sec:" + symbol },
        create: {
          key: "sec:" + symbol,
          content: JSON.parse(JSON.stringify(data)),
          status: "collected",
        },
        update: {
          content: JSON.parse(JSON.stringify(data)),
          status: "collected",
          fetchedAt: new Date(),
          sourceError: null,
        },
      });
      checked++;
    } catch {
      errors++;
      if (row)
        await db.snapshot.update({
          where: { key: row.key },
          data: {
            sourceError: "SEC update failed; previous reported data retained",
          },
        });
    }
  }
  const previousStatus = await db.snapshot.findUnique({
    where: { key: "status:sec" },
  });
  const lastStatus = previousStatus?.content as { lastSuccess?: string } | null;
  const latestStored = await db.snapshot.aggregate({
    where: { key: { startsWith: "sec:" } },
    _max: { fetchedAt: true },
  });
  const reused = Object.keys(secCompanies).length - checked - errors;
  if (reused) await recordUsage("sec", 0, reused, 0);
  await collectionStatus(
    "sec",
    {
      intervalSeconds: 3600,
      lastSuccess: checked
        ? new Date().toISOString()
        : lastStatus?.lastSuccess || latestStored._max.fetchedAt?.toISOString() || null,
      cacheReused: reused,
      companies: Object.keys(secCompanies).length,
      checked,
      changed,
      errors,
      requestPolicy:
        "At most one request/second; submissions hourly; facts on filing change or 7-day expiry",
    },
    errors ? "Some SEC records unavailable" : null,
  );
  if (!checked && errors)
    throw new Error("SEC collection unavailable; no financial values invented");
}
export async function cachedFundamentals(symbol: string) {
  if (!secCompanies[symbol]) return null;
  if (!(await providerEnabled("sec"))) return null;
  const row = await db.snapshot.findUnique({ where: { key: "sec:" + symbol } });
  return row
    ? {
        ...(row.content as Record<string, unknown>),
        cached: true,
        asOf: row.fetchedAt.toISOString(),
        stale: Date.now() - row.fetchedAt.getTime() > 2 * 3600000,
        error: row.sourceError,
      }
    : null;
}
