import type { Instrument } from "./feeds/types";

// Schedule guidance only, never evidence of a live feed or a final closing trade.
// FX convention: https://www.oanda.com/us-en/trading/hours-of-operation/
export function directorySession(
  category: string,
  symbol: string,
  now = Date.now(),
  reportedSession?: string,
) {
  if (category === "Crypto") return "24/7 market";
  if (/^closed$/i.test(reportedSession || "")) return "MARKET CLOSED";
  if (/^open$/i.test(reportedSession || "")) return "MARKET OPEN";
  const zone =
    category === "Forex"
      ? "America/New_York"
      : ["Stocks", "ETFs"].includes(category)
        ? "America/New_York"
        : category === "Indices"
          ? symbol.startsWith("XETR:")
            ? "Europe/Berlin"
            : symbol.includes("UKX")
              ? "Europe/London"
              : symbol.includes("NI225") || symbol.includes("NKY")
                ? "Asia/Tokyo"
                : "America/New_York"
          : null;
  if (!zone) return "Session unconfirmed — venue/broker schedule applies";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  const weekend =
    category === "Forex"
      ? p.weekday === "Sat" ||
        (p.weekday === "Fri" && minutes >= 17 * 60) ||
        (p.weekday === "Sun" && minutes < 17 * 60)
      : ["Sat", "Sun"].includes(p.weekday);
  return weekend
    ? "MARKET CLOSED — weekend (usual market schedule)"
    : "Session unconfirmed — venue/broker schedule applies";
}
export const venueCalendar: Record<string, string> = {
  NASDAQ: "nyse",
  NYSE: "nyse",
  LSE: "lse",
  TSE: "tse",
  XETR: "xetra",
};
export function sessionAllows(
  instrument: Instrument,
  rows: any[],
  now = Date.now(),
) {
  if (instrument.category === "Crypto") return true;
  const row = rows.find(
    (r) => r.exchange === venueCalendar[instrument.venue || ""],
  );
  if (
    !row ||
    !row.tz ||
    !row.session?.open ||
    !row.session?.close ||
    now - Date.parse(row.collectedAt) > 65 * 60000
  )
    return false;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: row.tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(now))
        .map((p) => [p.type, p.value]),
    );
    const date = parts.year + "-" + parts.month + "-" + parts.day;
    if (
      ["Sat", "Sun"].includes(parts.weekday) ||
      date !== String(row.local_time).slice(0, 10)
    )
      return false;
    if (row.holiday_today && !/early/i.test(row.label || "")) return false;
    const time = parts.hour + ":" + parts.minute,
      open = String(row.session.open).slice(0, 5),
      close = String(row.session.close).slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close))
      return false;
    if (
      (row.session.break || []).some(
        (b: any) => Array.isArray(b) && time >= b[0] && time < b[1],
      )
    )
      return false;
    return time >= open && time < close;
  } catch {
    return false;
  }
}
