# Deterministic technical analysis (phase 1)

`analyzeHistory` in `lib/technical-analysis.ts` is pure: history, exact identity, clock and provider capability policy are explicit inputs. `analyzeCachedMarket` in `lib/technical-analysis-service.ts` supplies the existing provider rights policy and reads the central cache. It does not collect data, add routes, enforce caller authentication, or change the UI. Any future route must enforce authentication and applicable subscription access before returning these results.

```ts
import { analyzeCachedMarket } from "@/lib/technical-analysis-service";
const result = await analyzeCachedMarket("BTC/USD", "5m");
```

- EMA20/50: SMA seed over the first period, then exponential smoothing with alpha 2/(period+1). Require 20/50 bars.
- RSI14: Wilder averages seeded from the first 14 changes, requiring 15 bars. Flat history gives 50, zero losses with gains gives 100, zero gains with losses gives 0.
- MACD12/26/9: difference of SMA-seeded EMA12 and EMA26; SMA-seeded EMA9 of that difference. Require 34 bars for line, signal and histogram together.
- ATR14: true range max(high-low, abs(high-previous close), abs(low-previous close)); Wilder smoothing seeded with 14 ranges. Requires 15 bars so every range has an observed previous close.
- All supplied bars are used, up to 1,000; no rounding is applied. Warm-up and numerical-overflow reasons are per indicator.
- Timestamps refer to candle opens. Close time is open + requested timeframe. Freshness uses candle close, not last quote or collection time: fresh through one interval + 60s; delayed through three intervals + 60s; thereafter unavailable. A stale cache also fails closed. Collection age remains separate.
- Identity, currency, timeframe, display and analysis permission, valid OHLC, completed bars and strict interval continuity are required. No sorting, interpolation, filling gaps or blending sources occurs. Session-aware gaps, market-calendar adjustments and resampling are not implemented.
- Null volume remains unknown; these indicators use prices, not volume. No volume measure is invented.
- Allowed timeframe keys follow the existing engine: 1m, 5m, 15m, 1h, 1d. A running engine may not have all cached. Coingecko price snapshots, TradingView visual widgets and evaluation-only Biquote/Gold observations are not converted to OHLCV.
- Local evaluation permission is distinct from commercial derived-analysis rights; the service reuses feedConfig display/analysis gates and never changes those flags.
