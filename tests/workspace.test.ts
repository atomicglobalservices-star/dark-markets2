import test from "node:test";
import assert from "node:assert/strict";
import {
  workspaceAdd,
  workspaceWidgetUpdate,
  readWorkspaceWidgets,
  workspaceLayoutUpdate,
  completeWorkspaceLayout,
  readWorkspaceNotes,
  workspaceNotesUpdate,
  workspaceUpdate,
  workspaceRemove,
  readWorkspace,
} from "../lib/workspace";
test("workspace accepts registered exact identities and rejects forged ownership and unknown instruments", () => {
  for (const instrumentId of [
    "BTC/USD",
    "XAU/USD",
    "AAPL/USD",
    "SPY/USD",
    "BIQUOTE:USOIL",
  ])
    assert.equal(
      workspaceAdd.parse({ instrumentId }).instrumentId,
      instrumentId,
    );
  for (const value of [
    { instrumentId: "MADE-UP" },
    { instrumentId: "SPYUSDT" },
    { instrumentId: "BTC/USD", userId: "other" },
  ])
    assert.equal(workspaceAdd.safeParse(value).success, false);
  assert.equal(
    workspaceRemove.safeParse({ instrumentId: "retired-symbol" }).success,
    true,
  );
});
test("workspace validates supported chart timeframes and bounded plain-text notes", () => {
  for (const timeframe of ["1m", "5m", "15m", "1h", "1d"])
    assert.equal(
      workspaceUpdate.safeParse({ instrumentId: "BTC/USD", timeframe }).success,
      true,
    );
  assert.equal(
    workspaceUpdate.safeParse({ instrumentId: "BTC/USD", timeframe: "fake" })
      .success,
    false,
  );
  assert.equal(
    workspaceUpdate.safeParse({
      instrumentId: "BTC/USD",
      notes: "x".repeat(4001),
    }).success,
    false,
  );
  assert.equal(
    workspaceUpdate.safeParse({ instrumentId: "BTC/USD" }).success,
    false,
  );
  const notes = "<script>not executed</script>\nKeep this exact text.";
  assert.equal(
    workspaceUpdate.parse({ instrumentId: "BTC/USD", notes }).notes,
    notes,
  );
  assert.equal(
    workspaceUpdate.parse({ instrumentId: "BTC/USD", notes: "" }).notes,
    "",
  );
});
test("workspace preserves valid notes including retired instruments and ignores malformed or duplicate entries", () => {
  const row = {
    instrumentId: "BTC/USD",
    timeframe: "1h",
    notes: "Private notes",
    updatedAt: "2026-11-01T12:00:00Z",
  };
  assert.deepEqual(
    readWorkspace({
      workspace: [
        row,
        row,
        { ...row, instrumentId: "retired", notes: "Keep me" },
        { ...row, instrumentId: "bad", updatedAt: "bad" },
      ],
    }),
    [row, { ...row, instrumentId: "retired", notes: "Keep me" }],
  );
  assert.deepEqual(readWorkspace(null), []);
  assert.deepEqual(readWorkspace({ workspace: "invalid" }), []);
});

test("workspace-wide notes preserve legacy notes and permit explicit deletion", () => {
  const legacy = {
    workspace: [
      {
        instrumentId: "BTC/USD",
        timeframe: "1h",
        notes: "Existing plan",
        updatedAt: "2026-11-01T12:00:00Z",
      },
    ],
  };
  assert.equal(readWorkspaceNotes(legacy), "BTC/USD\nExisting plan");
  assert.equal(readWorkspaceNotes({ ...legacy, workspaceNotes: "" }), "");
  assert.equal(
    workspaceNotesUpdate.safeParse({ workspaceNotes: "Private plan" }).success,
    true,
  );
  assert.equal(
    workspaceNotesUpdate.safeParse({ workspaceNotes: "Plan", userId: "other" })
      .success,
    false,
  );
});

