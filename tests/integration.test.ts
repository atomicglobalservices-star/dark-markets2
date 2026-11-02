import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { POST } from "../app/api/[...path]/route";
import { tick, setupJobs } from "../lib/jobs";
const base = process.env.APP_URL || "http://localhost:3000";
const email = `integration-${Date.now()}@example.test`,
  otherEmail = `other-${Date.now()}@example.test`;
const password = "Test-password-12345";
let cookie = "",
  otherCookie = "";
let userId = "";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
  origin = base,
) {
  const response = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function mailToken(to: string, kind: "verify" | "reset-password") {
  const messages = await (
    await fetch("http://localhost:8025/api/v1/messages")
  ).json();
  const found = messages.messages.find((m: any) =>
    m.To.some((t: any) => t.Address === to),
  );
  assert.ok(
    found,
    "Verification/reset email must be delivered to the local catcher",
  );
  const message = await (
    await fetch("http://localhost:8025/api/v1/message/" + found.ID)
  ).json();
  const match = message.Text.match(
    new RegExp("/" + kind + "\\?token=([a-f0-9]{64})"),
  );
  assert.ok(match);
  return match[1];
}
test("customer journey and authorization against PostgreSQL + HTTP + local SMTP", async (t) => {
  try {
    await t.test(
      "health, public market fixtures and unauthenticated denial",
      async () => {
        assert.equal((await request("health")).status, 200);
        assert.equal(
          (await request("markets")).data.quotes[0].status,
          "demonstration",
        );
        assert.equal((await request("watchlist")).status, 401);
      },
    );
    await t.test(
      "registration creates a no-card Premium trial and gates unverified accounts",
      async () => {
        const r = await request("auth/register", "POST", {
          name: "Integration User",
          email,
          password,
          plan: "PREMIUM",
        });
        assert.equal(r.status, 201);
        cookie = r.cookie;
        userId = r.data.user.id;
        assert.equal(r.data.user.status, "trialing");
        assert.equal(r.data.user.access, false);
        assert.equal((await request("reports")).status, 403);
        assert.equal(
          (
            await request("auth/register", "POST", {
              name: "Duplicate",
              email,
              password,
              plan: "STANDARD",
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "email verification is delivered, single-use and activates seven full days",
      async () => {
        const token = await mailToken(email, "verify");
        assert.equal(
          (await request("auth/verify", "POST", { token })).status,
          200,
        );
        assert.equal(
          (await request("auth/verify", "POST", { token })).status,
          400,
        );
        const u = (await request("session")).data.user;
        assert.ok(u.premium);
        assert.ok(
          Date.parse(u.trialEndsAt) - Date.now() > 7 * 86400000 - 10000,
        );
      },
    );
    await t.test(
      "watchlists persist and another account cannot read them",
      async () => {
        assert.equal(
          (await request("watchlist", "POST", { symbol: "BTC" })).status,
          200,
        );
        assert.equal((await request("watchlist")).data[0].symbol, "BTC");
        const r = await request(
          "auth/register",
          "POST",
          { name: "Other User", email: otherEmail, password, plan: "STANDARD" },
          "",
        );
        assert.equal(r.status, 201);
        otherCookie = r.cookie;
        const token = await mailToken(otherEmail, "verify");
        assert.equal(
          (await request("auth/verify", "POST", { token }, otherCookie)).status,
          200,
        );
        assert.equal(
          (await request("watchlist", "GET", undefined, otherCookie)).data
            .length,
          0,
        );
        assert.equal(
          (
            await request(
              "reports",
              "POST",
              { question: "Compare the supplied observations" },
              otherCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "preferences",
              "POST",
              { widgets: ["chart"], category: "Crypto" },
              otherCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "comparisons?left=BTC&right=ETH",
              "GET",
              undefined,
              otherCookie,
            )
          ).status,
          403,
        );
        const c = await request("comparisons?left=BTC&right=ETH");
        assert.equal(c.status, 200);
        assert.equal(c.data.series[0].BTC, 0);
      },
    );
    await t.test(
      "Premium report includes evidence, is private and downloadable",
      async () => {
        const r = await request("reports", "POST", {
          question: "Describe the Bitcoin fixture observations",
          symbols: ["BTC"],
        });
        assert.equal(r.status, 200);
        const evidence = r.data.content.dataAsOf[0];
        if (evidence.status === "demonstration")
          assert.equal(r.data.content.facts[0].price, 67432.8);
        else {
          assert.ok(r.data.content.facts[0].price > 0);
          assert.ok(evidence.source);
          assert.ok(Number.isFinite(Date.parse(evidence.timestamp)));
        }
        assert.equal(r.data.provider, "deterministic");
        assert.ok(
          !(await request("reports", "GET", undefined, otherCookie)).data.some(
            (x: any) => x.id === r.data.id,
          ),
        );
        assert.equal(
          (
            await request(
              "reports/download?id=" + r.data.id,
              "GET",
              undefined,
              otherCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (await request("reports/download?id=" + r.data.id)).status,
          evidence.exportAllowed === false ? 403 : 200,
        );
      },
    );
    await t.test(
      "alerts persist and worker produces one deduplicated notification",
      async () => {
        const currentNews = await request("news");
        const hasStory = currentNews.data.articles.some((n: any) =>
          n.symbols.includes("BTC"),
        );
        await request("alerts", "POST", {
          symbol: "BTC",
          kind: "price_above",
          threshold: 1,
          email: true,
        });
        await request("alerts", "POST", {
          symbol: "BTC",
          kind: "asset_news",
          threshold: 1,
          email: false,
        });
        await setupJobs();
        await db.job.update({
          where: { id: "alerts" },
          data: { runAt: new Date(0) },
        });
        await tick();
        await db.job.update({
          where: { id: "alerts" },
          data: { runAt: new Date(0) },
        });
        await tick();
        const n = (await request("notifications")).data.filter((n: any) =>
          n.title.includes("BTC"),
        );
        assert.equal(n.length, hasStory ? 2 : 1);
        assert.equal(
          n.filter((x: any) => x.title.includes("price above")).length,
          1,
        );
        if (hasStory && currentNews.data.status === "demonstration")
          assert.ok(
            n.some((x: any) => /DEMO/.test(x.title)),
            "Educational news remains demo labelled",
          );
        else
          assert.ok(
            n.some((x: any) => x.title.includes("price above")),
            "Real price alert is delivered without fabricating a BTC news story",
          );
      },
    );
    await t.test(
      "preferences save and origin and schema checks reject invalid requests",
      async () => {
        assert.equal(
          (
            await request("preferences", "POST", {
              widgets: ["news", "chart"],
              category: "Crypto",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "watchlist",
              "POST",
              { symbol: "BTC" },
              cookie,
              "https://evil.example",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request("alerts", "POST", {
              symbol: "UNKNOWN",
              threshold: -1,
            })
          ).status,
          400,
        );
        assert.equal((await request("admin")).status, 403);
      },
    );
    await t.test(
      "exact server expiration blocks access, then explicit test checkout restores it",
      async () => {
        await db.user.update({
          where: { id: userId },
          data: { trialEndsAt: new Date(Date.now() - 1) },
        });
        assert.equal((await request("watchlist")).status, 403);
        assert.equal(
          (await request("billing/checkout", "POST", { plan: "PREMIUM" }))
            .status,
          400,
        );
        const r = await request("billing/checkout", "POST", {
          plan: "PREMIUM",
          authorize: true,
        });
        assert.equal(r.status, 200);
        assert.match(r.data.message, /No money/);
        assert.equal((await request("session")).data.user.status, "active");
        const acct = (await request("account")).data;
        assert.equal(acct.invoices[0].amount, 1900);
        assert.equal(acct.invoices[0].provider, "local-test");
      },
    );
    await t.test(
      "signed Stripe webhook synchronizes state and is idempotent",
      async () => {
        const old = {
          key: process.env.STRIPE_SECRET_KEY,
          secret: process.env.STRIPE_WEBHOOK_SECRET,
          price: process.env.STRIPE_PREMIUM_PRICE_ID,
        };
        process.env.STRIPE_SECRET_KEY = "sk_test_local_signature_verification";
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test";
        process.env.STRIPE_PREMIUM_PRICE_ID = "price_local_premium";
        try {
          const event = {
            id: "evt_" + userId,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: "sub_" + userId,
                customer: "cus_" + userId,
                metadata: { userId },
                items: {
                  data: [
                    {
                      price: { id: "price_local_premium" },
                      current_period_end:
                        Math.floor(Date.now() / 1000) + 86400 * 30,
                    },
                  ],
                },
                cancel_at_period_end: false,
                status: "active",
              },
            },
          };
          const payload = JSON.stringify(event);
          const signature = Stripe.webhooks.generateTestHeaderString({
            payload,
            secret: "whsec_local_test",
          });
          for (let i = 0; i < 2; i++) {
            const req = new NextRequest(base + "/api/billing/webhook", {
              method: "POST",
              headers: { "stripe-signature": signature },
              body: payload,
            });
            const r = await POST(req, {
              params: Promise.resolve({ path: ["billing", "webhook"] }),
            });
            assert.equal(r.status, 200);
          }
          assert.equal(
            await db.webhookEvent.count({ where: { id: event.id } }),
            1,
          );
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: userId } }))
              .customerId,
            "cus_" + userId,
          );
          await db.user.update({
            where: { id: userId },
            data: { subscriptionId: null, customerId: null },
          });
          await db.webhookEvent.delete({ where: { id: event.id } });
        } finally {
          for (const [key, value] of [
            ["STRIPE_SECRET_KEY", old.key],
            ["STRIPE_WEBHOOK_SECRET", old.secret],
            ["STRIPE_PREMIUM_PRICE_ID", old.price],
          ])
            if (value === undefined) delete process.env[key!];
            else process.env[key!] = value;
        }
      },
    );
    await t.test(
      "cancellation preserves paid access and invalid webhooks cannot change status",
      async () => {
        assert.equal((await request("billing/cancel", "POST", {})).status, 200);
        assert.equal((await request("session")).data.user.access, true);
        const r = await request("billing/webhook", "POST", {});
        assert.equal(r.status, 400);
        assert.equal((await request("session")).data.user.status, "canceled");
      },
    );
    await t.test(
      "research limit is transparent and enforced server-side",
      async () => {
        await db.rateLimit.upsert({
          where: { key: "research:" + userId },
          create: {
            key: "research:" + userId,
            count: 20,
            resetsAt: new Date(Date.now() + 86400000),
          },
          update: { count: 20, resetsAt: new Date(Date.now() + 86400000) },
        });
        assert.equal(
          (
            await request("reports", "POST", {
              question: "One more research request",
              symbols: ["BTC"],
            })
          ).status,
          429,
        );
      },
    );
    await t.test(
      "export excludes credentials and support is stored",
      async () => {
        const exp = (await request("account/export")).data;
        assert.equal(exp.user.email, email);
        assert.equal("passwordHash" in exp.user, false);
        assert.equal("sessions" in exp, false);
        assert.equal(
          (
            await request("support", "POST", {
              message: "Integration test support request",
            })
          ).status,
          200,
        );
        assert.equal(await db.support.count({ where: { userId } }), 1);
      },
    );
    await t.test(
      "password reset emails are single-use and invalidate existing sessions",
      async () => {
        assert.equal(
          (await request("auth/forgot", "POST", { email })).status,
          200,
        );
        const token = await mailToken(email, "reset-password");
        assert.equal(
          (
            await request("auth/reset", "POST", {
              token,
              password: password + "new",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request("auth/reset", "POST", {
              token,
              password: password + "new",
            })
          ).status,
          400,
        );
        assert.equal((await request("session")).data.user, null);
        assert.equal(
          (await request("auth/login", "POST", { email, password })).status,
          401,
        );
        const r = await request("auth/login", "POST", {
          email,
          password: password + "new",
        });
        assert.equal(r.status, 200);
        cookie = r.cookie;
      },
    );
    await t.test(
      "account deletion removes owned data and session",
      async () => {
        assert.equal(
          (await request("account", "DELETE", { password: password + "new" }))
            .status,
          200,
        );
        assert.equal((await request("session")).data.user, null);
        assert.equal(await db.watchlist.count({ where: { userId } }), 0);
        assert.equal(await db.report.count({ where: { userId } }), 0);
      },
    );
  } finally {
    await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await db.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { contains: userId || "not-a-real-id" } },
          { key: { contains: email } },
          { key: { contains: otherEmail } },
        ],
      },
    });
    await db.$disconnect();
  }
});
