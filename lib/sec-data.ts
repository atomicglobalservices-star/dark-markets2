export const secCompanies: Record<string, string> = {
  AAPL: "0000320193",
  NVDA: "0001045810",
  MSFT: "0000789019",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  META: "0001326801",
  TSLA: "0001318605",
  JPM: "0000019617",
  V: "0001403161",
  WMT: "0000104169",
};
export type SecFact = {
  concept: string;
  label: string;
  taxonomy: string;
  unit: string;
  value: number;
  start: string | null;
  end: string;
  filed: string;
  form: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  accession: string;
  frame: string | null;
  sourceUrl: string;
};
export const metricConcepts = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ],
  netIncome: ["NetIncomeLoss"],
  assets: ["Assets"],
  liabilities: ["Liabilities"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
};
export function filingUrl(cik: string, accession: string, document?: string) {
  if (!/^\d{10}$/.test(cik) || !/^\d{10}-\d{2}-\d{6}$/.test(accession))
    throw new Error("Invalid filing identity");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${document ? encodeURIComponent(document) : accession + "-index.html"}`;
}
export function parseSubmissions(raw: any, symbol: string, cik: string) {
  if (
    String(raw.cik).padStart(10, "0") !== cik ||
    !Array.isArray(raw.tickers) ||
    !raw.tickers.includes(symbol) ||
    typeof raw.name !== "string"
  )
    throw new Error("SEC company identity mismatch");
  const recent = raw.filings?.recent;
  if (!recent || !Array.isArray(recent.accessionNumber))
    throw new Error("Missing SEC filing records");
  const filings = recent.accessionNumber
    .slice(0, 100)
    .map((accession: string, j: number) => ({
      accession,
      form: recent.form[j],
      filed: recent.filingDate[j],
      reportDate: recent.reportDate[j] || null,
      url: filingUrl(cik, accession, recent.primaryDocument?.[j]),
    }));
  const signature = filings
    .filter((f: any) => /^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(f.form))
    .slice(0, 10)
    .map((f: any) => f.accession)
    .join(",");
  return { cik, symbol, name: raw.name, filings, signature };
}
export function parseCompanyFacts(
  raw: any,
  cik: string,
): Record<keyof typeof metricConcepts, SecFact[]> {
  if (String(raw.cik).padStart(10, "0") !== cik)
    throw new Error("SEC facts identity mismatch");
  const output = {} as Record<keyof typeof metricConcepts, SecFact[]>;
  for (const [metric, concepts] of Object.entries(metricConcepts)) {
    const rows: SecFact[] = [];
    for (const concept of concepts) {
      const data = raw.facts?.["us-gaap"]?.[concept];
      if (!data) continue;
      for (const [unit, observations] of Object.entries(data.units || {}) as [
        string,
        any[],
      ][]) {
        if (!Array.isArray(observations)) throw new Error("Invalid SEC units");
        for (const r of observations) {
          if (
            !/^(10-K|10-Q)(\/A)?$/.test(r.form) ||
            typeof r.val !== "number" ||
            !Number.isFinite(r.val)
          )
            continue;
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(r.end) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(r.filed)
          )
            throw new Error("Invalid SEC period");
          rows.push({
            concept,
            label: data.label || concept,
            taxonomy: "us-gaap",
            unit,
            value: r.val,
            start: r.start || null,
            end: r.end,
            filed: r.filed,
            form: r.form,
            fiscalYear: Number.isInteger(r.fy) ? r.fy : null,
            fiscalPeriod: r.fp || null,
            accession: r.accn,
            frame: r.frame || null,
            sourceUrl: filingUrl(cik, r.accn),
          });
        }
      }
    }
    const unique = new Map(
      rows.map((r) => [
        [r.concept, r.unit, r.start, r.end, r.accession, r.frame].join(":"),
        r,
      ]),
    );
    output[metric as keyof typeof metricConcepts] = [...unique.values()]
      .sort(
        (a, b) => b.filed.localeCompare(a.filed) || b.end.localeCompare(a.end),
      )
      .slice(0, 250);
  }
  return output;
}
export function periodKind(f: SecFact) {
  if (!f.start) return "instant";
  const days = (Date.parse(f.end) - Date.parse(f.start)) / 86400000;
  return days >= 280 && days <= 380
    ? "annual"
    : days >= 55 && days <= 115
      ? "quarter"
      : "reported duration (may be year-to-date)";
}
