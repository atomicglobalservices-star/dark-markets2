"use client";
import { useCallback, useEffect, useState } from "react";
import type { EvaluationQuote } from "@/lib/feeds/additional-providers";

function age(stamp: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(stamp)) / 1000));
  if (!Number.isFinite(seconds)) return "Unknown";
  return seconds >= 86400
    ? `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
    : seconds >= 3600
      ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;
}
export default function MarketDataEvaluation() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [provider, setProvider] = useState("all");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/markets/provider-evaluation", {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Evaluation cache unavailable");
      setData(result);
      setError("");
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setError(e.message);
        setData(null);
      }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => void load(controller.signal), 60000),
      clock = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);
  async function refresh() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/markets/provider-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Refresh unavailable");
      setData(result);
      setNow(Date.now());
      setMessage(
        "Refresh request completed: " +
          result.refreshResults
            .map((r: any) => `${r.provider}: ${r.state}`)
            .join("; ") +
          ". Source dates determine freshness; collection does not make a closed quote live.",
      );
    } catch (e: any) {
      setError(
        e.name === "TimeoutError"
          ? "Refresh timed out. Existing observations retain their original dates; read the cache again before retrying."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  const providers = data?.providers || [],
    quotes: EvaluationQuote[] = providers.flatMap((p: any) => p.quotes || []);
  return (
    <section className="panel form-panel" data-testid="market-data-evaluation">
      <h2>Market Data Evaluation</h2>
      <p role="note">
        <strong>
          EVALUATION ONLY — UNRESOLVED PRODUCTS NOT APPROVED FOR SUBSCRIBER
          DISPLAY
        </strong>
      </p>
      <p>
        Local administrator inspection. Prices below are observed provider
        values, separate from the 40 core instruments and TradingView. No
        subscriber price, report, alert or export is enabled by this view.
      </p>
      <p>
        Automatic collection:{" "}
        {data?.automaticCollectionEnabled?.length
          ? data.automaticCollectionEnabled.join(", ")
          : "off"}
        . Cached inspection remains available while collection switches are off.
      </p>
      <label>
        Refresh provider{" "}
        <select
          aria-label="Evaluation refresh provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="all">Both providers</option>
          <option value="biquote">Biquote</option>
          <option value="goldapi">Gold API</option>
        </select>
      </label>{" "}
      <button
        className="button secondary"
        onClick={() => void refresh()}
        disabled={busy || !data?.manualRefreshAvailable}
      >
        {busy ? "Refreshing observations…" : "Refresh evaluation observations"}
      </button>
      <p>
        Bounded read-only collection uses shared provider cooldowns and rate
        limits. It does not change permissions or start scheduled collection.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p data-testid="evaluation-count">
        <strong>{quotes.length} non-crypto observations</strong> ·{" "}
        {quotes.filter((q) => q.marketState === "closed").length} closed ·{" "}
        {
          quotes.filter((q) => q.stale || now - Date.parse(q.asOf) > 60000)
            .length
        }{" "}
        stale · remaining values are indicative references, never verified live
        trades.
      </p>
      {providers.map((p: any) => (
        <p key={p.provider}>
          {p.provider}: {p.status} · last collection {p.collectedAt || "never"}{" "}
          · circuit {p.circuit?.state || "not started"}
          {p.circuit?.nextAt
            ? ` · next eligible ${new Date(p.circuit.nextAt).toISOString()}`
            : ""}
          {p.sourceError
            ? ` · ${p.sourceError}; cached values retain original timestamps`
            : ""}
        </p>
      ))}
      {!data && !error && (
        <p role="status">Loading administrator evaluation cache…</p>
      )}
      {providers.map((p: any) => (
        <div key={p.provider}>
          <h3>
            {p.provider === "goldapi"
              ? "Gold API — spot/reference observations, not continuous futures"
              : "Biquote — indicative broker / aggregated observations"}
          </h3>
          <div className="table-scroll">
            <table
              style={{
                whiteSpace: "normal",
                tableLayout: "fixed",
                minWidth: 1100,
              }}
            >
              <colgroup>
                <col style={{ width: "27%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Instrument / exact identity</th>
                  <th>Observed price</th>
                  <th>Currency / unit</th>
                  <th>Source and timing</th>
                  <th>Session / freshness</th>
                </tr>
              </thead>
              <tbody>
                {(p.quotes || []).map((q: EvaluationQuote) => {
                  const stale = q.stale || now - Date.parse(q.asOf) > 60000;
                  return (
                    <tr
                      key={q.id}
                      data-evaluation-provider={q.provider}
                      data-evaluation-symbol={q.providerSymbol}
                    >
                      <td>
                        <strong>{q.providerSymbol}</strong>
                        <small className="muted" style={{ display: "block" }}>
                          {q.product}
                        </small>
                        <small
                          style={{ display: "block", overflowWrap: "anywhere" }}
                        >
                          {q.id}
                        </small>
                        <details>
                          <summary>Identity and permission warnings</summary>
                          <p>{q.warning}</p>
                        </details>
                      </td>
                      <td className="number">
                        <strong>
                          {q.price.toLocaleString("en-US", {
                            maximumFractionDigits: 8,
                          })}
                        </strong>
                        <small style={{ display: "block" }}>
                          {q.priceType}
                        </small>
                        {q.bid !== null && (
                          <small style={{ display: "block" }}>
                            Bid {q.bid} / ask {q.ask}
                          </small>
                        )}
                      </td>
                      <td>
                        {q.quoteCurrency}
                        <small style={{ display: "block" }}>{q.unit}</small>
                        {q.warning.includes("metadata currency") && (
                          <small style={{ display: "block" }}>
                            Countercurrency inferred from symbol; provider
                            metadata disagrees. See identity warnings.
                          </small>
                        )}
                      </td>
                      <td>
                        {q.provider} · {q.source}
                        <small style={{ display: "block" }}>
                          Venue: {q.exchange || "not disclosed"}
                        </small>
                        <small style={{ display: "block" }}>
                          Source {q.asOf} · {q.timestampKind}
                        </small>
                        <small style={{ display: "block" }}>
                          Receipt {q.receivedAt}
                        </small>
                        <small style={{ display: "block" }}>
                          Source age {age(q.asOf, now)} · receipt age{" "}
                          {age(q.receivedAt, now)} · {q.latencyMs}ms
                        </small>
                      </td>
                      <td>
                        <strong>
                          {q.marketState === "closed"
                            ? "CLOSED — LAST SESSION"
                            : q.marketState === "unknown"
                              ? "INDICATIVE — SESSION UNKNOWN"
                              : "INDICATIVE — PROVIDER REPORTS OPEN"}
                        </strong>
                        <small style={{ display: "block" }}>
                          {stale
                            ? "STALE observation"
                            : "Recent source response; not a verified current trade"}
                        </small>
                        {q.timestampKind === "provider-source-fetch" && (
                          <small style={{ display: "block" }}>
                            Fetch timestamp does not establish exchange trade
                            freshness.
                          </small>
                        )}
                        <small style={{ display: "block" }}>
                          {q.provider === "goldapi" &&
                          ["XAU", "XAG", "XPT", "XPD"].includes(
                            q.providerSymbol,
                          )
                            ? "Verified spot website reference permitted separately; analysis / exports: OFF"
                            : "Subscriber display / analysis / exports: OFF"}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!p.quotes?.length && (
              <p>
                No cached response. Use the bounded refresh; missing
                observations are unavailable, never simulated.
              </p>
            )}
          </div>
        </div>
      ))}
      <details>
        <summary>
          Why core native prices remain unavailable (
          {data?.coreDiagnostics?.length || 0} instruments)
        </summary>
        {(data?.coreDiagnostics || []).map((d: any) => (
          <div key={d.id}>
            <strong>
              {d.name} · {d.id}
            </strong>
            <ul>
              {d.reasons.map((reason: string) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {d.candidates.length > 0 && (
              <p>Separate evaluation candidates: {d.candidates.join(", ")}</p>
            )}
          </div>
        ))}
      </details>
      <details>
        <summary>Commercial display assessment</summary>
        <p>{data?.rights?.goldapi}</p>
        <a
          href="https://gold-api.com/terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          Gold API terms — commercial website use
        </a>
        <p>{data?.rights?.biquote}</p>
        <a
          href="https://biquote.io/terms.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Biquote terms — conditional product use
        </a>
        <p>
          Gold API precious-metal spot references are permitted for separately
          labelled website display under its published terms; this is not
          permission to relabel them as futures or to activate analysis, bulk
          redistribution or to treat broker products as approved subscriber
          feeds.
        </p>
      </details>
    </section>
  );
}
