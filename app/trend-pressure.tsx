"use client";
import { useEffect, useState } from "react";
import type { approvedPressure } from "@/lib/trend-pressure";
type Reading = NonNullable<ReturnType<typeof approvedPressure>> & {
  available: true;
  scope: string;
};
export default function TrendPressure({
  instrumentId,
  timeframe,
}: {
  instrumentId: string;
  timeframe: string;
}) {
  const [data, setData] = useState<Reading | null>(null),
    [loading, setLoading] = useState(true);
  const key = instrumentId + ":" + timeframe;
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(
          "/api/workspace/pressure?instrument=" +
            encodeURIComponent(instrumentId) +
            "&timeframe=" +
            encodeURIComponent(timeframe),
          { cache: "no-store", signal: controller.signal },
        );
        const value = response.ok ? await response.json() : null;
        if (active) {
          setData(value?.available ? value : null);
          setLoadedKey(key);
        }
      } catch {
        if (active) {
          setData(null);
          setLoadedKey(key);
        }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    setData(null);
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [instrumentId, timeframe, key]);
  const reading = loadedKey === key ? data : null;
  return (
    <div
      className="trend-pressure"
      data-testid="trend-pressure"
      aria-live="polite"
    >
      <small>
        {instrumentId} - {timeframe}
      </small>
      {loading && loadedKey !== key ? (
        <p>Checking approved candle history...</p>
      ) : !reading ? (
        <p>Insufficient approved market data</p>
      ) : (
        <>
          <div className="pressure-heading">
            <strong>{reading.bias} bias</strong>
            <b>{reading.score.toFixed(1)} / 100</b>
          </div>
          <div
            className="pressure-bar"
            role="meter"
            aria-label="Bullish pressure"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={reading.score}
          >
            <span style={{ width: reading.bearish + "%" }} />
            <span style={{ width: reading.score + "%" }} />
          </div>
          <div className="pressure-labels">
            <span>Bearish {reading.bearish}</span>
            <span>Bullish {reading.score}</span>
          </div>
          <dl>
            <div>
              <dt>EMA12 / EMA26</dt>
              <dd>
                {reading.emaFast.toPrecision(6)} /{" "}
                {reading.emaSlow.toPrecision(6)}
              </dd>
            </div>
            <div>
              <dt>RSI14</dt>
              <dd>{reading.rsi.toFixed(1)}</dd>
            </div>
            <div>
              <dt>MACD / Signal9</dt>
              <dd>
                {reading.macd.toPrecision(5)} / {reading.signal.toPrecision(5)}
              </dd>
            </div>
            <div>
              <dt>MACD histogram</dt>
              <dd>{reading.histogram.toPrecision(5)}</dd>
            </div>
          </dl>
          <p>
            {reading.freshness} - candle age {Math.floor(reading.ageMs / 60000)}{" "}
            min
          </p>
          <small>
            Completed candle: {new Date(reading.candleClosedAt).toISOString()}
            <br />
            Candle opened: {reading.candleTime}
            <br />
            {reading.source} - {reading.exchange || reading.provider} -{" "}
            {reading.quoteCurrency}
            <br />
            Cache collected: {reading.collectedAt}
            {reading.scope === "local" ? " - Local evaluation" : ""}
          </small>
          <details>
            <summary>How pressure is calculated</summary>
            <p>
              40% EMA12/26 direction + 40% Wilder RSI14 + 20% MACD12/26/9
              histogram confirmation. EMA and MACD direction score 100 bullish,
              0 bearish, 50 flat. EMA flat band: 0.01% of EMA26; MACD flat band:
              0.0001% of close. Bullish at 60 or above, bearish at 40 or below.
              Uses {reading.candlesUsed} consecutive completed candles. Fresh
              within one timeframe plus 60 seconds after candle close; delayed
              up to three timeframes plus 60 seconds, then unavailable. An
              indicator score, not a probability or trading recommendation.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
