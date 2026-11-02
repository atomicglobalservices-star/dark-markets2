import { approvedPressure } from "@/lib/trend-pressure";
import { feedConfig } from "@/lib/feeds/config";
import {
  readWorkspace,
  workspaceAdd,
  workspaceWidgetUpdate,
  readWorkspaceWidgets,
  workspaceLayoutUpdate,
  readWorkspaceLayout,
  workspaceNotesUpdate,
  readWorkspaceNotes,
  workspaceUpdate,
  workspaceRemove,
  workspaceLimit,
} from "@/lib/workspace";
import { websiteSpotReferences, localFxReferences } from "@/lib/spot-display";
import { readFile } from "node:fs/promises";
import { workerHeartbeat } from "@/lib/feeds/runtime-health";
import { cachedFundamentals } from "@/lib/sec";
import {
  controlledProviders,
  providerControls,
  setProviderEnabled,
  collectionStatuses,
} from "@/lib/collection-control";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { db } from "@/lib/db";
import {
  ApiError,
  currentUser,
  requireUser,
  createSession,
  digest,
  rateLimit,
  originCheck,
  safeUser,
} from "@/lib/auth";
import { TRIAL_MS, plans } from "@/lib/domain";
import {
  market,
  demoQuotes,
  demoNews,
  demoEvents,
  assetList,
} from "@/lib/market";
import { generateReport } from "@/lib/reports";
import { nativeAnalysisAllowed } from "@/lib/native-policy";
import {
  additionalConfig,
  additionalSnapshots,
  collectAdditionalMarkets,
} from "@/lib/feeds/additional-collection";
import { evaluationDiagnostics } from "@/lib/evaluation-diagnostics";
import { coreMarkets, widgetRestricted } from "@/lib/core-markets";
import { sendMail } from "@/lib/mail";
import { comparison } from "@/lib/analytics";
import { filterNews, filterCalendar } from "@/lib/content-adapters";
import { contentFeed } from "@/lib/content";
import { cookies } from "next/headers";
import { engineFetch } from "@/lib/feeds/client";
import {
  instruments,
  type ProviderId,
  catalogSearch,
  resolveInstrument,
  timeframes,
} from "@/lib/feeds/types";
export const runtime = "nodejs";
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((x) => x.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
const planSchema = z.enum(["STANDARD", "PREMIUM"]);
const symbolSchema = z.enum([
  ...assetList.map((a) => a[0]),
  ...instruments.map((i) => i.symbol),
] as [string, ...string[]]);
function reportExportAllowed(content: unknown) {
  const evidence = (
    content as {
      evidence?: Record<string, { status?: string; exportAllowed?: boolean }>;
    }
  )?.evidence;
  if (
    evidence &&
    Object.values(evidence).some(
      (e) => e.status === "licensed" && e.exportAllowed !== true,
    )
  )
    return false;
  const rows = (
    content as { dataAsOf?: { exportAllowed?: boolean; status?: string }[] }
  )?.dataAsOf;
  return (
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (row) => row.status !== "demonstration" && row.exportAllowed === true,
    )
  );
}
const appUrl = () => process.env.APP_URL || "http://localhost:3000";
async function tokenMail(user: { id: string; email: string }, kind: string) {
  const raw = randomBytes(32).toString("hex");
  await db.token.create({
    data: {
      id: digest(raw),
      userId: user.id,
      kind,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await sendMail(
    user.email,
    kind === "verify"
      ? "Verify your DARK MARKETS account"
      : "Reset your DARK MARKETS password",
    `${appUrl()}/${kind === "verify" ? "verify" : "reset-password"}?token=${raw}\nThis link expires in one hour.`,
  );
}
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError(503, "Stripe is not configured");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    const method = req.method;
    if (method === "POST" && path === "billing/webhook") return webhook(req);
    if (method !== "GET") originCheck(req);
    const body =
      method === "GET"
        ? {}
        : await req.json().catch(() => {
            throw new ApiError(400, "Invalid JSON");
          });
    if (path === "health") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({
        status: "ok",
        database: "connected",
        market: process.env.MARKET_PROVIDER || "demo",
        ai: process.env.AI_PROVIDER || "deterministic",
        billing: process.env.BILLING_MODE || "test",
      });
    }
    if (method === "GET" && path === "session") {
      const user = await currentUser();
      return NextResponse.json({ user: user ? safeUser(user) : null });
    }
    if (path === "auth/register" && method === "POST") {
      const data = credentials
        .extend({ name: z.string().trim().min(2).max(80), plan: planSchema })
        .parse(body);
      await rateLimit("register:" + digest(data.email), 3, 86400000);
      if (await db.user.findUnique({ where: { email: data.email } }))
        throw new ApiError(
          409,
          "An account with this email already exists. Sign in or reset your password.",
        );
      const user = await db.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: await hash(data.password, 12),
          plan: data.plan,
          trialEndsAt: new Date(Date.now() + TRIAL_MS),
        },
      });
      await createSession(user.id);
      let mailSent = true;
      try {
        await tokenMail(user, "verify");
      } catch {
        mailSent = false;
      }
      return NextResponse.json(
        {
          user: safeUser(user),
          message: mailSent
            ? "Verification email sent. Check your inbox."
            : "Account created. Email delivery is unavailable; use resend once SMTP is configured.",
        },
        { status: 201 },
      );
    }
    if (path === "auth/login" && method === "POST") {
      const data = credentials.parse(body);
      await rateLimit("login:" + digest(data.email), 10, 900000);
      const user = await db.user.findUnique({ where: { email: data.email } });
      const valid = await compare(
        data.password,
        user?.passwordHash ||
          "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
      );
      if (!user || !valid) throw new ApiError(401, "Invalid email or password");
      await createSession(user.id);
      return NextResponse.json({ user: safeUser(user) });
    }
    if (path === "auth/logout" && method === "POST") {
      const token = (await cookies()).get("dm_session")?.value;
      if (token) await db.session.deleteMany({ where: { id: digest(token) } });
      (await cookies()).delete("dm_session");
      return NextResponse.json({ ok: true });
    }
    if (path === "auth/verify" && method === "POST") {
      const { token } = z.object({ token: z.string().length(64) }).parse(body);
      await db.$transaction(async (tx) => {
        const record = await tx.token.findUnique({
          where: { id: digest(token) },
        });
        if (
          !record ||
          record.kind !== "verify" ||
          record.expiresAt < new Date()
        )
          throw new ApiError(400, "Verification link is invalid or expired");
        await tx.token.delete({ where: { id: record.id } });
        const u = await tx.user.findUniqueOrThrow({
          where: { id: record.userId },
        });
        await tx.user.update({
          where: { id: u.id },
          data: {
            verified: true,
            ...(!u.verified
              ? { trialEndsAt: new Date(Date.now() + TRIAL_MS) }
              : {}),
          },
        });
      });
      return NextResponse.json({
        message: "Email verified. Your seven-day trial is active.",
      });
    }
    if (path === "auth/resend" && method === "POST") {
      const user = await requireUser(false, false);
      await rateLimit("resend:" + user.id, 3, 3600000);
      if (!user.verified) await tokenMail(user, "verify");
      return NextResponse.json({ message: "Verification email sent" });
    }
    if (path === "auth/forgot" && method === "POST") {
      const { email } = z
        .object({ email: z.email().transform((x) => x.toLowerCase().trim()) })
        .parse(body);
      await rateLimit("reset:" + digest(email), 3, 3600000);
      const user = await db.user.findUnique({ where: { email } });
      if (user)
        try {
          await tokenMail(user, "reset");
        } catch {
          console.error(JSON.stringify({ event: "reset_mail_failed" }));
        }
      return NextResponse.json({
        message: "If this account exists, a reset email has been sent.",
      });
    }
    if (path === "auth/reset" && method === "POST") {
      const data = z
        .object({
          token: z.string().length(64),
          password: z.string().min(12).max(128),
        })
        .parse(body);
      const passwordHash = await hash(data.password, 12);
      await db.$transaction(async (tx) => {
        const record = await tx.token.findUnique({
          where: { id: digest(data.token) },
        });
        if (!record || record.kind !== "reset" || record.expiresAt < new Date())
          throw new ApiError(400, "Invalid or expired reset link");
        await tx.token.delete({ where: { id: record.id } });
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash },
        });
        await tx.session.deleteMany({ where: { userId: record.userId } });
      });
      return NextResponse.json({
        message: "Password changed. Sign in with your new password.",
      });
    }
    if (path === "fundamentals" && method === "GET") {
      await requireUser();
      const symbol = req.nextUrl.searchParams.get("symbol") || "AAPL";
      const data = await cachedFundamentals(symbol);
      return NextResponse.json(
        data || {
          status: "unavailable",
          symbol,
          error:
            "No authorised cached SEC dataset is available; page views do not collect upstream data",
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (path === "data/providers") {
      const user = await requireUser(false, false);
      if (user.role !== "ADMIN")
        throw new ApiError(403, "Administrator access required");
      if (method === "POST") {
        const change = z
          .object({
            provider: z.enum(controlledProviders),
            enabled: z.boolean(),
          })
          .parse(body);
        await setProviderEnabled(change.provider, change.enabled, user.id);
      }
      return NextResponse.json(
        {
          controls: await providerControls(),
          collections: await collectionStatuses(),
          subscriptionCostTarget: 0,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (path === "data/settings" && method === "GET") {
      await requireUser();
      const row = await db.snapshot.findUnique({
        where: { key: "control:tradingview" },
      });
      return NextResponse.json({
        tradingViewEnabled:
          (row?.content as { enabled?: boolean })?.enabled !== false,
      });
    }
    if (path === "markets/instruments" && method === "GET") {
      const list = catalogSearch(
        req.nextUrl.searchParams.get("q") || "",
        req.nextUrl.searchParams.get("category") || "",
        req.nextUrl.searchParams.get("currency") || "",
      );
      return NextResponse.json({
        instruments: list.map((i) => ({
          ...i,
          configuredProviders: Object.keys(i.mappings).filter(
            (p) => p !== "twelvedata" || !!process.env.TWELVE_DATA_API_KEY,
          ),
          note:
            i.kind === "cfd"
              ? "Broker-specific contract required"
              : !Object.keys(i.mappings).length
                ? "Mapping and authorised provider required; no live quote"
                : null,
        })),
        count: list.length,
      });
    }
    if (path === "markets/history" && method === "GET") {
      await requireUser();
      let i;
      try {
        i = resolveInstrument(req.nextUrl.searchParams.get("instrument") || "");
      } catch {
        throw new ApiError(400, "Unknown instrument");
      }
      const tf = req.nextUrl.searchParams.get("timeframe") || "1h";
      if (!Object.hasOwn(timeframes, tf))
        throw new ApiError(400, "Unsupported timeframe");
      if (process.env.MARKET_PROVIDER !== "multi")
        throw new ApiError(
          503,
          "Connected history is unavailable in demo mode",
        );
      await rateLimit("history:" + (await requireUser()).id, 60, 60000);
      const result = await engineFetch(
        `/history?instrument=${encodeURIComponent(i.id)}&timeframe=${tf}`,
      );
      if (!result.ok)
        throw new ApiError(
          503,
          "Historical data unavailable for this instrument; no substitute used",
        );
      return NextResponse.json(await result.json(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (path === "markets/health" && method === "GET") {
      const user = await requireUser(false, false);
      if (user.role !== "ADMIN")
        throw new ApiError(403, "Administrator access required");
      const result = await engineFetch("/health");
      if (!result.ok) throw new ApiError(503, "Shared engine unavailable");
      const health = await result.json();
      if (health.worker?.heartbeatAt)
        health.worker = workerHeartbeat(health.worker);
      const safeJson = async (path: string) => {
        try {
          return JSON.parse(await readFile(path, "utf8"));
        } catch {
          return null;
        }
      };
      const active = await safeJson("work/reliability/active.json");
      const directory =
        typeof active?.directory === "string" &&
        /^work\/reliability\/acceptance(-[a-z0-9]+)?$/.test(active.directory)
          ? active.directory
          : null;
      health.monitoring = {
        original: await safeJson("work/endurance/summary.json"),
        acceptance: directory
          ? await safeJson(directory + "/summary.json")
          : null,
        directory,
        maintenance: [],
      };
      try {
        health.monitoring.maintenance = (
          await readFile("work/endurance/maintenance.jsonl", "utf8")
        )
          .trim()
          .split("\n")
          .slice(-8)
          .map((line) => JSON.parse(line));
      } catch {}

      return NextResponse.json(health, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (path === "markets/stream" && method === "GET") {
      await requireUser();
      if (process.env.MARKET_PROVIDER !== "multi")
        throw new ApiError(503, "Streaming is not enabled");
      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort(), { once: true });
      // Bound stream duration so session and subscription permissions are rechecked on reconnect.
      const deadline = setTimeout(() => abort.abort(), 55000);
      let upstream: Response;
      const connectTimeout = setTimeout(() => abort.abort(), 8000);
      try {
        upstream = await engineFetch("/events", abort.signal);
      } catch {
        clearTimeout(deadline);
        throw new ApiError(503, "Shared stream unavailable");
      } finally {
        clearTimeout(connectTimeout);
      }
      if (!upstream.ok || !upstream.body) {
        clearTimeout(deadline);
        abort.abort();
        throw new ApiError(503, "Shared stream unavailable");
      }
      const reader = upstream.body.getReader();
      return new Response(
        new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                clearTimeout(deadline);
                controller.close();
              } else controller.enqueue(value);
            } catch {
              clearTimeout(deadline);
              controller.close();
            }
          },
          cancel() {
            clearTimeout(deadline);
            abort.abort();
            void reader.cancel();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "private, no-store",
            "X-Accel-Buffering": "no",
          },
        },
      );
    }
    if (path === "markets" && method === "GET") {
      if (process.env.MARKET_PROVIDER === "multi") {
        const user = await currentUser();
        if (!user)
          return NextResponse.json(
            {
              quotes: demoQuotes(),
              error:
                "Sign in with active access for connected provider data. Showing demonstration fixtures.",
            },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        await requireUser();
      }
      if (process.env.MARKET_PROVIDER === "licensed") await requireUser();
      const result = await market();
      let spotReferences: ReturnType<typeof websiteSpotReferences> = [];
      let fxReferences: ReturnType<typeof localFxReferences> = [];
      let commodityReferences: ReturnType<typeof localFxReferences> = [];
      let stockReferences: ReturnType<typeof localFxReferences> = [];
      let indexReferences: ReturnType<typeof localFxReferences> = [];
      const displayUser = await currentUser();
      if (displayUser && additionalConfig().local) {
        await requireUser();
        const snapshot = await additionalSnapshots({
          local: true,
          enabled: ["goldapi", "biquote"],
        });
        const localRequest =
          ["localhost", "127.0.0.1", "[::1]"].includes(
            new URL(req.url).hostname,
          ) &&
          ["host", "x-forwarded-host", "origin"].every((header) => {
            const value = req.headers.get(header);
            if (!value) return true;
            try {
              return ["localhost", "127.0.0.1", "[::1]"].includes(
                new URL(header === "origin" ? value : "http://" + value)
                  .hostname,
              );
            } catch {
              return false;
            }
          }) &&
          (req.headers.get("x-forwarded-for") || "127.0.0.1")
            .split(",")
            .every((ip) =>
              ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim()),
            );
        if (displayUser.role === "ADMIN" && localRequest) {
          fxReferences = localFxReferences(
            snapshot.providers.flatMap((p) => p.quotes),
          );
          commodityReferences = snapshot.providers
            .flatMap((p) => p.quotes)
            .filter(
              (q) =>
                q.provider === "biquote" &&
                q.id.startsWith(`biquote:${q.providerSymbol}:`) &&
                q.exchange === "OTC" &&
                ["USOIL", "UKOIL", "XNGUSD", "XCUUSD"].includes(
                  q.providerSymbol,
                ) &&
                q.priceType === "indicative-midpoint" &&
                q.timestampKind === "provider-quote" &&
                q.quoteCurrency === "USD" &&
                typeof q.unit === "string" &&
                q.unit.length > 0 &&
                q.bid != null &&
                q.ask != null &&
                Number.isFinite(q.bid) &&
                Number.isFinite(q.ask) &&
                q.bid > 0 &&
                q.ask >= q.bid &&
                Math.abs(q.price - (q.bid + q.ask) / 2) <=
                  Math.max(1e-8, q.price * 1e-7) &&
                Date.parse(q.asOf) <= Date.parse(q.receivedAt) + 5000 &&
                Date.parse(q.receivedAt) <= Date.now() + 5000 &&
                ["open", "closed", "unknown"].includes(q.marketState) &&
                q.publicDisplayEnabled === false &&
                q.analysisAllowed === false &&
                q.exportAllowed === false,
            );
          stockReferences = snapshot.providers
            .flatMap((p) => p.quotes)
            .filter(
              (q) =>
                q.provider === "biquote" &&
                ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "TSLA"].includes(
                  q.providerSymbol,
                ) &&
                q.id.startsWith(`biquote:${q.providerSymbol}:`) &&
                q.priceType === "indicative-midpoint" &&
                q.timestampKind === "provider-quote" &&
                q.quoteCurrency === "USD" &&
                typeof q.unit === "string" &&
                q.unit.length > 0 &&
                q.bid != null &&
                q.ask != null &&
                Number.isFinite(q.bid) &&
                Number.isFinite(q.ask) &&
                q.bid > 0 &&
                q.ask >= q.bid &&
                Math.abs(q.price - (q.bid + q.ask) / 2) <=
                  Math.max(1e-8, q.price * 1e-7) &&
                Date.parse(q.asOf) <= Date.parse(q.receivedAt) + 5000 &&
                Date.parse(q.receivedAt) <= Date.now() + 5000 &&
                ["open", "closed", "unknown"].includes(q.marketState) &&
                q.publicDisplayEnabled === false &&
                q.analysisAllowed === false &&
                q.exportAllowed === false,
            );
          // DE30 describes Germany 30: do not treat it as a verified DAX 40 contract.
          indexReferences = snapshot.providers
            .flatMap((p) => p.quotes)
            .filter(
              (q) =>
                q.provider === "biquote" &&
                ["US500", "NAS100", "US30", "UK100", "JP225"].includes(
                  q.providerSymbol,
                ) &&
                q.id.startsWith(`biquote:${q.providerSymbol}:`) &&
                q.exchange === "INDEX" &&
                q.priceType === "indicative-midpoint" &&
                q.timestampKind === "provider-quote" &&
                q.quoteCurrency === "USD" &&
                typeof q.unit === "string" &&
                q.unit.length > 0 &&
                q.bid != null &&
                q.ask != null &&
                Number.isFinite(q.bid) &&
                Number.isFinite(q.ask) &&
                q.bid > 0 &&
                q.ask >= q.bid &&
                Math.abs(q.price - (q.bid + q.ask) / 2) <=
                  Math.max(1e-8, q.price * 1e-7) &&
                Date.parse(q.asOf) <= Date.parse(q.receivedAt) + 5000 &&
                Date.parse(q.receivedAt) <= Date.now() + 5000 &&
                ["open", "closed", "unknown"].includes(q.marketState) &&
                q.publicDisplayEnabled === false &&
                q.analysisAllowed === false &&
                q.exportAllowed === false,
            );
        }
        spotReferences = websiteSpotReferences(
          snapshot.providers.flatMap((p) => p.quotes),
        );
      }
      return NextResponse.json(
        {
          ...result,
          spotReferences,
          fxReferences,
          commodityReferences,
          stockReferences,
          indexReferences,
        },
        {
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    if (
      path === "markets/provider-evaluation" &&
      ["GET", "POST"].includes(method)
    ) {
      const user = await requireUser(false, false);
      if (user.role !== "ADMIN")
        throw new ApiError(403, "Administrator access required");
      for (const header of ["host", "x-forwarded-host", "origin"]) {
        const value = req.headers.get(header);
        if (value) {
          try {
            const hostname = new URL(
              header === "origin" ? value : "http://" + value,
            ).hostname;
            if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
              throw new Error();
          } catch {
            throw new ApiError(403, "Local evaluation only");
          }
        }
      }
      const automatic = additionalConfig();
      if (!automatic.local) throw new ApiError(403, "Local evaluation only");
      const inspection = {
        local: true,
        enabled: ["biquote", "goldapi"] as ("biquote" | "goldapi")[],
      };
      let refreshResults: Awaited<ReturnType<typeof collectAdditionalMarkets>> =
        [];
      if (method === "POST") {
        const { provider } = z
          .object({
            provider: z.enum(["all", "biquote", "goldapi"]).default("all"),
          })
          .parse(body);
        await rateLimit("provider-evaluation-refresh:" + user.id, 3, 60000);
        refreshResults = await collectAdditionalMarkets({
          ...inspection,
          enabled: provider === "all" ? inspection.enabled : [provider],
        });
        await db.audit.create({
          data: {
            actorId: user.id,
            action: "provider.evaluation.refresh",
            detail: JSON.stringify(refreshResults),
          },
        });
      }
      const snapshot = await additionalSnapshots(inspection);
      const native = await market();
      return NextResponse.json(
        {
          ...snapshot,
          automaticCollectionEnabled: automatic.enabled,
          manualRefreshAvailable: true,
          refreshResults,
          coreDiagnostics: evaluationDiagnostics(
            snapshot.providers.flatMap((p) => p.quotes),
            automatic.enabled,
            native.quotes.map((q) => q.instrumentId || q.symbol),
          ),
          rights: {
            goldapi:
              "Commercial operated-website display of correctly labelled spot references is expressly permitted by Gold API terms §9. This view does not enable subscriber use, analysis, bulk export or raw-feed redistribution. Copper units remain unverified.",
            biquote:
              "Paid in-product display is conditional on upstream rights. Broker/source identities and exact contracts remain unresolved; subscriber-facing Biquote quotes stay disabled.",
          },
        },
        {
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    if (path === "markets/core" && method === "GET") {
      await requireUser();
      const { quotes, error } = await market();
      return NextResponse.json(
        {
          scope: process.env.MARKET_DATA_SCOPE || "local",
          error,
          instruments: coreMarkets.map((core) => {
            const native =
              quotes.find(
                (q) =>
                  q.instrumentId === core.id && q.status !== "demonstration",
              ) || null;
            return {
              ...core,
              native,
              nativeStatus: native?.status || "unavailable",
              analysisAvailable: !!native && nativeAnalysisAllowed(native, 26),
              visualOnly: !native,
              widgetAvailability: widgetRestricted(core.widget)
                ? "vendor-restricted when checked 2026-11-01"
                : "vendor-dependent; not native data",
            };
          }),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (path === "comparisons" && method === "GET") {
      await requireUser(true);
      const left = symbolSchema.parse(req.nextUrl.searchParams.get("left")),
        right = symbolSchema.parse(req.nextUrl.searchParams.get("right"));
      if (left === right)
        throw new ApiError(400, "Choose two different assets");
      const { quotes } = await market();
      const a = quotes.find((q) => q.symbol === left),
        b = quotes.find((q) => q.symbol === right);
      if (!a || !b) throw new ApiError(503, "Asset unavailable from provider");
      if (
        !nativeAnalysisAllowed(a, 26) ||
        !nativeAnalysisAllowed(b, 26) ||
        a.history.length < 26 ||
        b.history.length < 26
      )
        throw new ApiError(
          503,
          "Fresh same-source history is required for comparisons",
        );
      return NextResponse.json(comparison(a, b));
    }
    if (path === "config" && method === "GET")
      return NextResponse.json({
        billing: process.env.BILLING_MODE || "disabled",
        ai: process.env.AI_PROVIDER || "deterministic",
        market: process.env.MARKET_PROVIDER || "demo",
      });
    if (path === "news" && method === "GET") {
      await requireUser();
      const feed = await contentFeed("news");
      return NextResponse.json({
        ...feed,
        articles: filterNews(
          feed.items,
          req.nextUrl.searchParams.get("q") || "",
          req.nextUrl.searchParams.get("category") || "",
          req.nextUrl.searchParams.get("symbol") || "",
        ),
      });
    }
    if (path === "calendar" && method === "GET") {
      await requireUser();
      const feed = await contentFeed("calendar");
      return NextResponse.json({
        ...feed,
        events: filterCalendar(
          feed.items,
          req.nextUrl.searchParams.get("country") || "",
          req.nextUrl.searchParams.get("currency") || "",
          req.nextUrl.searchParams.get("importance") || "",
          req.nextUrl.searchParams.get("date") || "",
        ),
        timezone: "UTC",
      });
    }
    if (path === "workspace/pressure" && method === "GET") {
      const user = await requireUser(true);
      await rateLimit("pressure:" + user.id, 60, 60000);
      const unavailable = () =>
        NextResponse.json(
          { available: false, message: "Insufficient approved market data" },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      if (process.env.MARKET_PROVIDER !== "multi") return unavailable();
      const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";
      if (!Object.hasOwn(timeframes, timeframe)) return unavailable();
      let instrument;
      try {
        instrument = resolveInstrument(
          req.nextUrl.searchParams.get("instrument") || "",
        );
      } catch {
        return unavailable();
      }
      const config = feedConfig();
      try {
        const response = await engineFetch(
          `/history?instrument=${encodeURIComponent(instrument.id)}&timeframe=${timeframe}`,
        );
        if (!response.ok) return unavailable();
        const result = approvedPressure(
          await response.json(),
          {
            instrumentId: instrument.id,
            timeframe,
            quoteCurrency: instrument.quote,
            seconds: timeframes[timeframe as keyof typeof timeframes],
          },
          (provider) =>
            ["coinbase", "kraken", "binance", "twelvedata"].includes(
              provider,
            ) &&
            config.allowed(provider as ProviderId, "display") &&
            config.allowed(provider as ProviderId, "analysis"),
        );
        return result
          ? NextResponse.json(
              { available: true, ...result, scope: config.scope },
              { headers: { "Cache-Control": "private, no-store" } },
            )
          : unavailable();
      } catch {
        return unavailable();
      }
    }
    if (
      path === "workspace" &&
      ["GET", "POST", "PATCH", "DELETE"].includes(method)
    ) {
      const user = await requireUser(false, false);
      const headers = { "Cache-Control": "private, no-store" };
      if (method === "GET")
        return NextResponse.json(
          {
            items: readWorkspace(user.preferences),
            notes: readWorkspaceNotes(user.preferences),
            layout: readWorkspaceLayout(user.preferences),
            widgets: readWorkspaceWidgets(user.preferences),
          },
          { headers },
        );
      await rateLimit("workspace:" + user.id, 60, 60000);
      if (method === "PATCH" && Object.hasOwn(body, "widget")) {
        await requireUser(true);
        const { widget: patch } = workspaceWidgetUpdate.parse(body);
        const widgets = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
          const current = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { preferences: true },
          });
          const widgets = readWorkspaceWidgets(current.preferences);
          if (patch.id) {
            const index = widgets.findIndex((w) => w.id === patch.id);
            if (index < 0)
              throw new ApiError(404, "Workspace widget not found");
            if (patch.type && patch.type !== widgets[index].type)
              throw new ApiError(400, "Widget type cannot change");
            widgets[index] = {
              ...widgets[index],
              settings: { ...widgets[index].settings, ...patch.settings },
              ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
            };
          } else {
            if (!patch.type) throw new ApiError(400, "Choose a widget type");
            if (widgets.length >= 200)
              throw new ApiError(400, "Workspace widget limit reached");
            widgets.push({
              id: "widget-" + crypto.randomUUID(),
              type: patch.type,
              settings: patch.settings || {},
              hidden: false,
            });
          }
          await tx.$executeRaw`UPDATE "User" SET preferences=jsonb_set(preferences,'{workspaceWidgets}',${JSON.stringify(widgets)}::jsonb,true) WHERE id=${user.id}`;
          return widgets;
        });
        return NextResponse.json({ widgets }, { headers });
      }
      if (method === "PATCH" && Object.hasOwn(body, "workspaceLayout")) {
        await requireUser(true);
        const { workspaceLayout } = workspaceLayoutUpdate.parse(body);
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
          const current = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { preferences: true },
          });
          const allowed = new Set([
            ...readWorkspace(current.preferences).map(
              (item) => item.instrumentId,
            ),
            "workspace-notes",
            ...readWorkspaceWidgets(current.preferences).map((w) => w.id),
          ]);
          if (workspaceLayout.some((p) => !allowed.has(p.i)))
            throw new ApiError(400, "Unknown workspace widget");
          const retained = workspaceLayout.length
            ? readWorkspaceLayout(current.preferences).filter(
                (p) =>
                  readWorkspaceWidgets(current.preferences).some(
                    (w) => w.id === p.i && w.hidden,
                  ) && !workspaceLayout.some((n) => n.i === p.i),
              )
            : [];
          await tx.$executeRaw`UPDATE "User" SET preferences=jsonb_set(preferences,'{workspaceLayout}',${JSON.stringify([...workspaceLayout, ...retained])}::jsonb,true) WHERE id=${user.id}`;
        });
        return NextResponse.json({ layout: workspaceLayout }, { headers });
      }
      if (method === "PATCH" && Object.hasOwn(body, "workspaceNotes")) {
        const { workspaceNotes } = workspaceNotesUpdate.parse(body);
        await db.$executeRaw`UPDATE "User" SET preferences=jsonb_set(preferences,'{workspaceNotes}',${JSON.stringify(workspaceNotes)}::jsonb,true) WHERE id=${user.id}`;
        return NextResponse.json({ notes: workspaceNotes }, { headers });
      }
      const input =
        method === "POST"
          ? workspaceAdd.parse(body)
          : method === "PATCH"
            ? workspaceUpdate.parse(body)
            : workspaceRemove.parse(body);
      const items = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { preferences: true },
        });
        const items = readWorkspace(current.preferences);
        const index = items.findIndex(
          (item) => item.instrumentId === input.instrumentId,
        );
        if (method === "POST" && index < 0) {
          if (items.length >= workspaceLimit)
            throw new ApiError(400, "Workspace limit reached");
          items.push({
            instrumentId: input.instrumentId,
            timeframe: "1h",
            notes: "",
            updatedAt: new Date().toISOString(),
          });
        }
        if (method === "PATCH") {
          if (index < 0)
            throw new ApiError(404, "Workspace instrument not found");
          const patch = workspaceUpdate.parse(input);
          items[index] = {
            ...items[index],
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(patch.timeframe ? { timeframe: patch.timeframe } : {}),
            updatedAt: new Date().toISOString(),
          };
        }
        if (method === "DELETE" && index >= 0) items.splice(index, 1);
        await tx.$executeRaw`UPDATE "User" SET preferences=preferences || ${JSON.stringify({ workspace: items, workspaceNotes: readWorkspaceNotes(current.preferences) })}::jsonb WHERE id=${user.id}`;
        return items;
      });
      return NextResponse.json({ items }, { headers });
    }
    if (path === "watchlist") {
      const user = await requireUser();
      if (method === "GET")
        return NextResponse.json(
          await db.watchlist.findMany({ where: { userId: user.id } }),
        );
      const { symbol } = z.object({ symbol: symbolSchema }).parse(body);
      if (method === "DELETE")
        await db.watchlist.deleteMany({ where: { userId: user.id, symbol } });
      else {
        const count = await db.watchlist.count({ where: { userId: user.id } });
        if (count >= 100) throw new ApiError(400, "Watchlist limit is 100");
        await db.watchlist.upsert({
          where: { userId_symbol: { userId: user.id, symbol } },
          create: { userId: user.id, symbol },
          update: {},
        });
      }
      return NextResponse.json({ ok: true });
    }
    if (path === "alerts") {
      const user = await requireUser();
      if (method === "GET")
        return NextResponse.json(
          await db.alert.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
          }),
        );
      if (method === "DELETE") {
        const { id } = z.object({ id: z.string() }).parse(body);
        await db.alert.deleteMany({ where: { id, userId: user.id } });
      } else {
        const data = z
          .object({
            symbol: symbolSchema,
            kind: z.enum([
              "price_above",
              "price_below",
              "change",
              "volume",
              "volatility",
              "asset_news",
              "economic_event",
            ]),
            eventId: z.string().max(100).optional(),
            threshold: z.number().positive().max(1e12),
            email: z.boolean().default(false),
          })
          .parse(body);
        if (data.kind === "economic_event" && !data.eventId)
          throw new ApiError(400, "Select an economic event");
        if (!["asset_news", "economic_event"].includes(data.kind)) {
          const { quotes } = await market();
          const quote = quotes.find((q) => q.symbol === data.symbol);
          if (
            !quote ||
            !nativeAnalysisAllowed(
              quote,
              ["price_above", "price_below"].includes(data.kind) ? 0 : 26,
            )
          )
            throw new ApiError(
              503,
              "Fresh native data and analysis permission are required for this alert",
            );
        }
        if ((await db.alert.count({ where: { userId: user.id } })) >= 100)
          throw new ApiError(400, "Alert limit is 100");
        await db.alert.create({ data: { ...data, userId: user.id } });
      }
      return NextResponse.json({ ok: true });
    }
    if (path === "notifications") {
      const user = await requireUser(false, false);
      if (method === "GET")
        return NextResponse.json(
          await db.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
        );
      await db.notification.updateMany({
        where: { userId: user.id },
        data: { read: true },
      });
      return NextResponse.json({ ok: true });
    }
    if (path === "reports") {
      const user = await requireUser(method === "POST");
      if (method === "GET")
        return NextResponse.json(
          (
            await db.report.findMany({
              where: { OR: [{ userId: user.id }, { userId: null }] },
              orderBy: { generatedAt: "desc" },
              take: 50,
            })
          ).filter((report) => {
            const rows = (report.content as any)?.dataAsOf;
            return (
              Array.isArray(rows) &&
              rows.length > 0 &&
              rows.every((row) => row.status !== "demonstration")
            );
          }),
        );
      const { question, symbols } = z
        .object({
          question: z.string().trim().min(5).max(500),
          symbols: z.array(symbolSchema).max(10).optional(),
        })
        .parse(body);
      await rateLimit("research:" + user.id, 20, 86400000);
      const report = await generateReport(question, symbols);
      return NextResponse.json(
        await db.report.create({
          data: { userId: user.id, title: question, question, ...report },
        }),
      );
    }
    if (path === "reports/download" && method === "GET") {
      const user = await requireUser(true);
      const id = req.nextUrl.searchParams.get("id") || "";
      const report = await db.report.findFirst({
        where: { id, OR: [{ userId: user.id }, { userId: null }] },
      });
      if (!report) throw new ApiError(404, "Report not found");
      if (!reportExportAllowed(report.content))
        throw new ApiError(
          403,
          "Provider export permissions are not configured for this report",
        );
      return new NextResponse(JSON.stringify(report, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="dark-markets-report.json"',
        },
      });
    }
    if (path === "account") {
      const user = await requireUser(false, false);
      if (method === "GET")
        return NextResponse.json({
          user: safeUser(user),
          invoices: await db.invoice.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
          }),
        });
      if (method === "DELETE") {
        const { password } = z.object({ password: z.string() }).parse(body);
        if (!(await compare(password, user.passwordHash)))
          throw new ApiError(403, "Incorrect password");
        if (user.subscriptionId)
          await stripe().subscriptions.cancel(user.subscriptionId);
        await db.user.delete({ where: { id: user.id } });
        (await cookies()).delete("dm_session");
        return NextResponse.json({ ok: true });
      }
      const { name } = z
        .object({ name: z.string().trim().min(2).max(80) })
        .parse(body);
      return NextResponse.json(
        safeUser(
          await db.user.update({ where: { id: user.id }, data: { name } }),
        ),
      );
    }
    if (path === "account/export" && method === "GET") {
      const u = await requireUser(false, false);
      const [watchlist, alerts, reports, invoices, notifications, support] =
        await Promise.all([
          db.watchlist.findMany({ where: { userId: u.id } }),
          db.alert.findMany({ where: { userId: u.id } }),
          db.report.findMany({ where: { userId: u.id } }),
          db.invoice.findMany({ where: { userId: u.id } }),
          db.notification.findMany({ where: { userId: u.id } }),
          db.support.findMany({ where: { userId: u.id } }),
        ]);
      return new NextResponse(
        JSON.stringify({
          user: safeUser(u),
          watchlist,
          alerts,
          reports: reports.map((r) =>
            reportExportAllowed(r.content)
              ? r
              : {
                  ...r,
                  content: {
                    notice:
                      "Market content omitted: provider export permission not configured",
                  },
                },
          ),
          invoices,
          notifications,
          support,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              'attachment; filename="dark-markets-export.json"',
          },
        },
      );
    }
    if (path === "preferences" && method === "POST") {
      const user = await requireUser(true);
      const preferences = z
        .object({
          widgets: z
            .array(z.enum(["chart", "markets", "news", "calendar", "reports"]))
            .min(1)
            .max(5),
          category: z.string().max(30),
          newsCategory: z.string().max(30).optional(),
        })
        .parse(body);
      if (new Set(preferences.widgets).size !== preferences.widgets.length)
        throw new ApiError(400, "Duplicate widgets");
      await db.$executeRaw`UPDATE "User" SET preferences=preferences || ${JSON.stringify(preferences)}::jsonb WHERE id=${user.id}`;
      return NextResponse.json({ ok: true });
    }
    if (path === "support" && method === "POST") {
      const user = await requireUser(false, false);
      await rateLimit("support:" + user.id, 5, 3600000);
      const { message } = z
        .object({ message: z.string().trim().min(10).max(4000) })
        .parse(body);
      await db.support.create({ data: { userId: user.id, message } });
      return NextResponse.json({
        message:
          "Support request saved. You can follow up with your account email.",
      });
    }
    if (path === "billing/checkout" && method === "POST") {
      const user = await requireUser(false, false);
      if (!user.verified) throw new ApiError(403, "Verify your email first");
      const { plan, authorize } = z
        .object({ plan: planSchema, authorize: z.literal(true) })
        .parse(body);
      if (process.env.BILLING_MODE !== "stripe") {
        if (process.env.BILLING_MODE !== "test")
          throw new ApiError(503, "Billing disabled");
        await db.$transaction([
          db.user.update({
            where: { id: user.id },
            data: {
              plan,
              status: "active",
              subscriptionEndsAt: new Date(Date.now() + 30 * 86400000),
            },
          }),
          db.invoice.create({
            data: {
              userId: user.id,
              amount: plans[plan].price * 100,
              status: "test_paid",
              provider: "local-test",
            },
          }),
        ]);
        return NextResponse.json({
          message: "Test subscription activated. No money was charged.",
        });
      }
      const client = stripe();
      const price =
        plan === "PREMIUM"
          ? process.env.STRIPE_PREMIUM_PRICE_ID
          : process.env.STRIPE_STANDARD_PRICE_ID;
      if (!price) throw new ApiError(503, "Price ID not configured");
      if (user.subscriptionId)
        throw new ApiError(
          400,
          "Use the billing portal to change an existing subscription",
        );
      const session = await client.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.id,
        ...(user.customerId
          ? { customer: user.customerId }
          : { customer_email: user.email }),
        metadata: { userId: user.id, plan },
        subscription_data: { metadata: { userId: user.id, plan } },
        success_url: appUrl() + "/account?checkout=success",
        cancel_url: appUrl() + "/account",
      });
      return NextResponse.json({ url: session.url });
    }
    if (path === "billing/portal" && method === "POST") {
      const user = await requireUser(false, false);
      if (!user.customerId)
        throw new ApiError(400, "No Stripe billing account yet");
      const session = await stripe().billingPortal.sessions.create({
        customer: user.customerId,
        return_url: appUrl() + "/account",
      });
      return NextResponse.json({ url: session.url });
    }
    if (path === "billing/cancel" && method === "POST") {
      const user = await requireUser(false, false);
      if (user.subscriptionId)
        await stripe().subscriptions.update(user.subscriptionId, {
          cancel_at_period_end: true,
        });
      await db.user.update({
        where: { id: user.id },
        data: {
          status: "canceled",
          ...(user.status === "trialing"
            ? { subscriptionEndsAt: user.trialEndsAt }
            : {}),
        },
      });
      return NextResponse.json({
        message: "Canceled. Access remains until your current period ends.",
      });
    }
    if (path === "admin" && method === "GET") {
      const user = await requireUser(false, false);
      if (user.role !== "ADMIN")
        throw new ApiError(403, "Administrator access required");
      const [users, trials, standard, premium, reports, jobs, support, audit] =
        await Promise.all([
          db.user.count(),
          db.user.count({
            where: { status: "trialing", trialEndsAt: { gt: new Date() } },
          }),
          db.user.count({
            where: {
              plan: "STANDARD",
              status: "active",
              subscriptionEndsAt: { gt: new Date() },
            },
          }),
          db.user.count({
            where: {
              plan: "PREMIUM",
              status: "active",
              subscriptionEndsAt: { gt: new Date() },
            },
          }),
          db.report.count(),
          db.job.findMany(),
          db.support.findMany({
            include: { user: { select: { email: true } } },
            take: 50,
            orderBy: { createdAt: "desc" },
          }),
          db.audit.findMany({ take: 30, orderBy: { createdAt: "desc" } }),
        ]);
      return NextResponse.json({
        users,
        trials,
        standard,
        premium,
        mrr:
          process.env.BILLING_MODE === "stripe"
            ? standard * 10 + premium * 19
            : 0,
        testMrr: standard * 10 + premium * 19,
        reports,
        jobs,
        support,
        audit,
        providers: {
          market: process.env.MARKET_PROVIDER || "demo",
          ai: process.env.AI_PROVIDER || "deterministic",
          billing: process.env.BILLING_MODE || "disabled",
        },
        costs:
          "External provider costs unavailable until metered provider integrations are configured.",
      });
    }
    if (path === "admin/support" && method === "POST") {
      const user = await requireUser(false, false);
      if (user.role !== "ADMIN")
        throw new ApiError(403, "Administrator access required");
      const { id, status } = z
        .object({ id: z.string(), status: z.enum(["open", "resolved"]) })
        .parse(body);
      await db.$transaction([
        db.support.update({ where: { id }, data: { status } }),
        db.audit.create({
          data: {
            actorId: user.id,
            action: "support.status",
            detail: JSON.stringify({ id, status }),
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof ApiError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    console.error(
      JSON.stringify({
        event: "api_error",
        type: error instanceof Error ? error.name : "unknown",
      }),
    );
    return NextResponse.json(
      { error: "Service unavailable. Please try again." },
      { status: 503 },
    );
  }
}
async function webhook(req: NextRequest) {
  try {
    const client = stripe();
    const signature = req.headers.get("stripe-signature");
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET)
      throw new Error("Missing signature configuration");
    const event = client.webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
    await db.$transaction(async (tx) => {
      if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return;
      if (event.type === "checkout.session.completed") {
        const s = event.data.object;
        if (s.client_reference_id && typeof s.customer === "string")
          await tx.user.update({
            where: { id: s.client_reference_id },
            data: {
              customerId: s.customer,
              subscriptionId:
                typeof s.subscription === "string" ? s.subscription : null,
            },
          });
      }
      if (
        [
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ].includes(event.type)
      ) {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata.userId;
        const priceId = sub.items.data[0]?.price.id;
        const plan =
          priceId === process.env.STRIPE_PREMIUM_PRICE_ID
            ? "PREMIUM"
            : priceId === process.env.STRIPE_STANDARD_PRICE_ID
              ? "STANDARD"
              : null;
        if (!userId || !plan)
          throw new Error("Unknown subscription ownership or price");
        const ends = sub.items.data[0]?.current_period_end;
        await tx.user.update({
          where: { id: userId },
          data: {
            subscriptionId: sub.id,
            customerId:
              typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            plan,
            status: sub.cancel_at_period_end ? "canceled" : sub.status,
            subscriptionEndsAt: ends ? new Date(ends * 1000) : null,
          },
        });
      }
      if (
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.paid"
      ) {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : "";
        const user = await tx.user.findUnique({ where: { customerId } });
        if (user) {
          await tx.invoice.create({
            data: {
              userId: user.id,
              amount: invoice.amount_paid,
              status: event.type === "invoice.paid" ? "paid" : "failed",
              provider: "stripe",
            },
          });
          if (event.type === "invoice.payment_failed")
            await tx.user.update({
              where: { id: user.id },
              data: { status: "past_due" },
            });
        }
      }
      await tx.webhookEvent.create({ data: { id: event.id } });
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook verification or processing failed" },
      { status: 400 },
    );
  }
}
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const PATCH = handler;