test("workspace layouts validate grid bounds and restore notes and instrument widgets", () => {
  const layout = completeWorkspaceLayout(["BTC/USD", "XAU/USD"], []);
  assert.equal(layout.length, 3);
  assert.equal(layout.at(-1)?.i, "workspace-notes");
  assert.equal(
    workspaceLayoutUpdate.safeParse({ workspaceLayout: layout }).success,
    true,
  );
  for (const bad of [
    { ...layout[0], x: 11 },
    { ...layout[0], h: 1 },
    { ...layout[0], y: -1 },
  ])
    assert.equal(
      workspaceLayoutUpdate.safeParse({ workspaceLayout: [bad] }).success,
      false,
    );
  assert.equal(
    workspaceLayoutUpdate.safeParse({ workspaceLayout: [layout[0], layout[0]] })
      .success,
    false,
  );
  assert.equal(
    workspaceLayoutUpdate.safeParse({ workspaceLayout: [], userId: "other" })
      .success,
    false,
  );
  const changed = [{ ...layout[0], x: 4, w: 8, y: 20 }];
  const restored = completeWorkspaceLayout(["BTC/USD", "SPY/USD"], changed);
  assert.deepEqual(restored[0], changed[0]);
  assert.equal(restored[1].y >= 32, true);
  assert.equal(
    restored.some((p) => p.i === "workspace-notes"),
    true,
  );
  assert.deepEqual(
    completeWorkspaceLayout(["BTC/USD"], []),
    completeWorkspaceLayout(["BTC/USD"], []),
  );
});

test("typed workspace widgets preserve legacy data and validate settings without executable config", () => {
  const preferences = {
    workspace: [
      {
        instrumentId: "BTC/USD",
        timeframe: "15m",
        notes: "Plan",
        updatedAt: "2026-11-01T12:00:00Z",
      },
    ],
  };
  const widgets = readWorkspaceWidgets(preferences);
  assert.equal(widgets[0].settings.instrumentId, "BTC/USD");
  assert.equal(widgets[1].id, "workspace-notes");
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: { type: "Market Chart", settings: { instrumentId: "made-up" } },
    }).success,
    false,
  );
  assert.equal(
    workspaceWidgetUpdate.safeParse({ widget: { type: "Unknown" } }).success,
    false,
  );
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: { type: "AI Analyst", settings: { apiKey: "secret" } },
    }).success,
    false,
  );
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: { id: "workspace-notes", hidden: true },
    }).success,
    true,
  );
  const hidden = { ...widgets[0], hidden: true };
  assert.equal(
    readWorkspaceWidgets({ ...preferences, workspaceWidgets: [hidden] })[1]
      .hidden,
    true,
  );
});

test("risk placeholder settings validate manual inputs without producing output", () => {
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: {
        type: "Risk Calculator",
        settings: { balance: 10000, riskPercent: 1, entry: 10, stop: 9 },
      },
    }).success,
    true,
  );
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: { type: "Risk Calculator", settings: { riskPercent: 101 } },
    }).success,
    false,
  );
});

