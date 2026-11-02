import test from "node:test";
import assert from "node:assert/strict";
import { normaliseGold } from "../lib/feeds/additional-providers";
import { websiteSpotReferences } from "../lib/spot-display";
import { marketDirectory } from "../lib/market-directory";
const now = Date.parse("2026-11-01T13:00:00Z");
const quote = () =>
  normaliseGold(
    {
      symbol: "XAU",
      name: "Gold",
      currency: "USD",
      price: 3876,
      updatedAt: new Date(now - 1000).toISOString(),
    },
    "XAU",
    new Date(now).toISOString(),
    100,
  );
test("website references preserve identity without becoming futures prices", () => {
  const q = quote(),
    r = websiteSpotReferences([q], now);
  assert.equal(r.length, 1);
  assert.equal(r[0].relatedWidget, "FX_IDC:XAUUSD");
  assert.equal(r[0].status, "indicative");
  assert.equal(r[0].asOf, q.asOf);
  assert.equal(q.publicDisplayEnabled, false);
  assert.equal(q.analysisAllowed, false);
  const directory = marketDirectory([], "Commodities");
  assert.equal(directory.length, 6);
  assert.equal(directory.find((r) => r.id === "XAU/USD")?.quote, null);
  assert.equal(marketDirectory([]).length, 40);
});
test("unverified source, currency, units, symbols and malformed prices are excluded", () => {
  const q = quote();
  for (const change of [
    { provider: "biquote" },
    { providerSymbol: "HG" },
    { unit: "unknown" },
    { quoteCurrency: "EUR" },
    { priceType: "unverified-reference" },
    { id: "wrong" },
    { price: NaN },
    { price: -1 },
    { asOf: "invalid" },
    { receivedAt: new Date(now + 60000).toISOString() },
    { latencyMs: -1 },
    { timestampKind: "provider-quote" },
  ])
    assert.deepEqual(
      websiteSpotReferences([{ ...q, ...change } as typeof q], now),
      [],
      JSON.stringify(change),
    );
});
test("old or retained missing responses stay stale without inventing sessions", () => {
  const q = quote();
  assert.equal(websiteSpotReferences([q], now + 61000)[0].status, "stale");
  assert.equal(
    websiteSpotReferences([{ ...q, stale: true }], now)[0].status,
    "stale",
  );
  assert.deepEqual(websiteSpotReferences([], now), []);
});
