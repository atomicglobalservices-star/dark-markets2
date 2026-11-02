"use client";
import { useEffect, useMemo, useState } from "react";
import { embedDefinition } from "../lib/embedded-markets";
import { widgetRestricted } from "../lib/core-markets";
export default function ExternalChart({
  symbol,
  enabled = true,
  allowSymbolChange = false,
  compact = false,
  interval = "D",
}: {
  symbol: string;
  enabled?: boolean;
  allowSymbolChange?: boolean;
  compact?: boolean;
  interval?: string;
}) {
  const [status, setStatus] = useState<"loading" | "embedded" | "unavailable">(
    "loading",
  );
  const instrument = embedDefinition(symbol);
  const restricted = widgetRestricted(symbol);
  useEffect(() => {
    setStatus("loading");
    const timeout = setTimeout(
      () => setStatus((s) => (s === "loading" ? "unavailable" : s)),
      20000,
    );
    return () => clearTimeout(timeout);
  }, [symbol, enabled]);
  const document = useMemo(() => {
    if (!instrument) return "";
    const options = JSON.stringify({
      autosize: true,
      symbol: instrument.symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: allowSymbolChange,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    // A dedicated frame contains vendor handlers and timers across React navigation.
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#0a0d10;color:#edf1f5;font:12px Arial}a{color:#6bbaf3}.tradingview-widget-container{height:${compact ? "100%" : "460px"};width:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget" style="height:${compact ? "calc(100% - 32px)" : "428px"};width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(instrument.symbol)}" target="_blank" rel="noopener noreferrer">${instrument.symbol} chart by TradingView</a></div><script src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>${options}</script></div></body></html>`;
  }, [symbol, allowSymbolChange, compact, interval]);
  if (!instrument) return <p>External instrument unavailable.</p>;
  return (
    <section
      className={compact ? "workspace-embedded-chart" : "panel form-panel"}
    >
      {!compact && <h2>{instrument.name}</h2>}
      {restricted && (
        <p role="status">
          This exact instrument is unavailable for embedding. Use the chart link
          below. No substitute product or native price is supplied.
        </p>
      )}
      {!compact && (
        <>
          {" "}
          <p>
            Requested listing {instrument.symbol} · {instrument.source} ·{" "}
            {instrument.kind} · {instrument.unit}
          </p>
          <p>
            Embedded chart. Venue data may be delayed and is separate from
            native quotes, reports and alerts.
          </p>
        </>
      )}
      {status === "loading" && enabled && !restricted && (
        <p role="status">Loading chart…</p>
      )}
      {(status === "unavailable" || !enabled) && (
        <p role="status">
          Chart unavailable or disabled. No substitute instrument has been
          selected.
        </p>
      )}
      {enabled && !restricted && (
        <iframe
          key={symbol + ":" + interval}
          title={"TradingView " + symbol}
          srcDoc={document}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setStatus("embedded")}
          onError={() => setStatus("unavailable")}
          style={{
            height: compact ? "100%" : 472,
            width: "100%",
            border: 0,
            flex: compact ? 1 : undefined,
            minHeight: compact ? 180 : undefined,
          }}
        />
      )}
      <div className="tradingview-widget-copyright">
        <a
          href={
            "https://www.tradingview.com/chart/?symbol=" +
            encodeURIComponent(instrument.symbol)
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          {instrument.symbol} chart by TradingView
        </a>
      </div>
      {compact && (
        <small>
          {instrument.symbol} � {instrument.kind} � Visual only; vendor delays
          apply.
        </small>
      )}
      {!compact && (
        <small>
          Continuous futures are rolling chart series, not a specific delivery
          contract. Broker CFDs are not cash indices or spot quotes. If the
          vendor shows no data, use the attributed link; embedded prices are
          never extracted.
        </small>
      )}
    </section>
  );
}
