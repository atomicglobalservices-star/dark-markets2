"use client";
import React, { type ReactNode } from "react";
import {
  Star,
  ChartNoAxesCombined,
  ChevronDown,
  Plus,
  Check,
} from "lucide-react";
import { marketDirectory } from "@/lib/market-directory";
import { directorySession } from "@/lib/market-hours";
import { coreMarkets } from "@/lib/core-markets";
import type { EvaluationQuote } from "@/lib/feeds/additional-providers";
import type { SpotReference } from "@/lib/spot-display";
import type { Quote } from "@/lib/market";

export default function MarketDirectory({
  quotes,
  spotReferences = [],
  fxReferences = [],
  commodityReferences = [],
  stockReferences = [],
  indexReferences = [],
  category,
  query,
  featured,
  sort,
  watch,
  onWatch,
  onNativeChart,
  onVisualChart,
  price,
  change,
  trend,
  instrumentIds,
  visualPricesExternal = false,
  chartInterval,
  onWorkspaceAdd,
  workspaceIds = [],
  workspaceBusyId,
}: {
  quotes: Quote[];
  spotReferences?: SpotReference[];
  fxReferences?: EvaluationQuote[];
  commodityReferences?: EvaluationQuote[];
  stockReferences?: EvaluationQuote[];
  indexReferences?: EvaluationQuote[];
  category: string;
  query: string;
  featured: boolean;
  sort: string;
  watch: string[];
  onWatch: (symbol: string) => void;
  onNativeChart: (quote: Quote) => void;
  onVisualChart: (symbol: string) => void;
  price: (value: number) => string;
  change: (quote: Quote) => ReactNode;
  trend: (quote: Quote) => ReactNode;
  instrumentIds?: string[];
  visualPricesExternal?: boolean;
  chartInterval?: string;
  onWorkspaceAdd?: (instrumentId: string) => void;
  workspaceIds?: string[];
  workspaceBusyId?: string;
}) {
  const rows = marketDirectory(quotes, category, query, featured, sort).filter(
    (row) => !instrumentIds || instrumentIds.includes(row.id),
  );
  const etfDirectoryOnly =
    category === "ETFs" && rows.every((row) => !row.quote);
  return (
    <div
      className={
        "table-scroll market-quote-list" +
        (etfDirectoryOnly ? " market-quote-list--etf" : "")
      }
      data-testid="instrument-directory"
    >
      <table
        aria-label={
          category === "All markets" ? "Market quotes" : category + " quotes"
        }
      >
        <thead>
          <tr>
            <th>Asset</th>
            <th>{etfDirectoryOnly ? "Price display" : "Price"}</th>
            {!etfDirectoryOnly && (
              <>
                <th>24h change</th>
                <th>Trend</th>
              </>
            )}
            <th>
              <span className="quote-actions-heading">Chart / watchlist</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const visualChartUrl =
              row.chartUrl +
              (chartInterval
                ? "&interval=" + encodeURIComponent(chartInterval)
                : "");
            const core = coreMarkets.find((item) => item.id === row.id);
            const brokerCommodity = row.id.startsWith("BIQUOTE:");
            const name = (core?.name || row.quote?.name || row.name)
              .replace(/\s*·.*$/, "")
              .replace(/\s*\(proxy,[^)]+\)/, "");
            const symbol =
              row.id.startsWith("BIQUOTE:") || row.id.startsWith("OANDA:")
                ? row.id.split(":")[1]
                : ["Stocks", "ETFs", "Indices"].includes(row.category)
                  ? row.id.split("/")[0]
                  : row.id;
            const native = row.quote;
            const spot = ["XAU/USD", "XAG/USD"].includes(row.id)
              ? spotReferences.find((item) => item.relatedWidget === row.symbol)
              : undefined;
            // Restricted observations supply existing session information only.
            // Their prices, units and diagnostics stay in administrator evaluation.
            const observation =
              row.category === "Forex"
                ? fxReferences.find(
                    (item) => item.providerSymbol === row.id.replace("/", ""),
                  )
                : brokerCommodity
                  ? commodityReferences.find(
                      (item) => item.providerSymbol === symbol,
                    )
                  : row.category === "Stocks"
                    ? stockReferences.find(
                        (item) => item.providerSymbol === symbol,
                      )
                    : row.category === "Indices"
                      ? indexReferences.find(
                          (item) =>
                            item.providerSymbol ===
                            (
                              {
                                "SPX/INDEX": "US500",
                                "NDX/INDEX": "NAS100",
                                "DJI/INDEX": "US30",
                                "FTSE/INDEX": "UK100",
                                "N225/INDEX": "JP225",
                              } as Record<string, string>
                            )[row.id],
                        )
                      : undefined;
            const session = observation
              ? directorySession(
                  row.category,
                  row.symbol,
                  Date.now(),
                  observation.marketState,
                )
              : row.session;
            const closed = session.startsWith("MARKET CLOSED");
            const status = closed
              ? "MARKET CLOSED"
              : native
                ? row.status === "realtime"
                  ? "LIVE"
                  : row.status === "STALE"
                    ? "STALE"
                    : "DATA DELAYED"
                : spot
                  ? "DATA DELAYED"
                  : "VISUAL ONLY";
            const statusClass = closed
              ? "closed"
              : status === "LIVE"
                ? "live"
                : ["STALE", "DATA DELAYED"].includes(status)
                  ? "delayed"
                  : "visual";
            const source = native
              ? native.exchange || native.source
              : spot
                ? "Gold API"
                : "TradingView";
            const asOf = native?.asOf || spot?.asOf;
            const currency = native?.quoteCurrency || spot?.quoteCurrency;
            const unit = native?.unit || spot?.unit;
            const hasChange =
              native?.change != null && Number.isFinite(native.change);
            const hasTrend =
              !!native &&
              native.history.length > 1 &&
              native.history.every(
                (point) =>
                  Number.isFinite(point.price) &&
                  point.price > 0 &&
                  Number.isFinite(Date.parse(point.time)),
              );
            const watched = !!native && watch.includes(native.symbol);
            return (
              <tr
                key={row.id}
                data-instrument-id={row.id}
                data-category={row.category}
                data-price-mode={native ? "native" : spot ? "spot" : "visual"}
              >
                <td className="quote-asset">
                  <div className="quote-identity">
                    <span className="quote-monogram" aria-hidden="true">
                      {symbol === "BTC/USD"
                        ? "₿"
                        : symbol === "ETH/USD"
                          ? "Ξ"
                          : symbol.replace(/[^a-z0-9]/gi, "").slice(0, 2)}
                    </span>
                    <div className="quote-identity-text">
                      {native ? (
                        <button
                          className="quote-asset-button"
                          onClick={() => onNativeChart(native)}
                        >
                          {name}
                        </button>
                      ) : (
                        <strong>{name}</strong>
                      )}
                      <div className="quote-symbol-status">
                        {name !== symbol && (
                          <span className="quote-symbol">{symbol}</span>
                        )}
                        <span
                          className={
                            "quote-status quote-status--" + statusClass
                          }
                        >
                          {status}
                        </span>
                      </div>
                      <small className="quote-attribution">
                        {source !== "TradingView" && source}
                        {asOf && (
                          <>
                            {" "}
                            ·{" "}
                            <time dateTime={asOf} title={asOf}>
                              {new Intl.DateTimeFormat(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hourCycle: "h23",
                              }).format(new Date(asOf))}
                            </time>
                          </>
                        )}
                      </small>
                    </div>
                  </div>
                </td>
                <td className="quote-price number">
                  {native || spot ? (
                    <>
                      <strong data-spot-reference={spot?.providerSymbol}>
                        {price(native?.price ?? spot!.price)}{" "}
                        <span className="quote-currency">{currency}</span>
                      </strong>
                      {unit && (
                        <small className="quote-unit">
                          {unit.replace(new RegExp("^" + currency + " "), "")}
                        </small>
                      )}
                    </>
                  ) : (
                    <>
                      <a
                        className="quote-visual-price"
                        onClick={(event) => {
                          event.preventDefault();
                          onVisualChart(row.symbol);
                        }}
                        href={
                          row.chart === "external" || visualPricesExternal
                            ? visualChartUrl
                            : "#tradingview-market-quotes"
                        }
                        target={
                          row.chart === "external" || visualPricesExternal
                            ? "_blank"
                            : undefined
                        }
                        rel={
                          row.chart === "external" || visualPricesExternal
                            ? "noopener noreferrer"
                            : undefined
                        }
                      >
                        View price ↗
                      </a>
                      <small className="quote-unit">
                        {brokerCommodity
                          ? "OANDA CFD alternative"
                          : "Visual only"}
                      </small>
                    </>
                  )}
                </td>
                {!etfDirectoryOnly && (
                  <>
                    <td className="quote-change" data-supported={hasChange}>
                      {hasChange ? (
                        change(native!)
                      ) : (
                        <span
                          className="quote-empty"
                          aria-label="24-hour change not available"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="quote-trend" data-supported={hasTrend}>
                      {hasTrend ? (
                        trend(native!)
                      ) : (
                        <span
                          className="quote-empty"
                          aria-label="Trend not available"
                        >
                          —
                        </span>
                      )}
                    </td>
                  </>
                )}
                <td className="quote-actions">
                  <div className="quote-controls">
                    <details className="quote-details">
                      <summary aria-label={"Details for " + name}>
                        Details <ChevronDown size={12} aria-hidden="true" />
                      </summary>
                      <dl>
                        <div>
                          <dt>Source</dt>
                          <dd>
                            {source === "TradingView" ? "Visual chart" : source}
                            {!native && !spot ? " · visual only" : ""}
                          </dd>
                        </div>
                        <div>
                          <dt>Updated</dt>
                          <dd>
                            {asOf ? (
                              <time dateTime={asOf}>{asOf}</time>
                            ) : (
                              "See chart timestamp"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Product</dt>
                          <dd>
                            {brokerCommodity
                              ? "OANDA commodity CFD chart · different broker"
                              : row.kind}
                          </dd>
                        </div>
                        <div>
                          <dt>Unit</dt>
                          <dd>{unit || row.unit}</dd>
                        </div>
                        {!native && (
                          <div>
                            <dt>Chart</dt>
                            <dd>{row.symbol}</dd>
                          </div>
                        )}
                        {spot && (
                          <div>
                            <dt>Quote</dt>
                            <dd>
                              {spot.status === "stale"
                                ? "Stale cached spot reference"
                                : "Indicative spot reference"}
                              ; source-fetch time, not trade time. Chart source
                              is FX_IDC.
                            </dd>
                          </div>
                        )}
                      </dl>
                    </details>
                    <div className="quote-action-buttons">
                      {row.chart === "external" ? (
                        <a
                          className="quote-chart-button"
                          data-chart-action="external"
                          onClick={(event) => {
                            event.preventDefault();
                            onVisualChart(row.symbol);
                          }}
                          href={visualChartUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={"Chart for " + name}
                        >
                          <ChartNoAxesCombined size={15} aria-hidden="true" />{" "}
                          Chart ↗
                        </a>
                      ) : (
                        <button
                          className="quote-chart-button"
                          data-chart-action={row.chart}
                          onClick={() =>
                            native
                              ? onNativeChart(native)
                              : onVisualChart(row.symbol)
                          }
                          aria-label={"Chart for " + name}
                        >
                          <ChartNoAxesCombined size={15} aria-hidden="true" />{" "}
                          Chart
                        </button>
                      )}
                      <button
                        className={
                          "quote-watch-button" + (watched ? " starred" : "")
                        }
                        aria-label={(watched ? "Remove " : "Watch ") + name}
                        aria-pressed={watched}
                        disabled={!native}
                        title={
                          native
                            ? watched
                              ? "Remove from watchlist"
                              : "Add to watchlist"
                            : "Watchlist available with a connected quote"
                        }
                        onClick={() => native && onWatch(native.symbol)}
                      >
                        <Star
                          size={18}
                          fill={watched ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      </button>
                      {onWorkspaceAdd && (
                        <button
                          className="quote-workspace-button"
                          data-workspace-action={row.id}
                          aria-label={
                            workspaceIds.includes(row.id)
                              ? name + " is in My Workspace"
                              : "Add " + name + " to My Workspace"
                          }
                          title={
                            workspaceIds.includes(row.id)
                              ? "Saved in My Workspace"
                              : "Add to My Workspace"
                          }
                          disabled={
                            workspaceIds.includes(row.id) || !!workspaceBusyId
                          }
                          onClick={() => onWorkspaceAdd(row.id)}
                        >
                          {workspaceIds.includes(row.id) ? (
                            <Check size={17} aria-hidden="true" />
                          ) : (
                            <Plus size={17} aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No matching instruments.</div>}
    </div>
  );
}
