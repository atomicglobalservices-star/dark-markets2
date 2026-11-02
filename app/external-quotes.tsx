"use client";
import { useMemo, useState } from "react";
import { quoteWidgetSelection } from "@/lib/tradingview-availability";
import ExternalChart from "./external-chart";
import {
  embeddedQuoteGroups,
  type EmbeddedInstrument,
} from "@/lib/embedded-markets";

export default function ExternalQuotes({
  items,
  enabled,
}: {
  items: EmbeddedInstrument[];
  enabled: boolean;
}) {
  const { displayed, alternatives } = quoteWidgetSelection(items);
  const [visual, setVisual] = useState<string | null>(null);
  const selectedAlternative = alternatives.find(
    (row) =>
      row.availability.related.symbol === visual ||
      row.original.symbol === visual,
  );
  // Quote refreshes recreate items; stable widget configuration avoids reloads.
  const groups = JSON.stringify(embeddedQuoteGroups(displayed));
  const document = useMemo(() => {
    const options = JSON.stringify({
      width: "100%",
      height: "100%",
      locale: "en",
      colorTheme: "dark",
      showSymbolLogo: true,
      symbolsGroups: JSON.parse(groups),
    }).replace(/</g, "\\u003c");
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#0a0d10;color:#edf1f5;font:12px Arial}a{color:#6bbaf3}.tradingview-widget-container{height:100%;width:100%}.tradingview-widget-container__widget{height:calc(100% - 28px);width:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/markets/" target="_blank" rel="noopener noreferrer">Market quotes by TradingView</a></div><script src="https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js" async>${options}</script></div></body></html>`;
  }, [groups]);
  if (!items.length) return null;
  return (
    <div
      className="form-panel"
      id="tradingview-market-quotes"
      data-testid="external-market-quotes"
    >
      <h3>Attributed market quotes · {displayed.length} instruments</h3>
      {enabled && displayed.length > 0 ? (
        <iframe
          title="TradingView market quotes"
          srcDoc={document}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ height: 600, width: "100%", border: 0 }}
        />
      ) : !enabled ? (
        <p role="status">Chart displays are disabled by the administrator.</p>
      ) : (
        <p role="status">
          No supported quote rows for these exact instruments. Use the labelled
          alternative views below.
        </p>
      )}
      {alternatives.length > 0 && (
        <details data-testid="tradingview-alternatives">
          <summary>
            {alternatives.length} exact instruments unavailable in Market Quotes
            · alternative views
          </summary>
          <p>
            These exact instruments are unavailable for embedding. Exact
            instruments remain in the chart selector. Related views below are
            different products and are never substituted into the quote table,
            native prices, alerts or reports.
          </p>
          <ul>
            {alternatives.map(({ original, availability }) => (
              <li key={original.symbol} data-original-symbol={original.symbol}>
                <p>
                  <strong>{original.name}</strong> · {original.symbol} ·{" "}
                  {original.kind}
                </p>
                <a
                  href={availability.exactChartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open exact instrument ↗
                </a>
                {availability.chart === "available" ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setVisual(original.symbol)}
                  >
                    View exact chart · visual-only
                  </button>
                ) : (
                  <p>
                    Advanced Chart embed is also restricted; the exact external
                    chart link is retained.
                  </p>
                )}
                <button
                  type="button"
                  className="button secondary"
                  data-related-symbol={availability.related.symbol}
                  onClick={() => setVisual(availability.related.symbol)}
                >
                  View different product: {availability.related.name}
                </button>
                <p>
                  {availability.related.symbol} · {availability.related.kind}.
                  Vendor timing and market hours apply.
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {selectedAlternative && visual && (
        <div data-testid="related-tradingview-view">
          <p>
            <strong>Separately selected visual alternative</strong> for{" "}
            {selectedAlternative.original.name}. This does not replace{" "}
            {selectedAlternative.original.symbol}. No native quote or analytics
            feed is supplied.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setVisual(null)}
          >
            Close alternative view
          </button>
          <ExternalChart symbol={visual} enabled={enabled} />
        </div>
      )}
      <a
        href="https://www.tradingview.com/markets/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Market quotes by TradingView
      </a>
    </div>
  );
}
