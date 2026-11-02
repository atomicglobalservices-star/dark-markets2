"use client";
import { useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { marketTicker } from "@/lib/market-ticker";
import type { Quote } from "@/lib/market";
import type { SpotReference } from "@/lib/spot-display";
export default function MarketTicker({
  quotes,
  spots,
  onChart,
  onVisualChart,
  variant = "strip",
  trend,
}: {
  quotes: Quote[];
  spots: SpotReference[];
  onChart: (quote: Quote) => void;
  onVisualChart: (symbol: string) => void;
  variant?: "strip" | "cards";
  trend?: (quote: Quote) => ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const rows = marketTicker(quotes, spots);
  return (
    <div
      className={
        "ticker market-ticker" +
        (variant === "cards" ? " market-summary" : "") +
        (paused ? " ticker-paused" : "")
      }
      aria-label="All markets: live, last-known and visual-only prices"
      data-testid={variant === "cards" ? "market-summary" : "market-ticker"}
    >
      <button
        type="button"
        className="ticker-toggle"
        aria-label={paused ? "Resume ticker" : "Pause ticker"}
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <div className="ticker-viewport">
        <div
          className="ticker-track"
          style={{ animationDuration: rows.length * 4 + "s" }}
        >
          {[false, true].map((copy) => (
            <div
              className={"ticker-group" + (copy ? " ticker-copy" : "")}
              key={String(copy)}
              aria-hidden={copy || undefined}
            >
              {rows.map((row) => (
                <button
                  type="button"
                  className="ticker-item"
                  key={row.id}
                  data-ticker-instrument={copy ? undefined : row.id}
                  data-category={row.category}
                  data-status={row.tickerStatus}
                  tabIndex={copy ? -1 : 0}
                  title={`${row.name} - ${row.category} - ${row.source === "TradingView" ? "" : row.source} - ${row.tickerStatus}${row.asOf ? " - " + row.asOf : ""} - ${row.unit}`}
                  onClick={() =>
                    row.quote ? onChart(row.quote) : onVisualChart(row.symbol)
                  }
                >
                  <strong>{row.id}</strong>
                  {variant === "cards" && (
                    <span className="ticker-card-name">{row.name}</span>
                  )}
                  <span className="ticker-price">
                    {row.price !== null
                      ? row.price.toLocaleString(undefined, {
                          maximumFractionDigits:
                            row.price < 1 ? 6 : row.price < 10 ? 4 : 2,
                        }) +
                        " " +
                        row.currency +
                        (row.id === "XAU/USD" || row.id === "XAG/USD"
                          ? " / troy oz"
                          : "")
                      : "View chart"}
                  </span>
                  {row.change !== null && (
                    <span className={row.change >= 0 ? "positive" : "negative"}>
                      {row.change >= 0 ? "+" : ""}
                      {row.change.toFixed(2)}%
                    </span>
                  )}
                  <small
                    className={
                      row.tickerStatus === "LIVE"
                        ? "ticker-live"
                        : "ticker-state"
                    }
                  >
                    {row.tickerStatus}
                  </small>
                  {variant === "cards" &&
                    row.quote &&
                    row.quote.history.length > 1 &&
                    trend && (
                      <span className="ticker-card-trend">
                        {trend(row.quote)}
                      </span>
                    )}
                  {row.source !== "TradingView" && (
                    <small className="ticker-source">{row.source}</small>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
