"use client";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { GripHorizontal, X, Save } from "lucide-react";
import MarketDirectory from "./market-directory";
import ExternalChart from "./external-chart";
import TrendPressure from "./trend-pressure";
import { marketDirectory } from "@/lib/market-directory";
import { workspaceTimeframes, type WorkspaceWidget } from "@/lib/workspace";
const intervals = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "1d": "D" };
export function WidgetChart({
  instrumentId,
  timeframe,
}: {
  instrumentId: string;
  timeframe: keyof typeof intervals;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    const widget = host.current?.closest(".workspace-card");
    if (!widget) return;
    const observer = new ResizeObserver(([entry]) =>
      setLarge(
        entry.contentRect.height >= 620 && entry.contentRect.width >= 400,
      ),
    );
    observer.observe(widget);
    return () => observer.disconnect();
  }, []);
  const instrument = marketDirectory([], "All markets", "", false).find(
    (i) => i.id === instrumentId,
  );
  return (
    <div
      ref={host}
      className={
        large ? "workspace-inline-chart expanded" : "workspace-inline-chart"
      }
      data-chart-expanded={large}
    >
      {large && instrument && (
        <ExternalChart
          symbol={instrument.symbol}
          compact
          interval={intervals[timeframe]}
        />
      )}
    </div>
  );
}
export default function WorkspaceWidgetCard({
  widget,
  onSave,
  onHide,
  directoryProps,
  news,
  calendar,
  calendarEmbed,
  disabled,
}: {
  widget: WorkspaceWidget;
  onSave: (settings: WorkspaceWidget["settings"]) => Promise<void>;
  onHide: () => void;
  directoryProps: ComponentProps<typeof MarketDirectory>;
  news: ReactNode;
  calendar: ReactNode;
  calendarEmbed: ReactNode;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(widget.settings);
  useEffect(() => setDraft(widget.settings), [JSON.stringify(widget.settings)]);
  const registry = marketDirectory([], "All markets", "", false);
  const instrumentId = draft.instrumentId || "BTC/USD";
  const timeframe = draft.timeframe || "1h";
  const placeholder = ["AI Analyst", "Risk Calculator"].includes(widget.type);
  return (
    <section className="workspace-custom-widget" data-widget-id={widget.id}>
      <div className="workspace-widget-handle">
        <GripHorizontal size={17} />
        <span>{widget.settings.title || widget.type}</span>
        <button
          className="icon-button"
          type="button"
          aria-label={"Remove " + widget.type + " widget"}
          disabled={disabled}
          onClick={onHide}
        >
          <X size={16} />
        </button>
      </div>
      <div className="workspace-widget-content">
        {widget.type === "Market Chart" && (
          <MarketDirectory
            {...directoryProps}
            instrumentIds={[instrumentId]}
            chartInterval={intervals[timeframe]}
          />
        )}
        {widget.type === "Trend Pressure" && (
          <TrendPressure instrumentId={instrumentId} timeframe={timeframe} />
        )}
        {widget.type === "Market News" && news}
        {widget.type === "Economic Calendar" && (
          <>
            <label className="workspace-calendar-view">
              Calendar display
              <select
                aria-label="Calendar display"
                value={draft.calendarView || "native"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    calendarView: e.target.value as "native" | "official",
                  })
                }
              >
                <option value="native">Native schedule</option>
                <option value="official">
                  Official Finance Calendar widget
                </option>
              </select>
            </label>
            {draft.calendarView === "official" ? calendarEmbed : calendar}
          </>
        )}
        {placeholder && (
          <p role="status" className="subtle-banner">
            {widget.type} placeholder - not implemented. Settings only; no{" "}
            {widget.type === "Risk Calculator"
              ? "calculation"
              : "analysis or signals"}{" "}
            is generated.
          </p>
        )}
        <form
          className="workspace-notes"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(draft);
          }}
        >
          <fieldset disabled={disabled}>
            <label>
              Widget title
              <input
                aria-label="Widget title"
                maxLength={100}
                value={draft.title || ""}
                placeholder={widget.type}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            {[
              "Market Chart",
              "AI Analyst",
              "Trend Pressure",
              "Risk Calculator",
            ].includes(widget.type) && (
              <>
                <label>
                  Instrument
                  <select
                    aria-label="Widget instrument"
                    value={instrumentId}
                    onChange={(e) =>
                      setDraft({ ...draft, instrumentId: e.target.value })
                    }
                  >
                    {registry.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} - {i.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Timeframe
                  <select
                    aria-label="Widget timeframe"
                    value={timeframe}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        timeframe: e.target.value as typeof timeframe,
                      })
                    }
                  >
                    {workspaceTimeframes.map((frame) => (
                      <option key={frame}>{frame}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {["Notes", "Trading Plan"].includes(widget.type) && (
              <label>
                {widget.type}
                <textarea
                  aria-label={widget.type + " text"}
                  maxLength={20000}
                  rows={5}
                  value={draft.text || ""}
                  placeholder={
                    widget.type === "Trading Plan"
                      ? "Entry criteria, invalidation, risk limits and review..."
                      : "Your private notes..."
                  }
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                />
              </label>
            )}
            {widget.type === "Risk Calculator" && (
              <div className="workspace-risk-inputs">
                {(["balance", "riskPercent", "entry", "stop"] as const).map(
                  (key) => (
                    <label key={key}>
                      {
                        {
                          balance: "Account balance (your account currency)",
                          riskPercent: "Risk percentage",
                          entry: "Planned entry price",
                          stop: "Planned stop price",
                        }[key]
                      }
                      <input
                        aria-label={key}
                        type="number"
                        min="0"
                        max={key === "riskPercent" ? 100 : 1e12}
                        step="any"
                        value={draft[key] ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [key]: Number.isFinite(e.target.valueAsNumber)
                              ? e.target.valueAsNumber
                              : undefined,
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            )}
            {placeholder && (
              <label>
                Setup notes
                <input
                  aria-label="Setup notes"
                  maxLength={300}
                  value={draft.focus || ""}
                  placeholder={
                    widget.type === "Risk Calculator"
                      ? "Planned risk settings (calculation unavailable)"
                      : "Focus for future analysis (unavailable)"
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, focus: e.target.value })
                  }
                />
              </label>
            )}
            <button className="button secondary" type="submit">
              <Save size={15} /> Save widget
            </button>
          </fieldset>
        </form>
        {widget.type === "Market Chart" && (
          <WidgetChart instrumentId={instrumentId} timeframe={timeframe} />
        )}
      </div>
    </section>
  );
}
