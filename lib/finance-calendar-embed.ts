export const officialCalendarCsp =
  "default-src 'none'; script-src https://www.financecalendar.com/wp-json/fc/v1/widget; connect-src https://www.financecalendar.com/wp-json/fc/v1/; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
// Official widget code is loaded unchanged from the provider, never copied or parsed.
export const officialCalendarScript =
  "https://www.financecalendar.com/wp-json/fc/v1/widget";
export function calendarEmbedDocument(country = "", impact = "") {
  const countries = country
    .split(",")
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 30)
    .join(",");
  const importance = ["high", "medium", "low"].includes(impact) ? impact : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#0d1216;color:#dbe8f2;font:13px system-ui}body{padding:8px}body .fcw{color:#dbe8f2;background:#10171d;border-color:#263845}body .fcw-h{background:#142431;gap:12px;flex-wrap:wrap}body .fcw-d{background:#15202a;color:#afc7d8;border-color:#263845}body .fcw-r{border-color:#263845;grid-template-columns:52px minmax(0,1fr) auto}body .fcw-r:hover{background:#152530}body .fcw-t,body .fcw-m,body .fcw-f,body .fcw-e{color:#b4c9d9}body .fcw-n{min-width:0;overflow-wrap:anywhere}body .fcw-m{max-width:120px;overflow-wrap:anywhere}body .fcw-n a,body .fcw-f a{color:#78c9ff}body .fcw-f{border-color:#263845}a{color:#78c9ff}.attribution{font-size:11px;padding:8px 4px;line-height:1.6}@media(max-width:380px){body .fcw-r{grid-template-columns:44px minmax(0,1fr);padding:8px}body .fcw-m{grid-column:2;max-width:none}body .fcw-h{font-size:13px}}</style></head><body><div data-fc-widget data-category="economic-indicators" data-country="${countries}" data-impact="${importance}" data-days="14" data-limit="60" data-tz="Etc/UTC" data-title="Economic calendar"><p>Loading official calendar...</p></div><div data-fc-widget data-category="central-banks-monetary-policy" data-country="${countries}" data-impact="${importance}" data-days="14" data-limit="20" data-tz="Etc/UTC" data-title="Central bank decisions"><p>Loading official central bank calendar...</p></div><p class="attribution">Official visual widget by <a href="https://www.financecalendar.com/" target="_blank" rel="noopener noreferrer">Finance Calendar</a>. Figures appear only where supplied by the provider.</p><script src="${officialCalendarScript}" async></script></body></html>`;
}