import {
  workspaceNews,
  workspaceCalendar,
  workspaceTopics,
} from "../lib/workspace-content";
import type { Article, EconomicEvent } from "../lib/content-adapters";
test("workspace headlines follow exact selected instruments without demonstration substitutes", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const article = (id: string, title: string, symbols: string[]): Article => ({
    id,
    title,
    symbols,
    category: "Stocks",
    summary: "",
    source: "Fixture",
    url: "https://example.test/" + id,
    publishedAt: "2026-11-01T10:00:00Z",
  });
  const rows = [
    article("btc", "Bitcoin story", ["BTC"]),
    article("apple", "Apple earnings", ["NASDAQ:AAPL"]),
    article("other", "Tesla earnings", ["TSLA"]),
    article("partial", "Pineapple supply", []),
  ];
  assert.deepEqual(
    workspaceNews(rows, ["BTC/USD", "AAPL/USD"], now).map((a) => a.id),
    ["btc", "apple"],
  );
  assert.deepEqual(workspaceNews(rows, [], now), []);
  assert.deepEqual(
    workspaceNews(
      [{ ...rows[0], publishedAt: "2026-12-01T00:00:00Z" }],
      ["BTC/USD"],
      now,
    ),
    [],
  );
  assert.deepEqual(
    [...workspaceTopics(["DAX/INDEX", "N225/INDEX"]).currency].sort(),
    ["EUR", "JPY"],
  );
});
test("workspace calendar excludes past and unrelated events, keeps unknown times and honest windows", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const event = (
    id: string,
    currency: string,
    date: string,
    time: string | null,
  ): EconomicEvent => ({
    id,
    currency,
    date,
    time,
    title: id,
    region: "United States",
    impact: "High",
    source: "Fixture",
    url: "https://example.test/" + id,
  });
  const rows = [
    event("past", "USD", "2026-11-01", "11:00"),
    event("future", "USD", "2026-11-01", "13:00"),
    event("unknown", "EUR", "2026-11-01", null),
    event("other", "JPY", "2026-11-02", "10:00"),
    {
      ...event("window", "USD", "2026-10-31", null),
      dateWindowEnd: "2026-11-03",
      tentative: true,
    },
  ];
  assert.deepEqual(
    workspaceCalendar(rows, ["EUR/USD"], now).map((e) => e.id),
    ["window", "future", "unknown"],
  );
  assert.deepEqual(workspaceCalendar(rows, [], now), []);
  assert.deepEqual(
    workspaceCalendar(rows, ["N225/INDEX"], now).map((e) => e.id),
    ["other"],
  );
});

import {
  calendarOptions,
  calendarRows,
  countryLabel,
} from "../lib/calendar-view";
test("calendar dropdowns include all feed options and filter exact country and missing currency", () => {
  const base = {
    id: "a",
    title: "Event",
    date: "2026-11-02",
    time: null,
    region: "US",
    currency: "USD",
    impact: "High",
    source: "Fixture",
    url: "https://example.test",
  } as EconomicEvent;
  const rows = [
    base,
    { ...base, id: "b", region: "AU", currency: "AUD" },
    { ...base, id: "c", region: "CN", currency: null },
  ];
  assert.deepEqual(calendarOptions(rows).currencies, ["AUD", "USD"]);
  assert.equal(calendarOptions(rows).countries.length, 3);
  assert.equal(calendarOptions(rows).unknownCurrency, true);
  assert.equal(countryLabel("US"), "United States");
  assert.deepEqual(
    calendarRows(rows, {
      country: "US",
      currency: "",
      impact: "",
      date: "",
    }).map((e) => e.id),
    ["a"],
  );
  assert.deepEqual(
    calendarRows(rows, {
      country: "",
      currency: "__unknown",
      impact: "",
      date: "",
    }).map((e) => e.id),
    ["c"],
  );
});

import { publishedCalendarFigures } from "../lib/calendar-view";
import { financeCalendar } from "../lib/free-content";
test("calendar figures preserve zeros, suppress pre-release actuals and require verified priors", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const event: EconomicEvent = {
    id: "test",
    date: "2026-11-02",
    time: "13:00",
    region: "US",
    currency: "USD",
    title: "Test",
    source: "Fixture",
    url: "https://example.test",
    impact: "High",
    previous: 0,
    forecast: "0",
    actual: 0,
    provider: "financecalendar",
    figureEvidence: {
      previous: { availability: "available", evidence: "official_metric" },
    },
  };
  assert.deepEqual(
    publishedCalendarFigures(event, now).map((f) => [f.key, f.value]),
    [
      ["previous", 0],
      ["forecast", "0"],
    ],
  );
  assert.deepEqual(
    publishedCalendarFigures({ ...event, date: "2026-10-31" }, now).map(
      (f) => f.key,
    ),
    ["previous", "forecast", "actual"],
  );
  assert.deepEqual(
    publishedCalendarFigures(
      {
        ...event,
        figureEvidence: {
          previous: { availability: "unavailable", evidence: "none" },
        },
      },
      now,
    ).map((f) => f.key),
    ["forecast"],
  );
  assert.deepEqual(
    publishedCalendarFigures(
      { ...event, previous: null, forecast: null, actual: null },
      now,
    ),
    [],
  );
  assert.deepEqual(
    publishedCalendarFigures(
      {
        ...event,
        date: "2026-11-01",
        time: null,
        tentative: true,
        sourceStatus: "confirmed",
        previous: null,
        forecast: null,
      },
      now,
    ),
    [],
  );
  assert.equal(
    publishedCalendarFigures(
      {
        ...event,
        forecast: null,
        actual: null,
        figureEvidence: {
          previous: { availability: "available", evidence: "article" },
        },
      },
      now,
    ).length,
    0,
  );
  const raw = {
    attribution: { terms: "test" },
    events: [
      {
        id: "zero",
        date: "2026-10-31",
        title: "Test",
        country: "US",
        impact: "high",
        prior: 0,
        consensus: 0,
        actual: 0,
        source_url: "https://example.test",
        data_quality: {
          fields: {
            prior: { availability: "available", evidence: "official_metric" },
          },
        },
      },
    ],
  };
  const [mapped] = financeCalendar(raw);
  assert.equal(mapped.previous, 0);
  assert.equal(mapped.forecast, 0);
  assert.equal(mapped.actual, 0);
  assert.equal(publishedCalendarFigures(mapped, now).length, 3);
});

