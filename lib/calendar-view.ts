import type { EconomicEvent } from "./content-adapters";
export function countryLabel(region: string) {
  try {
    return /^[A-Z]{2}$/.test(region)
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(region) || region
      : region;
  } catch {
    return region;
  }
}
export function calendarOptions(events: EconomicEvent[]) {
  return {
    countries: [...new Set(events.map((e) => e.region))].sort((a, b) =>
      countryLabel(a).localeCompare(countryLabel(b)),
    ),
    currencies: [
      ...new Set(events.map((e) => e.currency).filter((c): c is string => !!c)),
    ].sort(),
    unknownCurrency: events.some((e) => !e.currency),
  };
}
export function calendarRows(
  events: EconomicEvent[],
  filters: { country: string; currency: string; impact: string; date: string },
) {
  return events.filter(
    (e) =>
      (!filters.country || e.region === filters.country) &&
      (!filters.currency ||
        (filters.currency === "__unknown"
          ? !e.currency
          : e.currency === filters.currency)) &&
      (!filters.impact ||
        (filters.impact === "__unknown"
          ? !e.impact
          : e.impact === filters.impact)) &&
      (!filters.date || e.date === filters.date),
  );
}

// No values are inferred from release dates, forecasts, adjacent releases or missing fields.
export function publishedCalendarFigures(
  event: EconomicEvent,
  now = Date.now(),
) {
  const today = new Date(now).toISOString().slice(0, 10);
  const releaseDay = event.dateWindowEnd || event.date;
  const knownTime = !!event.time && !event.tentative && !event.dateWindowEnd;
  const afterRelease =
    releaseDay < today ||
    (releaseDay === today &&
      (knownTime
        ? Date.parse(event.date + "T" + event.time + ":00Z") <= now
        : ["released", "published"].includes(event.sourceStatus || "")));
  return (["previous", "forecast", "actual"] as const).flatMap((key) => {
    const value = event[key];
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" &&
        (!value.trim() ||
          /^(n\/?a|not available|pending|[-\u2014])$/i.test(value.trim())))
    )
      return [];
    const evidence = event.figureEvidence?.[key];
    if (
      evidence?.availability &&
      !["available", "published", "verified"].includes(evidence.availability)
    )
      return [];
    if (
      key === "previous" &&
      event.provider === "financecalendar" &&
      (!evidence?.evidence ||
        !/^(official(?:[_-].*)?|verified|primary_source)$/.test(
          evidence.evidence,
        ))
    )
      return [];
    if (key === "actual" && !afterRelease) return [];
    return [{ key, value, unit: event.unit || "" }];
  });
}

export function highImpactBrief(events: EconomicEvent[], now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10),
    yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  return events
    .filter(
      (e) =>
        e.impact === "High" &&
        e.sourceStatus !== "cancelled" &&
        ((e.dateWindowEnd || e.date) >= today ||
          (e.date >= yesterday &&
            publishedCalendarFigures(e, now).some((f) => f.key === "actual"))),
    )
    .sort((a, b) => {
      const aPast = a.date < today,
        bPast = b.date < today;
      return (
        Number(aPast) - Number(bPast) ||
        (aPast
          ? b.date.localeCompare(a.date)
          : (a.date + (a.time || "23:59")).localeCompare(
              b.date + (b.time || "23:59"),
            ))
      );
    })
    .slice(0, 3);
}
