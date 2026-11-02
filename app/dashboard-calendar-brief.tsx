"use client";
import Link from "next/link";
import { CalendarDays, ArrowUpRight } from "lucide-react";
import type { Article, EconomicEvent } from "@/lib/content-adapters";
import {
  highImpactBrief,
  publishedCalendarFigures,
  countryLabel,
} from "@/lib/calendar-view";
export default function DashboardCalendarBrief({
  events,
  news,
  calendarStatus,
  newsStatus,
}: {
  events: EconomicEvent[];
  news: Article[];
  calendarStatus: string;
  newsStatus: string;
}) {
  const now = Date.now();
  const releases =
    calendarStatus === "demonstration" ? [] : highImpactBrief(events, now);
  const headlines =
    newsStatus === "demonstration"
      ? []
      : news
          .filter(
            (a) =>
              a.breaking === true &&
              Date.parse(a.publishedAt) <= now + 60000 &&
              Date.parse(a.publishedAt) >= now - 86400000,
          )
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
          .slice(0, 2);
  return (
    <div data-testid="dashboard-impact-brief">
      <div className="panel-heading">
        <h3>
          <CalendarDays size={16} /> High-impact updates
        </h3>
        <Link href="/calendar" aria-label="View economic calendar">
          <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="dashboard-impact-body">
        <h4>Economic releases</h4>
        {!releases.length && (
          <p className="muted">No high-impact economic updates available.</p>
        )}
        {releases.map((event) => {
          const figures = publishedCalendarFigures(event, now),
            released = figures.some((f) => f.key === "actual");
          return (
            <article className="dashboard-impact-item" key={event.id}>
              <div>
                <span className="impact high">High</span>
                <small>
                  {released
                    ? "Published result"
                    : event.time &&
                        !event.tentative &&
                        Date.parse(event.date + "T" + event.time + ":00Z") <=
                          now
                      ? "Awaiting result"
                      : "Scheduled release"}
                </small>
              </div>
              <h4>{event.title}</h4>
              <p>
                {countryLabel(event.region)}
                {event.currency ? " - " + event.currency : ""} -{" "}
                {event.dateWindowEnd
                  ? `${event.dateWindowStart || event.date} to ${event.dateWindowEnd}`
                  : event.date}{" "}
                -{" "}
                {event.tentative || !event.time
                  ? "Time not confirmed"
                  : event.time + " UTC"}
              </p>
              {figures.length > 0 && (
                <p>
                  {figures
                    .map(
                      (f) =>
                        f.key + ": " + f.value + (f.unit ? " " + f.unit : ""),
                    )
                    .join(" / ")}
                </p>
              )}
              {event.dataStale && <small>Schedule may be outdated.</small>}
              <a href={event.url} target="_blank" rel="noopener noreferrer">
                Release details <ArrowUpRight size={11} />
              </a>
            </article>
          );
        })}
        <p className="dashboard-calendar-credit">
          <a
            href="https://www.financecalendar.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Finance Calendar
          </a>{" "}
          - UTC
        </p>
        <h4>Latest breaking headlines</h4>
        {!headlines.length && (
          <p className="muted">
            No recent breaking headlines flagged by the source.
          </p>
        )}
        {headlines.map((article) => (
          <article className="dashboard-impact-item" key={article.id}>
            <h4>{article.title}</h4>
            {article.summary && (
              <p>
                {article.summary.length > 180
                  ? article.summary.slice(0, 177) + "..."
                  : article.summary}
              </p>
            )}
            <small>
              {new Date(article.publishedAt).toLocaleString(undefined, {
                timeZone: "UTC",
              })}{" "}
              UTC
            </small>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.source} - Read headline <ArrowUpRight size={11} />
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
