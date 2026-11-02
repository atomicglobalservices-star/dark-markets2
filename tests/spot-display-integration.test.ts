import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../lib/db";
import { normaliseGold } from "../lib/feeds/additional-providers";
const isolated = /^\/dark_essential_test_\d+$/.test(
  new URL(process.env.DATABASE_URL || "postgres://localhost/unconfigured")
    .pathname,
);
test(
  "website spot display is authenticated, cache-only and isolated from native quotes",
  { skip: !isolated },
  async () => {
    const key = "evaluation:goldapi",
      previous = await db.snapshot.findUnique({ where: { key } });
    const password = randomBytes(20).toString("hex"),
      base = process.env.APP_URL!;
    const user = await db.user.create({
      data: {
        email: `spot-${randomBytes(8).toString("hex")}@example.test`,
        name: "Isolated spot test",
        passwordHash: await hash(password, 12),
        verified: true,
        plan: "STANDARD",
        trialEndsAt: new Date(Date.now() + 3600000),
      },
    });
    try {
      const time = new Date(Date.now() - 120000).toISOString();
      const q = normaliseGold(
        {
          name: "Gold",
          symbol: "XAU",
          currency: "USD",
          price: 1234,
          updatedAt: time,
        },
        "XAU",
        new Date().toISOString(),
        1,
      );
      await db.snapshot.upsert({
        where: { key },
        create: { key, status: "evaluation", content: { quotes: [q] } },
        update: { content: { quotes: [q] } },
      });
      const login = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      });
      assert.equal(login.status, 200);
      const headers = {
        Cookie: login.headers.get("set-cookie")!.split(";")[0],
      };
      for (let n = 0; n < 2; n++) {
        const response = await fetch(base + "/api/markets", { headers });
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.spotReferences.length, 1);
        assert.equal(data.spotReferences[0].status, "stale");
        assert.equal(data.spotReferences[0].asOf, time);
        assert.equal(data.spotReferences[0].relatedWidget, "FX_IDC:XAUUSD");
        assert.equal(data.spotReferences[0].price, 1234);
        assert.ok(
          data.quotes.every(
            (r: any) => !["goldapi", "biquote"].includes(r.provider),
          ),
        );
      }
      const stored = await db.snapshot.findUniqueOrThrow({ where: { key } });
      assert.deepEqual((stored.content as any).quotes, [q]);
      const anonymous = await (await fetch(base + "/api/markets")).json();
      assert.equal(anonymous.spotReferences, undefined);
      assert.equal(
        (await fetch(base + "/api/markets/provider-evaluation", { headers }))
          .status,
        403,
      );
      assert.equal(
        (await fetch(base + "/api/markets/mt5/health", { headers })).status,
        404,
      );
    } finally {
      if (previous)
        await db.snapshot.update({
          where: { key },
          data: { content: previous.content!, status: previous.status },
        });
      else await db.snapshot.deleteMany({ where: { key } });
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  },
);