import {
  calendarEmbedDocument,
  officialCalendarCsp,
} from "../lib/finance-calendar-embed";
import { workspaceCalendarCountries } from "../lib/workspace-content";
test("official calendar embed preserves provider script and attribution without allowing input injection", () => {
  const html = calendarEmbedDocument('US,GB," onload="bad', "high");
  assert.ok(html.includes('data-country="US,GB"'));
  assert.ok(html.includes('data-impact="high"'));
  assert.ok(
    html.includes('src="https://www.financecalendar.com/wp-json/fc/v1/widget"'),
  );
  assert.ok(html.includes('href="https://www.financecalendar.com/"'));
  assert.ok(!html.includes("onload="));
  assert.ok(!html.includes("postMessage"));
  assert.ok(officialCalendarCsp.includes("frame-ancestors 'self'"));
  assert.ok(!officialCalendarCsp.includes("script-src 'self'"));
  assert.deepEqual(workspaceCalendarCountries(["EUR/USD", "N225/INDEX"]), [
    "EU",
    "JP",
    "US",
  ]);
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: {
        type: "Economic Calendar",
        settings: { calendarView: "official" },
      },
    }).success,
    true,
  );
  assert.equal(
    workspaceWidgetUpdate.safeParse({
      widget: {
        type: "Economic Calendar",
        settings: { calendarView: "extract-prices" },
      },
    }).success,
    false,
  );
});

import { marketTicker } from "../lib/market-ticker";
test("ticker retains all forty instruments and seven categories without inventing unavailable prices", () => {
  const rows = marketTicker([]);
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map((r) => r.category)).size, 7);
  assert.ok(rows.every((r) => r.price === null));
  assert.ok(rows.every((r) => r.tickerStatus !== "LIVE"));
  assert.ok(rows.find((r) => r.id === "EUR/USD"));
  assert.ok(rows.find((r) => r.id === "AAPL/USD"));
  assert.equal(new Set(rows.map((r) => r.id)).size, 40);
});

import { highImpactBrief } from "../lib/calendar-view";
test("dashboard impact brief uses source high-impact labels, prioritises upcoming releases and excludes unsupported old results", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const base: EconomicEvent = {
    id: "high",
    title: "Upcoming high",
    date: "2026-11-03",
    time: "13:00",
    region: "US",
    impact: "High",
    source: "Fixture",
    url: "https://example.test",
  };
  const events = [
    base,
    { ...base, id: "low", impact: "Low" as const },
    { ...base, id: "past", date: "2026-11-01" },
    { ...base, id: "result", date: "2026-11-01", actual: 0 },
    { ...base, id: "cancelled", sourceStatus: "cancelled" },
  ];
  assert.deepEqual(
    highImpactBrief(events, now).map((e) => e.id),
    ["high", "result"],
  );
  assert.deepEqual(highImpactBrief([], now), []);
});
