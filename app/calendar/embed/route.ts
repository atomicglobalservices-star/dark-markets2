import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  calendarEmbedDocument,
  officialCalendarCsp,
} from "@/lib/finance-calendar-embed";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return new Response(
      "Sign in with an active subscription to view the official calendar.",
      { status: 403 },
    );
  }
  return new Response(
    calendarEmbedDocument(
      request.nextUrl.searchParams.get("country") || "",
      request.nextUrl.searchParams.get("impact") || "",
    ),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": officialCalendarCsp,
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    },
  );
}
