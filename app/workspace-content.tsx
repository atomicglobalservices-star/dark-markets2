"use client";
import { useEffect, useState } from "react";
import { publishedCalendarFigures } from "@/lib/calendar-view";
import type { Article, EconomicEvent } from "@/lib/content-adapters";
import {
  workspaceNews,
  workspaceCalendar,
  workspaceTopics,
} from "@/lib/workspace-content";
function Source({ url, label }: { url: string; label: string }) {
  return url.startsWith("https://") ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {label} - Open source
    </a>
  ) : (
    <span>{label}</span>
  );
}
function Time({ value }: { value: string }) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? (
    <time dateTime={value}>
      {new Date(time).toLocaleString(undefined, { timeZone: "UTC" })} UTC
    </time>
  ) : (
    <span>Timestamp unavailable</span>
  );
}
export default function WorkspaceContent({
  kind,
  ids,
  articles,
  events,
  newsStatus,
  calendarStatus,
}: {
  kind: "news" | "calendar";
  ids: string[];
  articles: Article[];
  events: EconomicEvent[];
  newsStatus: string;
  calendarStatus: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const selected = workspaceTopics(ids).selected;
  const news =
    newsStatus === "demonstration" ? [] : workspaceNews(articles, ids, now);
  const calendar =
    calendarStatus === "demonstration"
      ? []
      : workspaceCalendar(events, ids, now);
  return (
    <div
      className="workspace-content-feed"
      data-testid={"workspace-" + kind + "-feed"}
    >
      <p className="muted">
        {selected.length
          ? "Relevant to " + selected.map((i) => i.name).join(", ")
          : "Add a Market Chart or an instrument from Markets to select your interests."}
      </p>
      {kind === "calendar" && (
        <small>
          Times in UTC. Currency/economy relevance; not instrument-specific
          announcements.
        </small>
      )}
      {!(kind === "news" ? news : calendar).length && (
        <p className="workspace-content-empty">
          {kind === "news"
            ? "No relevant headlines available."
            : "No upcoming relevant economic events available."}
        </p>
      )}
      {kind === "news" &&
        news.map((article) => (
          <details key={article.id} className="workspace-content-item">
            <summary>
              <strong>{article.title}</strong>
              <small>
                {article.source} - <Time value={article.publishedAt} />
                {article.freshness === "historical" ? " - Historical" : ""}
              </small>
            </summary>
            <p>
              {article.summary || "No further details supplied by the source."}
            </p>
            {article.verification && <small>{article.verification}</small>}
            {article.attribution && <p>{article.attribution}</p>}
            <Source url={article.url} label={article.source} />
          </details>
        ))}
      {kind === "calendar" &&
        calendar.map((event) => (
          <details key={event.id} className="workspace-content-item">
            <summary>
              <strong>{event.title}</strong>
              <small>
                {event.dateWindowEnd
                  ? `${event.dateWindowStart || event.date} to ${event.dateWindowEnd} - date window`
                  : event.date}{" "}
                -{" "}
                {event.tentative || !event.time
                  ? "Time not confirmed"
                  : event.time + " UTC"}{" "}
                - {event.currency || event.region}
                {event.impact ? " - " + event.impact + " impact" : ""}
                {event.dataStale ? " - Source data stale" : ""}
              </small>
            </summary>
            <p>
              {event.region} - {event.sourceStatus || "Recorded schedule"}
            </p>
            <dl>
              {publishedCalendarFigures(event, now).map((figure) => (
                <div key={figure.key}>
                  <dt>{figure.key}</dt>
                  <dd>
                    {String(figure.value)} {figure.unit}
                  </dd>
                </div>
              ))}
            </dl>
            {!publishedCalendarFigures(event, now).length && (
              <p>
                No verified figures published by this source for this event.
              </p>
            )}
            {event.lastVerifiedAt && (
              <p>
                Last source verification: <Time value={event.lastVerifiedAt} />
              </p>
            )}
            <Source url={event.url} label={event.source} />
          </details>
        ))}
    </div>
  );
}
