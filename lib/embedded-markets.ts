import { instruments } from "./feeds/types";
import { coreMarkets } from "./core-markets";
import { relatedVisualDefinition } from "./tradingview-availability";
export type EmbeddedInstrument = {
  id: string;
  symbol: string;
  name: string;
  category: string;
  kind: string;
  unit: string;
  source: string;
};
const stocks = instruments
  .filter((i) => i.category === "Stocks" || i.category === "ETFs")
  .map((i) => {
    const base = i.symbol.split(":")[0];
    const etf: Record<string, string> = {
      SPY: "AMEX",
      QQQ: "NASDAQ",
      DIA: "AMEX",
      IWM: "AMEX",
      VTI: "AMEX",
      GLD: "AMEX",
    };
    return {
      id: i.id,
      symbol: (i.category === "ETFs" ? etf[base] : i.venue) + ":" + base,
      name: i.name,
      category: i.category,
      kind: i.kind || "equity",
      unit: i.unit || "",
      source: i.venue || "TradingView venue",
    };
  });
const forex = instruments
  .filter((i) => i.category === "Forex")
  .map((i) => ({
    id: i.id,
    symbol: "FX_IDC:" + i.symbol,
    name: i.name,
    category: i.category,
    kind: "spot FX reference",
    unit: i.unit || "",
    source: "FX_IDC",
  }));
