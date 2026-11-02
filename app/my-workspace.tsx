"use client";
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import Link from "next/link";
import GridLayout, {
  useContainerWidth,
  noCompactor,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Trash2,
  Sparkles,
  Save,
  Pencil,
  GripHorizontal,
  RotateCcw,
  Plus,
  X,
} from "lucide-react";
import MarketDirectory from "./market-directory";
import WorkspaceContent from "./workspace-content";
import FinanceCalendarEmbed from "./finance-calendar-embed";
import { workspaceCalendarCountries } from "@/lib/workspace-content";
import type { Article, EconomicEvent } from "@/lib/content-adapters";
import WorkspaceWidgetCard, { WidgetChart } from "./workspace-widget";
import { marketDirectory } from "@/lib/market-directory";
import {
  workspaceTimeframes,
  workspaceWidgetTypes,
  type WorkspaceWidget,
  completeWorkspaceLayout,
  type WorkspacePosition,
  type WorkspaceItem,
} from "@/lib/workspace";

type QuotesProps = Pick<
  ComponentProps<typeof MarketDirectory>,
  | "quotes"
  | "spotReferences"
  | "fxReferences"
  | "commodityReferences"
  | "stockReferences"
  | "indexReferences"
  | "watch"
  | "onWatch"
  | "price"
  | "change"
  | "trend"
