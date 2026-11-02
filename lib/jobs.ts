import { collectFundamentals } from "./sec";
import { db } from "./db";
import { nativeAnalysisAllowed } from "./native-policy";
import { isCoreNative } from "./core-markets";
import { collectAdditionalMarkets } from "./feeds/additional-collection";
import { market } from "./market";
import { generateReport } from "./reports";
import { triggers, entitlement } from "./domain";
import { sendMail } from "./mail";
import {
  contentFeed,
  ingest,
  type Article,
  type EconomicEvent,
} from "./content";
export const intervals: Record<string, number> = {
  market: 60000,
  fundamentals: 3600000,
  alerts: 60000,
  reports: 86400000,
  weekly: 604800000,
  email: 15000,
  news: 3600000,
  calendar: 3600000,
  trials: 3600000,
  cleanup: 86400000,
};
export async function setupJobs() {
  for (const kind of Object.keys(intervals))
    await db.job.upsert({
      where: { id: kind },
      create: { id: kind, kind },
      update: {},
    });
}
export async function tick() {
  const due = await db.job.findMany({
    where: {
      runAt: { lte: new Date() },
      OR: [
        { status: { not: "running" } },
        { lockedAt: { lt: new Date(Date.now() - 300000) } },
      ],
    },
  });
  for (const job of due) {
    const claim = await db.job.updateMany({
      where: { id: job.id, updatedAt: job.updatedAt },
      data: { status: "running", lockedAt: new Date() },
    });
    if (!claim.count) continue;
    let jobWarning: string | null = null;
    try {
      if (job.kind === "fundamentals") await collectFundamentals();
      if (job.kind === "news" || job.kind === "calendar")
        await ingest(job.kind);
      if (job.kind === "market") {
        const result = await market();
        if (
          result.error &&
          !result.quotes.some(
            (q) => q.status === "realtime" || q.status === "delayed",
          )
        )
          throw new Error(result.error);
        jobWarning = result.error;
        await collectAdditionalMarkets();
      }
      if (job.kind === "reports" || job.kind === "weekly") {
        const snapshot = await market();
        const quotes = snapshot.quotes.filter(
          (q) => isCoreNative(q) && nativeAnalysisAllowed(q, 26),
        );
        const groups = quotes.length
          ? ["Global", ...new Set(quotes.map((q) => q.category))]
          : [];
        for (const group of groups) {
          const report = await generateReport(
            undefined,
            group === "Global"
              ? undefined
              : quotes.filter((q) => q.category === group).map((q) => q.symbol),
          );
          await db.report.create({
            data: {
              title:
                (job.kind === "weekly" ? "Weekly " : "Daily ") +
                group +
                " market briefing",
              ...report,
            },
          });
        }
      }
      if (job.kind === "alerts") {
        const { quotes } = await market();
        const alerts = await db.alert.findMany({
          where: { triggeredAt: null },
          include: { user: true },
        });
        for (const a of alerts) {
          if (!entitlement(a.user)) continue;
          const quote = quotes.find((q) => q.symbol === a.symbol);
          const news =
            a.kind === "asset_news" ? await contentFeed("news") : null;
          const calendar =
            a.kind === "economic_event" ? await contentFeed("calendar") : null;
          const article = news?.items.find((n) =>
            (n as Article).symbols?.includes(a.symbol),
          ) as Article | undefined;
          const event = calendar?.items.find((e) => e.id === a.eventId) as
            EconomicEvent | undefined;
          const untilEvent = event
            ? Date.parse(event.date + "T" + event.time + ":00Z") - Date.now()
            : -1;
          const special =
            a.kind === "asset_news"
              ? !!article
              : a.kind === "economic_event"
                ? !!event &&
                  !event.dataStale &&
                  !event.tentative &&
                  untilEvent >= 0 &&
                  untilEvent <= a.threshold * 3600000
                : false;
          if (
            !quote ||
            (!special &&
              !nativeAnalysisAllowed(
                quote,
                ["price_above", "price_below"].includes(a.kind) ? 0 : 26,
              )) ||
            (!special && !triggers(a.kind, a.threshold, quote))
          )
            continue;
          const title =
            a.kind === "asset_news"
              ? `${news?.status === "demonstration" ? "DEMO: " : ""}${a.symbol} story: ${article?.title} — ${article?.source}`
              : a.kind === "economic_event"
                ? `${calendar?.status === "demonstration" ? "DEMO: " : ""}${event?.title} at ${event?.date} ${event?.time} UTC`
                : `${quote.status === "demonstration" ? "DEMO: " : ""}${a.symbol} ${a.kind.replaceAll("_", " ")} ${a.threshold} — ${quote.quoteCurrency || "USD"} · ${quote.source} · observation ${quote.asOf}`;
          await db.$transaction(async (tx) => {
            const claim = await tx.alert.updateMany({
              where: { id: a.id, triggeredAt: null },
              data: { triggeredAt: new Date() },
            });
            if (claim.count) {
              await tx.notification.create({
                data: { userId: a.userId, title },
              });
              if (a.email)
                await tx.outbox.create({
                  data: {
                    userId: a.userId,
                    to: a.user.email,
                    subject: "DARK MARKETS alert",
                    text: title,
                  },
                });
            }
          });
        }
      }
      if (job.kind === "trials") {
        const users = await db.user.findMany({
          where: {
            status: "trialing",
            verified: true,
            trialEndsAt: { lt: new Date(Date.now() + 86400000) },
          },
        });
        for (const u of users) {
          const title =
            u.trialEndsAt < new Date()
              ? "Your trial has ended. Choose a subscription to restore access."
              : "Your trial ends within 24 hours. No automatic payment will be taken.";
          await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`;
            if (
              !(await tx.notification.findFirst({
                where: { userId: u.id, title },
              }))
            ) {
              await tx.notification.create({ data: { userId: u.id, title } });
              await tx.outbox.create({
                data: {
                  userId: u.id,
                  to: u.email,
                  subject: "Your DARK MARKETS trial",
                  text: title,
                },
              });
            }
            if (u.trialEndsAt < new Date())
              await tx.user.update({
                where: { id: u.id },
                data: { status: "expired" },
              });
          });
        }
      }
      if (job.kind === "email") {
        const pending = await db.outbox.findMany({
          where: { status: "pending", runAt: { lte: new Date() } },
          take: 50,
        });
        for (const mail of pending) {
          try {
            await sendMail(mail.to, mail.subject, mail.text);
            await db.outbox.update({
              where: { id: mail.id },
              data: { status: "sent", sentAt: new Date() },
            });
          } catch {
            await db.outbox.update({
              where: { id: mail.id },
              data: {
                attempts: { increment: 1 },
                runAt: new Date(
                  Date.now() +
                    Math.min(3600000, 30000 * 2 ** Math.min(mail.attempts, 7)),
                ),
              },
            });
            throw new Error(
              "Email delivery failed; pending messages will retry",
            );
          }
        }
      }
      if (job.kind === "cleanup") {
        await db.session.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        await db.token.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.rateLimit.deleteMany({
          where: { resetsAt: { lt: new Date() } },
        });
      }
      await db.job.update({
        where: { id: job.id },
        data: {
          status: jobWarning ? "degraded" : "healthy",
          attempts: 0,
          error: jobWarning,
          lockedAt: null,
          runAt: new Date(Date.now() + intervals[job.kind]),
        },
      });
    } catch (error) {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "failing",
          attempts: { increment: 1 },
          error: error instanceof Error ? error.message : "Unknown failure",
          lockedAt: null,
          runAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          ),
        },
      });
      console.error(JSON.stringify({ event: "job_failed", kind: job.kind }));
    }
  }
}
