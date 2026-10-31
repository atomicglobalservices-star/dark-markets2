import { notFound } from "next/navigation";
import { Terminal } from "../terminal";
const pages = [
  "dashboard",
  "markets",
  "watchlist",
  "intelligence",
  "news",
  "calendar",
  "alerts",
  "comparisons",
  "account",
  "admin",
  "pricing",
  "features",
  "faq",
  "contact",
  "privacy",
  "terms",
  "disclosures",
  "login",
  "register",
  "verify",
  "forgot-password",
  "reset-password",
];
export function generateStaticParams() {
  return pages.map((page) => ({ page }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  return {
    title: page.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!pages.includes(page)) notFound();
  return <Terminal page={page} />;
}