>;
const canvasCompactor = { ...noCompactor, preventCollision: true };
const intervals = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "1d": "D" };
async function workspaceRequest(method = "GET", body?: unknown) {
  const response = await fetch("/api/workspace", {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Workspace request failed");
  return data as {
    items: WorkspaceItem[];
    notes?: string;
    layout?: WorkspacePosition[];
    widgets?: WorkspaceWidget[];
  };
}
export default function MyWorkspace({
  onNativeChart,
  onVisualChart,
  premium,
  articles,
  events,
  newsStatus,
  calendarStatus,
  ...quotes
}: QuotesProps & {
  premium: boolean;
  onVisualChart: (symbol: string, interval?: string) => void;
  articles: Article[];
  events: EconomicEvent[];
  newsStatus: string;
  calendarStatus: string;
  onNativeChart: (
    quote: QuotesProps["quotes"][number],
    timeframe: string,
  ) => void;
}) {
  const [items, setItems] = useState<WorkspaceItem[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [widgets, setWidgets] = useState<WorkspaceWidget[]>([]);
  const [adding, setAdding] = useState(false);
  const [widgetType, setWidgetType] =
    useState<WorkspaceWidget["type"]>("Market Chart");
  const [widgetInstrument, setWidgetInstrument] = useState("BTC/USD");
  const [layout, setLayout] = useState<WorkspacePosition[]>([]);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { notes: string; timeframe: WorkspaceItem["timeframe"] }>
  >({});
  useEffect(() => {
    let active = true;
    workspaceRequest()
      .then((rows) => {
        if (active) {
          setItems(rows.items);
          setWidgets(rows.widgets || []);
          setLayout(rows.layout || []);
          setNotes(rows.notes || "");
          setNoteDraft(rows.notes || "");
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const registry = marketDirectory([], "All markets", "", false);
  async function saveLayout(next: WorkspacePosition[]) {
    setLayout((current) =>
      next.length
        ? [
            ...next,
            ...current.filter(
              (p) =>
                widgets.some((w) => w.id === p.i && w.hidden) &&
                !next.some((n) => n.i === p.i),
            ),
          ]
        : [],
    );
    setLayoutBusy(true);
    setError("");
    try {
      await workspaceRequest("PATCH", { workspaceLayout: next });
      setNotice(next.length ? "Layout saved." : "Layout reset.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save layout",
      );
    } finally {
      setLayoutBusy(false);
    }
  }
  async function changeWidget(widget: {
    id?: string;
    type?: WorkspaceWidget["type"];
    settings?: WorkspaceWidget["settings"];
    hidden?: boolean;
  }) {
    setBusy("widget");
    setError("");
    try {
      const result = await workspaceRequest("PATCH", { widget });
      setWidgets(result.widgets || []);
      setAdding(false);
      setNotice(
        widget.hidden
          ? "Widget removed. Saved data retained in Add Widget."
          : "Widget saved.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save widget",
      );
    } finally {
      setBusy("");
    }
  }
  const legacyIds = new Set([
    ...items.map((i) => i.instrumentId),
    "workspace-notes",
  ]);
  const visibleItems = items.filter(
    (item) => !widgets.some((w) => w.id === item.instrumentId && w.hidden),
  );
  const extraWidgets = widgets.filter((w) => !legacyIds.has(w.id) && !w.hidden);
  const contentIds = [
    ...new Set([
      ...visibleItems.map((i) => i.instrumentId),
      ...extraWidgets
        .filter((w) => w.type === "Market Chart")
        .map((w) => w.settings.instrumentId || "BTC/USD"),
    ]),
  ];
  const notesVisible = !widgets.some(
    (w) => w.id === "workspace-notes" && w.hidden,
  );
  const canvasLayout = completeWorkspaceLayout(
    [
      ...visibleItems.map((i) => i.instrumentId),
      ...extraWidgets.map((w) => w.id),
    ],
    layout,
    notesVisible,
  );
  async function save(item: WorkspaceItem) {
    setBusy(item.instrumentId);
    setError("");
    setNotice("");
    try {
      const draft = drafts[item.instrumentId] || item;
      setItems(
        (
          await workspaceRequest("PATCH", {
            instrumentId: item.instrumentId,
            timeframe: draft.timeframe,
          })
        ).items,
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.instrumentId];
        return next;
      });
      setNotice("Timeframe saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save notes");
    } finally {
      setBusy("");
    }
  }
  async function saveNotes(clear = false) {
    setBusy("workspace-notes");
    setError("");
    setNotice("");
    try {
      const result = await workspaceRequest("PATCH", {
        workspaceNotes: clear ? "" : noteDraft,
      });
      setNotes(result.notes || "");
      setNoteDraft(result.notes || "");
      setEditingNotes(false);
      setNotice(clear ? "Workspace notes deleted." : "Workspace notes saved.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save workspace notes",
      );
    } finally {
      setBusy("");
    }
  }
  async function remove(item: WorkspaceItem) {
    setBusy(item.instrumentId);
    setError("");
    setNotice("");
    try {
      setItems(
        (await workspaceRequest("DELETE", { instrumentId: item.instrumentId }))
          .items,
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.instrumentId];
        return next;
      });
      setNotice("Instrument removed from My Workspace.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not remove instrument",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="my-workspace" data-testid="my-workspace">
      <div className="workspace-intro">
        <p>
          Add instruments from Markets, choose a chart timeframe and keep
          private trading notes.
        </p>
        {premium && (
          <button
            className="button primary"
            type="button"
            disabled={!loaded}
            onClick={() => setAdding(!adding)}
          >
            <Plus size={16} /> Add Widget
          </button>
        )}
        {premium && (
          <button
            type="button"
            className="button secondary"
            disabled={layoutBusy || !loaded}
            onClick={() => void saveLayout([])}
          >
            <RotateCcw size={15} /> Reset Layout
          </button>
        )}
        <Link className="button secondary" href="/markets">
          Add from Markets
        </Link>
      </div>
      {adding && premium && (
        <section
          className="panel workspace-add-menu"
          aria-label="Add Widget menu"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void changeWidget({
                type: widgetType,
                settings:
                  widgetType === "Market Chart"
                    ? { instrumentId: widgetInstrument, timeframe: "1h" }
                    : {},
              });
            }}
          >
            <label>
              Widget type
              <select
                aria-label="Widget type"
                value={widgetType}
                onChange={(e) =>
                  setWidgetType(e.target.value as WorkspaceWidget["type"])
                }
              >
                {workspaceWidgetTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            {widgetType === "Market Chart" && (
              <label>
                Instrument
                <select
                  aria-label="New widget instrument"
                  value={widgetInstrument}
                  onChange={(e) => setWidgetInstrument(e.target.value)}
                >
                  {registry.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} - {i.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="button primary" type="submit" disabled={!!busy}>
              Add to canvas
            </button>
          </form>
          {widgets.some((w) => w.hidden) && (
            <div>
              <h3>Restore saved widgets</h3>
              {widgets
                .filter((w) => w.hidden)
                .map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void changeWidget({ id: w.id, hidden: false })
                    }
                  >
                    Restore{" "}
                    {w.settings.title || w.settings.instrumentId || w.type}
                  </button>
                ))}
            </div>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!loaded && <p role="status">Loading your workspace…</p>}
      {loaded && !error && !visibleItems.length && !extraWidgets.length && (
        <section className="panel workspace-empty">
          <h2>Your workspace starts here</h2>
          <p>Save an instrument from Markets using its + button.</p>
          <Link className="button primary" href="/markets">
            Explore Markets
          </Link>
        </section>
      )}
      <WorkspaceCanvas
        enabled={premium && loaded}
        layout={canvasLayout}
        saving={layoutBusy}
        onSave={saveLayout}
      >
        {[
          ...visibleItems.map((item) => {
            const draft = drafts[item.instrumentId] || item;
            const instrument = registry.find(
              (row) => row.id === item.instrumentId,
            );
            const name = instrument?.name || item.instrumentId;
            return (
              <section
                className="panel workspace-card"
                key={item.instrumentId}
                data-workspace-instrument={item.instrumentId}
              >
                <div className="workspace-widget-handle">
                  <GripHorizontal size={17} /> {name}
                </div>
                <div className="workspace-widget-content">
                  {instrument ? (
                    <MarketDirectory
                      {...quotes}
                      category="All markets"
                      query=""
                      featured={false}
                      sort="directory"
                      instrumentIds={[item.instrumentId]}
                      visualPricesExternal
                      chartInterval={intervals[draft.timeframe]}
                      onNativeChart={(quote) =>
                        onNativeChart(quote, draft.timeframe)
                      }
                      onVisualChart={(symbol) =>
                        onVisualChart(symbol, intervals[draft.timeframe])
                      }
                    />
                  ) : (
                    <div className="workspace-empty">
                      <h2>{name}</h2>
                      <p>
                        This saved instrument is no longer in the market
                        directory. Your notes are retained.
                      </p>
                    </div>
                  )}
                  <form
                    className="workspace-notes"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save(item);
                    }}
                  >
                    <fieldset disabled={busy === item.instrumentId}>
                      <label>
                        Chart timeframe
                        <select
                          aria-label={"Timeframe for " + name}
                          value={draft.timeframe}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.instrumentId]: {
                                ...draft,
                                timeframe: event.target
                                  .value as WorkspaceItem["timeframe"],
                              },
                            }))
                          }
                        >
                          {workspaceTimeframes.map((frame) => (
                            <option key={frame} value={frame}>
                              {frame}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="workspace-note-actions">
                        <button
                          className="button primary"
                          type="submit"
                          disabled={!!busy}
                        >
                          <Save size={15} /> Save
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={!!busy}
                          aria-label={"Remove " + name + " from My Workspace"}
                          onClick={() =>
                            premium
                              ? void changeWidget({
                                  id: item.instrumentId,
                                  hidden: true,
                                })
                              : void remove(item)
                          }
                        >
                          <Trash2 size={15} /> Remove
                        </button>
                      </div>
                    </fieldset>
                  </form>
                  <WidgetChart
                    instrumentId={item.instrumentId}
                    timeframe={draft.timeframe}
                  />
                  <div className="workspace-ai">
                    <Sparkles size={15} aria-hidden="true" />
                    <span>AI analysis · coming soon</span>
                  </div>
                </div>
              </section>
            );
          }),
          ...extraWidgets.map((widget) => (
            <section
              key={widget.id}
              className="panel workspace-card"
              data-widget-id={widget.id}
            >
              <WorkspaceWidgetCard
                widget={widget}
                disabled={!!busy}
                onSave={(settings) => changeWidget({ id: widget.id, settings })}
                onHide={() =>
                  void changeWidget({ id: widget.id, hidden: true })
                }
                news={
                  <WorkspaceContent
                    kind="news"
                    ids={contentIds}
                    articles={articles}
                    events={events}
                    newsStatus={newsStatus}
                    calendarStatus={calendarStatus}
                  />
                }
                calendarEmbed={
                  premium && workspaceCalendarCountries(contentIds).length ? (
                    <FinanceCalendarEmbed
                      countries={workspaceCalendarCountries(contentIds)}
                    />
                  ) : (
                    <p>
                      Select an instrument with a known economy to display the
                      official calendar.
                    </p>
                  )
                }
                calendar={
                  <WorkspaceContent
                    kind="calendar"
                    ids={contentIds}
                    articles={articles}
                    events={events}
                    newsStatus={newsStatus}
                    calendarStatus={calendarStatus}
                  />
                }
                directoryProps={{
                  ...quotes,
                  category: "All markets",
                  query: "",
                  featured: false,
                  sort: "directory",
                  visualPricesExternal: true,
                  onNativeChart: (quote) =>
                    onNativeChart(quote, widget.settings.timeframe || "1h"),
                  onVisualChart: (symbol) =>
                    onVisualChart(
                      symbol,
                      intervals[widget.settings.timeframe || "1h"],
                    ),
                }}
              />
            </section>
          )),
          ...(loaded && notesVisible
            ? [
                <section
                  key="workspace-notes"
                  className="panel workspace-notes workspace-notes-widget"
                  data-testid="workspace-notes"
                >
                  <div className="workspace-widget-handle">
                    <GripHorizontal size={17} /> Workspace notes
                    {premium && (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Remove Workspace notes widget"
                        disabled={!!busy}
                        onClick={() =>
                          void changeWidget({
                            id: "workspace-notes",
                            hidden: true,
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="workspace-widget-content">
                    <h2>Workspace notes</h2>
                    <p className="muted">
                      Private notes for your whole workspace, independent of the
                      selected chart.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveNotes();
                      }}
                    >
                      <fieldset disabled={!!busy}>
                        {!notes || editingNotes ? (
                          <label>
                            Workspace notes
                            <textarea
                              aria-label="Workspace notes"
                              maxLength={20000}
                              rows={6}
                              value={noteDraft}
                              onChange={(event) =>
                                setNoteDraft(event.target.value)
                              }
                              placeholder="Your trading plan, observations and review notes�"
                            />
                          </label>
                        ) : (
                          <p
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {notes}
                          </p>
                        )}
                        <div className="workspace-note-actions">
                          {!notes || editingNotes ? (
                            <button className="button primary" type="submit">
                              <Save size={15} /> Save notes
                            </button>
                          ) : (
                            <button
                              className="button secondary"
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                setEditingNotes(true);
                              }}
                            >
                              <Pencil size={15} /> Edit notes
                            </button>
                          )}
                          {notes && (
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm("Delete your workspace notes?")
                                )
                                  void saveNotes(true);
                              }}
                            >
                              <Trash2 size={15} /> Delete notes
                            </button>
                          )}
                        </div>
                        <small>
                          Saved privately to your account. Removing an
                          instrument keeps these notes.
                        </small>
                      </fieldset>
                    </form>
                  </div>
                </section>,
              ]
            : []),
        ]}
      </WorkspaceCanvas>
    </div>
  );
}

function WorkspaceCanvas({
  children,
  enabled,
  layout,
  saving,
  onSave,
}: {
  children: ReactElement[];
  enabled: boolean;
  layout: WorkspacePosition[];
  saving: boolean;
  onSave: (next: WorkspacePosition[]) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const desktop = enabled && mounted && width >= 720;
  function persist(next: Layout) {
    onSave(next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
  }
  const ordered = [...children].sort((a, b) => {
    const x = layout.find((p) => p.i === String(a.key)),
      y = layout.find((p) => p.i === String(b.key));
    return (x?.y || 0) - (y?.y || 0) || (x?.x || 0) - (y?.x || 0);
  });
  return (
    <div
      ref={containerRef}
      className="workspace-canvas"
      data-testid="workspace-canvas"
    >
      {desktop ? (
        <GridLayout
          width={width}
          compactor={canvasCompactor}
          layout={layout.map((p) => ({ ...p, minW: 4, minH: 8, maxH: 40 }))}
          gridConfig={{
            cols: 12,
            rowHeight: 30,
            margin: [12, 12],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: !saving,
            bounded: true,
            handle: ".workspace-widget-handle",
            cancel: "button,input,select,textarea,a",
          }}
          resizeConfig={{ enabled: !saving, handles: ["se"] }}
          onDragStop={persist}
          onResizeStop={persist}
        >
          {children}
        </GridLayout>
      ) : (
        <div className="workspace-stack">{ordered}</div>
      )}
    </div>
  );
}
