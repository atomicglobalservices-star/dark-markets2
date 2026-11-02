"use client";
import { useState } from "react";
import FinanceCalendarEmbed from "./finance-calendar-embed";
import { CalendarDays, RotateCcw } from "lucide-react";
import type { EconomicEvent } from "@/lib/content-adapters";
import {
  calendarOptions,
  publishedCalendarFigures,
  calendarRows,
  countryLabel,
} from "@/lib/calendar-view";
export default function CalendarSchedule({
  events,
  status,
}: {
  events: EconomicEvent[];
  status: string;
}) {
  const [view, setView] = useState<"native" | "official">("native");
  const [country, setCountry] = useState(""),
    [currency, setCurrency] = useState(""),
    [impact, setImpact] = useState(""),
    [date, setDate] = useState("");
  const options = calendarOptions(events),
    rows = calendarRows(events, { country, currency, impact, date });
  const active = !!(country || currency || impact || date);
  return (
    <section
      className="panel calendar-schedule"
      data-testid="calendar-schedule"
    >
      <header className="calendar-heading">
        <div>
          <h2>
            <CalendarDays size={18} /> Economic events
          </h2>
          <p>
            {view === "native"
              ? `${rows.length} events - All times UTC${status === "demonstration" ? " - Sample schedule, not actual events" : ""}`
              : "Official provider display - next 14 days - UTC"}
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => setView(view === "native" ? "official" : "native")}
        >
          {view === "native" ? "Show official widget" : "Show native calendar"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={!active}
          onClick={() => {
            setCountry("");
            setCurrency("");
            setImpact("");
            setDate("");
          }}
        >
          <RotateCcw size={14} /> Clear filters
        </button>
      </header>
      <div className="calendar-filters">
        <label>
          Country / region
          <select
            aria-label="Filter calendar country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">All countries / regions</option>
            {options.countries.map((c) => (
              <option key={c} value={c}>
                {countryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        {view === "native" && (
          <>
            <label>
              Currency
              <select
                aria-label="Filter calendar currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="">All currencies</option>
                {options.currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {options.unknownCurrency && (
                  <option value="__unknown">Unspecified currency</option>
                )}
              </select>
            </label>
          </>
        )}
        <label>
          Importance
          <select
            aria-label="Filter calendar importance"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
          >
            <option value="">All importance</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
            {events.some((e) => !e.impact) && (
              <option value="__unknown">Unspecified importance</option>
            )}
          </select>
        </label>
        {view === "native" && (
          <>
            <label>
              Date
              <input
                aria-label="Filter calendar date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {view === "official" ? (
        <FinanceCalendarEmbed
          countries={country ? [country] : []}
          impact={impact}
        />
      ) : (
        <div className="calendar-event-list" role="list">
          {!rows.length && (
            <p className="empty">
              {events.length
                ? "No events match these filters."
                : "No calendar events available."}
            </p>
          )}
          {rows.map((event) => (
            <article
              role="listitem"
              className="calendar-event"
              key={event.id}
              data-event-country={event.region}
              data-event-currency={event.currency || ""}
            >
              <div className="calendar-event-time">
                <strong>
                  {event.tentative || !event.time ? "Unconfirmed" : event.time}
                </strong>
                <time dateTime={event.date}>{event.date}</time>
                <small>UTC{event.dateWindowEnd ? " - Date window" : ""}</small>
              </div>
              <div className="calendar-event-main">
                <div className="calendar-event-title">
                  <h3>{event.title}</h3>
                  <span
                    className={
                      "impact " + (event.impact || "unknown").toLowerCase()
                    }
                  >
                    {event.impact || "Unspecified"}
                  </span>
                </div>
                <div className="calendar-event-meta">
                  <span>{countryLabel(event.region)}</span>
                  {event.currency && <span>{event.currency}</span>}
                  {event.url.startsWith("https://") && (
                    <a
                      href={event.url}
                      title={event.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {event.source}
                    </a>
                  )}
                  {event.dataStale && <span>Schedule may be outdated</span>}
                </div>
                <details className="calendar-event-details">
                  <summary>Event details</summary>
                  {publishedCalendarFigures(event).length ? (
                    <div className="calendar-values">
                      {publishedCalendarFigures(event).map((figure) => (
                        <div key={figure.key}>
                          <span>{figure.key}</span>
                          <strong>
                            {figure.value}
                            {figure.unit ? " " + figure.unit : ""}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="calendar-figures-empty">
                      No verified figures published by this source for this
                      event.
                    </p>
                  )}
                  {(event.tentative || !event.time) && (
                    <p>Time not confirmed by the source.</p>
                  )}
                  {event.dateWindowEnd && (
                    <p>
                      Date window: {event.dateWindowStart || event.date} to{" "}
                      {event.dateWindowEnd}
                    </p>
                  )}
                  {event.sourceStatus && (
                    <p>Schedule status: {event.sourceStatus}</p>
                  )}
                  {event.lastVerifiedAt && (
                    <p>Last verified: {event.lastVerifiedAt}</p>
                  )}
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
