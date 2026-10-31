import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "DARK MARKETS | Global market intelligence",
    template: "%s | DARK MARKETS",
  },
  description:
    "One world. Every market. Intelligent information. Multi-market research by DARK SYSTEMS. Market information only.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