export const embeddedInstruments: EmbeddedInstrument[] = [
  ...forex,
  ...stocks,
  ...[
    ["SP:SPX", "S&P 500 cash index", "Indices", "cash index", "index points"],
    [
      "NASDAQ:NDX",
      "Nasdaq-100 cash index",
      "Indices",
      "cash index",
      "index points",
    ],
    ["DJ:DJI", "Dow Jones cash index", "Indices", "cash index", "index points"],
    [
      "FTSE:UKX",
      "FTSE 100 cash index",
      "Indices",
      "cash index",
      "index points",
    ],
    ["XETR:DAX", "DAX cash index", "Indices", "cash index", "index points"],
    [
      "INDEX:NKY",
      "Nikkei 225 cash index",
      "Indices",
      "cash index",
      "index points",
    ],
    [
      "COMEX:GC1!",
      "Gold continuous futures",
      "Commodities",
      "continuous futures",
      "USD/troy ounce",
    ],
    [
      "COMEX:SI1!",
      "Silver continuous futures",
      "Commodities",
      "continuous futures",
      "USD/troy ounce",
    ],
    [
      "NYMEX:PL1!",
      "Platinum continuous futures",
      "Commodities",
      "continuous futures",
      "USD/troy ounce",
    ],
    [
      "NYMEX:PA1!",
      "Palladium continuous futures",
      "Commodities",
      "continuous futures",
      "USD/troy ounce",
    ],
    [
      "NYMEX:CL1!",
      "WTI continuous futures",
      "Commodities",
      "continuous futures",
      "USD/barrel",
    ],
    [
      "ICEEUR:BRN1!",
      "Brent continuous futures",
      "Commodities",
      "continuous futures",
      "USD/barrel",
    ],
    [
      "NYMEX:NG1!",
      "Natural gas continuous futures",
      "Commodities",
      "continuous futures",
      "USD/MMBtu",
    ],
    [
      "CBOT:ZC1!",
      "Corn continuous futures",
      "Commodities",
      "continuous futures",
      "US cents/bushel",
    ],
    [
      "CBOT:ZW1!",
      "Wheat continuous futures",
      "Commodities",
      "continuous futures",
      "US cents/bushel",
    ],
    [
      "CBOT:ZS1!",
      "Soybeans continuous futures",
      "Commodities",
      "continuous futures",
      "US cents/bushel",
    ],
    [
      "OANDA:SPX500USD",
      "OANDA US 500 CFD",
      "CFDs",
      "broker-specific CFD",
      "broker quote units",
    ],
    [
      "OANDA:NAS100USD",
      "OANDA US Nas 100 CFD",
      "CFDs",
      "broker-specific CFD",
      "USD broker quote units",
    ],
    [
      "OANDA:US30USD",
      "OANDA US Wall St 30 CFD",
      "CFDs",
      "broker-specific CFD",
      "USD broker quote units",
    ],
    [
      "OANDA:DE30EUR",
      "OANDA Germany 30 CFD",
      "CFDs",
      "broker-specific CFD",
      "EUR broker quote units",
    ],
    [
      "OANDA:UK100GBP",
      "OANDA UK 100 CFD",
      "CFDs",
      "broker-specific CFD",
      "GBP broker quote units",
    ],
    [
      "OANDA:XAGUSD",
      "OANDA Silver CFD",
      "CFDs",
      "broker-specific CFD",
      "USD broker quote units",
    ],
    [
      "OANDA:XAUUSD",
      "OANDA Gold CFD",
      "CFDs",
      "broker-specific CFD",
      "broker quote units",
    ],
  ].map(([symbol, name, category, kind, unit]) => ({
    id: symbol,
    symbol,
    name,
    category,
    kind,
    unit,
    source: symbol.split(":")[0],
  })),
];
// Featured commodity products are explicit spot references or broker CFDs.
// Existing futures remain available in broader discovery with their original identities.
embeddedInstruments.push(
  {
    id: "XAU/USD",
    symbol: "FX_IDC:XAUUSD",
    name: "Gold · XAU/USD",
    category: "Commodities",
    kind: "spot metal reference",
    unit: "USD per troy ounce",
    source: "FX_IDC",
  },
  {
    id: "XAG/USD",
    symbol: "FX_IDC:XAGUSD",
    name: "Silver · XAG/USD",
    category: "Commodities",
    kind: "spot metal reference",
    unit: "USD per troy ounce",
    source: "FX_IDC",
  },
  ...[
    ["OANDA:WTICOUSD", "WTI oil · WTICOUSD", "USD per barrel (OANDA CFD)"],
    ["OANDA:BCOUSD", "Brent oil · BCOUSD", "USD per barrel (OANDA CFD)"],
    ["OANDA:NATGASUSD", "Natural gas · NATGASUSD", "USD per MMBtu (OANDA CFD)"],
    ["OANDA:XCUUSD", "Copper · XCUUSD", "USD per pound (OANDA CFD)"],
  ].map(([symbol, name, unit]) => ({
    id: symbol,
    symbol,
    name,
    category: "Commodities",
    kind: "broker-specific commodity CFD",
    unit,
    source: "OANDA",
  })),
);
// Copper was absent from the broader visual catalogue. Never map it to spot metal.
embeddedInstruments.push({
  id: "COMEX:HG1!",
  symbol: "COMEX:HG1!",
  name: "Copper continuous futures",
  category: "Commodities",
  kind: "continuous futures",
  unit: "USD per pound",
  source: "COMEX",
});
for (const core of coreMarkets.filter((i) => i.category === "Crypto")) {
  embeddedInstruments.push({
    id: core.id,
    symbol: core.widget,
    name: core.name + " / USD",
    category: core.category,
    kind: core.product,
    unit: "USD per coin",
    source: "KRAKEN",
  });
}
export function embedDefinition(symbol: string) {
  return (
    embeddedInstruments.find((i) => i.symbol === symbol) ||
    relatedVisualDefinition(symbol)
  );
}

// One common filter for the directory, quote widget and chart selector.
export function embeddedSelection(
  category = "All markets",
  query = "",
  featured = true,
) {
  const search = query.trim().toLowerCase();
  return embeddedInstruments.filter(
    (i) =>
      (!featured || coreMarkets.some((core) => core.widget === i.symbol)) &&
      (category === "All markets" || i.category === category) &&
      (!search ||
        [i.symbol, i.name, i.category, i.source]
          .join(" ")
          .toLowerCase()
          .includes(search)),
  );
}
export function embeddedQuoteGroups(items: EmbeddedInstrument[]) {
  return [...new Set(items.map((i) => i.category))].map((name) => ({
    name,
    symbols: items
      .filter((i) => i.category === name)
      .map((i) => ({ name: i.symbol, displayName: i.name })),
  }));
}
