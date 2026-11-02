import { widgetAvailability } from "./tradingview-availability";
// Launch catalogue only. The collection universe and exchange identities stay intact.
export type CoreMarket = {
  id: string;
  name: string;
  category: string;
  widget: string;
  product: string;
};
const rows = (
  category: string,
  product: string,
  entries: string[][],
): CoreMarket[] =>
  entries.map(([id, name, widget]) => ({
    id,
    name,
    widget,
    category,
    product,
  }));
export const coreMarkets: CoreMarket[] = [
  ...rows(
    "Crypto",
    "spot USD pair; exchange or aggregated reference is attributed",
    [
      ["BTC/USD", "Bitcoin", "KRAKEN:BTCUSD"],
      ["ETH/USD", "Ethereum", "KRAKEN:ETHUSD"],
      ["SOL/USD", "Solana", "KRAKEN:SOLUSD"],
      ["XRP/USD", "XRP", "KRAKEN:XRPUSD"],
      ["BNB/USD", "BNB", "KRAKEN:BNBUSD"],
      ["ADA/USD", "Cardano", "KRAKEN:ADAUSD"],
      ["DOGE/USD", "Dogecoin", "KRAKEN:DOGEUSD"],
      ["TRX/USD", "TRON", "KRAKEN:TRXUSD"],
    ],
  ),
  ...rows("Forex", "spot FX reference", [
    ["EUR/USD", "EUR/USD", "FX_IDC:EURUSD"],
    ["GBP/USD", "GBP/USD", "FX_IDC:GBPUSD"],
    ["USD/JPY", "USD/JPY", "FX_IDC:USDJPY"],
    ["USD/CHF", "USD/CHF", "FX_IDC:USDCHF"],
    ["AUD/USD", "AUD/USD", "FX_IDC:AUDUSD"],
    ["USD/CAD", "USD/CAD", "FX_IDC:USDCAD"],
    ["NZD/USD", "NZD/USD", "FX_IDC:NZDUSD"],
    ["USD/ZAR", "USD/ZAR", "FX_IDC:USDZAR"],
  ]),
  ...rows(
    "Commodities",
    "spot metal reference; USD per troy ounce; not futures or a broker execution quote",
    [
      ["XAU/USD", "Gold · XAU/USD", "FX_IDC:XAUUSD"],
      ["XAG/USD", "Silver · XAG/USD", "FX_IDC:XAGUSD"],
    ],
  ),
  ...rows(
    "Commodities",
    "Biquote broker-derived indicative commodity reference; contract/unit unverified; not an OANDA quote",
    [
      ["BIQUOTE:USOIL", "WTI Oil · USOIL", "OANDA:WTICOUSD"],
      ["BIQUOTE:UKOIL", "Brent Oil · UKOIL", "OANDA:BCOUSD"],
      ["BIQUOTE:XNGUSD", "Natural Gas · XNGUSD", "OANDA:NATGASUSD"],
      ["BIQUOTE:XCUUSD", "Copper · XCUUSD", "OANDA:XCUUSD"],
    ],
  ),
  ...rows("Indices", "cash index reference; not a CFD", [
    ["SPX/INDEX", "S&P 500", "SP:SPX"],
    ["NDX/INDEX", "Nasdaq 100", "NASDAQ:NDX"],
    ["DJI/INDEX", "Dow Jones Industrial Average", "DJ:DJI"],
    ["FTSE/INDEX", "FTSE 100", "FTSE:UKX"],
    ["DAX/INDEX", "DAX 40", "XETR:DAX"],
    ["N225/INDEX", "Nikkei 225", "INDEX:NKY"],
  ]),
  ...rows("Stocks", "NASDAQ listed USD equity", [
    ["AAPL/USD", "Apple", "NASDAQ:AAPL"],
    ["MSFT/USD", "Microsoft", "NASDAQ:MSFT"],
    ["NVDA/USD", "NVIDIA", "NASDAQ:NVDA"],
    ["AMZN/USD", "Amazon", "NASDAQ:AMZN"],
    ["GOOGL/USD", "Alphabet", "NASDAQ:GOOGL"],
    ["TSLA/USD", "Tesla", "NASDAQ:TSLA"],
  ]),
  ...rows("ETFs", "USD per ETF share; not underlying asset price", [
    ["SPY/USD", "SPDR S&P 500 ETF", "AMEX:SPY"],
    ["QQQ/USD", "Invesco QQQ ETF", "NASDAQ:QQQ"],
    ["GLD/USD", "SPDR Gold Shares", "AMEX:GLD"],
    ["VTI/USD", "Vanguard Total Stock Market ETF", "AMEX:VTI"],
  ]),
  ...rows(
    "CFDs",
    "OANDA broker-specific CFD; native data unavailable without authorised broker feed",
    [
      ["OANDA:SPX500USD", "OANDA US500 CFD", "OANDA:SPX500USD"],
      ["OANDA:XAUUSD", "OANDA XAUUSD CFD", "OANDA:XAUUSD"],
    ],
  ),
];
export function isCoreNative(q: { instrumentId?: string; status: string }) {
  return (
    q.status !== "demonstration" &&
    coreMarkets.some((i) => i.id === q.instrumentId)
  );
}
export function widgetRestricted(symbol: string) {
  return widgetAvailability(symbol)?.chart === "restricted";
}
