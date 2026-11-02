"use client";
export default function FinanceCalendarEmbed({
  countries = [],
  impact = "",
}: {
  countries?: string[];
  impact?: string;
}) {
  const query = new URLSearchParams({
    country: [...countries].sort().join(","),
    impact: impact.toLowerCase(),
  });
  return (
    <div
      className="finance-calendar-embed"
      data-testid="official-calendar-embed"
    >
      <p className="muted">
        Official Finance Calendar display - UTC. Figures depend on provider
        coverage; this visual widget does not supply DARK MARKETS analysis or AI
        data.
      </p>
      <iframe
        title="Finance Calendar official widget"
        src={"/calendar/embed?" + query}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
      <a
        href="https://www.financecalendar.com/widget/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Finance Calendar - widget information and attribution
      </a>
    </div>
  );
}
