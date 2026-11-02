import { officialCalendarCsp } from "./lib/finance-calendar-embed";
import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://s3.tradingview.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://s3.tradingview.com; frame-src 'self' https://www.tradingview-widget.com https://*.tradingview-widget.com https://s.tradingview.com https://www.tradingview.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
          },
        ],
      },
      {
        source: "/calendar/embed",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: officialCalendarCsp },
        ],
      },
    ];
  },
};
export default config;
