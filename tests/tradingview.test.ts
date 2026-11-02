import test from "node:test";
import assert from "node:assert/strict";
import { coreMarkets } from "../lib/core-markets";
import { embedDefinition, embeddedSelection } from "../lib/embedded-markets";
import {
  quoteWidgetSelection,
  tradingViewAvailability,
  relatedVisualDefinition,
} from "../lib/tradingview-availability";

test("only diagnosed broken quote rows are omitted and every omitted identity retains an exact alternative view", () => {
  const original = embeddedSelection();
  const before = JSON.stringify(original);
  const result = quoteWidgetSelection(original);
  assert.equal(result.displayed.length, 36);
  assert.equal(result.alternatives.length, 4);
  assert.equal(JSON.stringify(original), before);
  for (const { original: row, availability } of result.alternatives) {
    assert.equal(availability.symbol, row.symbol);
    assert.equal(
      new URL(availability.exactChartUrl).searchParams.get("symbol"),
      row.symbol,
    );
    assert.equal(availability.quotes, "restricted");
    assert.ok(embedDefinition(row.symbol));
  }
  assert.equal(coreMarkets.length, 40);
  assert.equal(embeddedSelection().length, 40);
});

test("working controls stay unchanged and related CFDs/references never become core index or futures quotes", () => {
  const symbols = [
    "XETR:DAX",
    "INDEX:NKY",
    "AMEX:SPY",
    "OANDA:SPX500USD",
    "OANDA:XAUUSD",
  ];
  assert.deepEqual(
    quoteWidgetSelection(symbols.map((symbol) => ({ symbol }))).displayed.map(
      (i) => i.symbol,
    ),
    symbols,
  );
  const main = quoteWidgetSelection(embeddedSelection()).displayed.map(
    (i) => i.symbol,
  );
  for (const row of tradingViewAvailability) {
    const alternate = row.related;
    assert.notEqual(alternate.symbol, row.symbol);
    assert.equal(main.includes(alternate.symbol), false);
    assert.ok(!coreMarkets.some((i) => i.widget === alternate.symbol));
    assert.ok(
      alternate.category === "CFDs" || alternate.category === "References",
    );
    assert.match(alternate.kind, /not|reference/);
    assert.equal(embedDefinition(alternate.symbol)?.source, alternate.source);
    assert.equal(
      relatedVisualDefinition(alternate.symbol)?.id,
      alternate.symbol,
    );
  }
  assert.equal(embedDefinition("UNKNOWN:FAKE"), null);
});

test("unsupported category sections retain exact external views even when no main quote rows remain", () => {
  const commodities = quoteWidgetSelection(embeddedSelection("Commodities"));
  assert.equal(commodities.displayed.length, 6);
  assert.equal(commodities.alternatives.length, 0);
  const indices = quoteWidgetSelection(embeddedSelection("Indices"));
  assert.deepEqual(
    indices.displayed.map((i) => i.symbol),
    ["XETR:DAX", "INDEX:NKY"],
  );
  assert.equal(indices.alternatives.length, 4);
  // Unknown symbols are not silently hidden or automatically remapped.
  const unknown = { symbol: "COMEX:GC2!" };
  assert.deepEqual(quoteWidgetSelection([unknown]).displayed, [unknown]);
});
