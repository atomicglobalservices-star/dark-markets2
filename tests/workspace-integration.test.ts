import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../lib/db";
const isolated = /^\/dark_essential_test_\d+$/.test(
  new URL(process.env.DATABASE_URL || "postgres://localhost/unconfigured")
    .pathname,
);
test(
  "workspace storage, authentication and two-user isolation",
  { skip: !isolated },
  async (t) => {
    const base = process.env.APP_URL!,
      password = randomBytes(24).toString("hex");
    const users = await Promise.all(
      ["A", "B"].map(async (name) =>
        db.user.create({
          data: {
            email: `workspace-${name.toLowerCase()}-${randomBytes(8).toString("hex")}@example.test`,
            name: "Workspace test " + name,
            passwordHash: await hash(password, 12),
            verified: true,
            plan: "PREMIUM",
            trialEndsAt: new Date(Date.now() + 3600000),
          },
        }),
      ),
    );
    try {
      const cookies = await Promise.all(
        users.map(async (user) => {
          const r = await fetch(base + "/api/auth/login", {
            method: "POST",
            headers: { Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, password }),
          });
          assert.equal(r.status, 200);
          return r.headers.get("set-cookie")!.split(";")[0];
        }),
      );
      const request = (
        owner: number,
        method = "GET",
        body?: unknown,
        path = "/api/workspace",
        origin = base,
      ) =>
        fetch(base + path, {
          method,
          headers: {
            Cookie: cookies[owner],
            ...(method !== "GET"
              ? { Origin: origin, "Content-Type": "application/json" }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      await t.test(
        "Premium layouts persist separately from notes and reject forged widgets",
        async () => {
          await request(0, "POST", { instrumentId: "BTC/USD" });
          const layout = [
            { i: "BTC/USD", x: 0, y: 0, w: 6, h: 12 },
            { i: "workspace-notes", x: 0, y: 12, w: 12, h: 12 },
          ];
          assert.equal(
            (await request(0, "PATCH", { workspaceLayout: layout })).status,
            200,
          );
          assert.deepEqual((await (await request(0)).json()).layout, layout);
          assert.deepEqual((await (await request(1)).json()).layout, []);
          assert.equal(
            (
              await request(0, "PATCH", {
                workspaceLayout: [{ ...layout[0], i: "unknown" }],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(0, "PATCH", {
                workspaceLayout: layout,
                userId: users[1].id,
              })
            ).status,
            400,
          );
          await db.user.update({
            where: { id: users[0].id },
            data: { plan: "BASIC" },
          });
          assert.equal(
            (await request(0, "PATCH", { workspaceLayout: [] })).status,
            403,
          );
          await db.user.update({
            where: { id: users[0].id },
            data: { plan: "PREMIUM" },
          });
          assert.equal(
            (await request(0, "PATCH", { workspaceLayout: [] })).status,
            200,
          );
          await request(0, "DELETE", { instrumentId: "BTC/USD" });
        },
      );
      await t.test(
        "typed widgets retain settings and positions on remove/restore with Premium ownership",
        async () => {
          for (const type of [
            "Market Chart",
            "Notes",
            "AI Analyst",
            "Trend Pressure",
            "Market News",
            "Economic Calendar",
            "Trading Plan",
            "Risk Calculator",
          ]) {
            const r = await request(0, "PATCH", {
              widget: {
                type,
                settings:
                  type === "Market Chart"
                    ? { instrumentId: "BTC/USD", timeframe: "15m" }
                    : { text: "Private saved data" },
              },
            });
            assert.equal(r.status, 200);
          }
          const widgets = (await (await request(0)).json()).widgets;
          const note = widgets.find(
            (w: any) => w.type === "Notes" && w.id !== "workspace-notes",
          );
          const position = { i: note.id, x: 0, y: 50, w: 6, h: 12 };
          assert.equal(
            (await request(0, "PATCH", { workspaceLayout: [position] })).status,
            200,
          );
          assert.equal(
            (
              await request(0, "PATCH", {
                widget: { id: note.id, hidden: true },
              })
            ).status,
            200,
          );
          await request(0, "PATCH", {
            workspaceLayout: [
              { i: "workspace-notes", x: 0, y: 0, w: 12, h: 12 },
            ],
          });
          const saved = await (await request(0)).json();
          assert.equal(
            saved.widgets.find((w: any) => w.id === note.id).settings.text,
            "Private saved data",
          );
          assert.deepEqual(
            saved.layout.find((p: any) => p.i === note.id),
            position,
          );
          assert.equal(
            (
              await request(1, "PATCH", {
                widget: { id: note.id, hidden: false },
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(0, "PATCH", {
                widget: { id: note.id, hidden: false },
              })
            ).status,
            200,
          );
          await db.user.update({
            where: { id: users[1].id },
            data: { plan: "BASIC" },
          });
          assert.equal(
            (await request(1, "PATCH", { widget: { type: "Notes" } })).status,
            403,
          );
          await db.user.update({
            where: { id: users[1].id },
            data: { plan: "PREMIUM" },
          });
          await db.user.update({
            where: { id: users[0].id },
            data: { preferences: {} },
          });
        },
      );
      await t.test(
        "pressure requires active Premium and never substitutes restricted instruments",
        async () => {
          assert.equal(
            (
              await fetch(
                base +
                  "/api/workspace/pressure?instrument=BTC%2FUSD&timeframe=5m",
              )
            ).status,
            401,
          );
          const restricted = await request(
            0,
            "GET",
            undefined,
            "/api/workspace/pressure?instrument=XAU%2FUSD&timeframe=5m",
          );
          assert.equal(restricted.status, 200);
          assert.equal((await restricted.json()).available, false);
          const mismatch = await request(
            0,
            "GET",
            undefined,
            "/api/workspace/pressure?instrument=FAKE&timeframe=5m",
          );
          assert.equal((await mismatch.json()).available, false);
          await db.user.update({
            where: { id: users[1].id },
            data: { plan: "STANDARD" },
          });
          assert.equal(
            (
              await request(
                1,
                "GET",
                undefined,
                "/api/workspace/pressure?instrument=BTC%2FUSD&timeframe=5m",
              )
            ).status,
            403,
          );
          await db.user.update({
            where: { id: users[1].id },
            data: { plan: "PREMIUM" },
          });
        },
      );
      await t.test(
        "official calendar embed is authenticated, isolated and attributed",
        async () => {
          assert.equal((await fetch(base + "/calendar/embed")).status, 403);
          const r = await request(
            0,
            "GET",
            undefined,
            "/calendar/embed?country=US&impact=high",
          );
          assert.equal(r.status, 200);
          assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
          assert.ok(
            r.headers
              .get("content-security-policy")
              ?.includes(
                "script-src https://www.financecalendar.com/wp-json/fc/v1/widget",
              ),
          );
          assert.ok(r.headers.get("cache-control")?.includes("no-store"));
          const html = await r.text();
          assert.ok(html.includes('data-country="US"'));
          assert.ok(html.includes('href="https://www.financecalendar.com/"'));
          assert.ok(!html.includes("postMessage"));
        },
      );
      await t.test(
        "anonymous requests and page access are denied; mutations require a valid origin",
        async () => {
          assert.equal((await fetch(base + "/api/workspace")).status, 401);
          const page = await fetch(base + "/workspace", { redirect: "manual" });
          assert.equal(page.status, 307);
          assert.ok(page.headers.get("location")!.includes("/login"));
          assert.equal(
            (
              await request(
                0,
                "POST",
                { instrumentId: "BTC/USD" },
                "/api/workspace",
                "https://invalid.example",
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "add, save and reload retain exact notes and timeframe, and duplicate add is idempotent",
        async () => {
          assert.equal(
            (await request(0, "POST", { instrumentId: "BTC/USD" })).status,
            200,
          );
          const notes =
            "<script>window.bad=true</script>\nPrivate trading plan.";
          const saved = await request(0, "PATCH", {
            instrumentId: "BTC/USD",
            timeframe: "5m",
            notes,
          });
          assert.equal(saved.status, 200);
          await request(0, "POST", { instrumentId: "BTC/USD" });
          const data = await (await request(0)).json();
          assert.equal(data.items.length, 1);
          assert.equal(data.items[0].notes, notes);
          assert.equal(data.items[0].timeframe, "5m");
        },
      );
      await t.test(
        "one account cannot access or edit another account even with a matching instrument ID",
        async () => {
          assert.deepEqual((await (await request(1)).json()).items, []);
          assert.equal(
            (
              await request(1, "PATCH", {
                instrumentId: "BTC/USD",
                notes: "attack",
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(0, "PATCH", {
                instrumentId: "BTC/USD",
                notes: "attack",
                userId: users[1].id,
              })
            ).status,
            400,
          );
          await request(1, "POST", { instrumentId: "BTC/USD" });
          await request(1, "PATCH", {
            instrumentId: "BTC/USD",
            notes: "B only",
          });
          assert.equal(
            (await (await request(0)).json()).items[0].notes,
            "<script>window.bad=true</script>\nPrivate trading plan.",
          );
          assert.equal(
            (
              await (
                await request(
                  1,
                  "GET",
                  undefined,
                  "/api/workspace?userId=" + users[0].id,
                )
              ).json()
            ).items[0].notes,
            "B only",
          );
        },
      );
      await t.test(
        "concurrent workspace and dashboard preference updates preserve both namespaces",
        async () => {
          const prefs = {
            widgets: ["markets", "news"],
            category: "Forex",
            newsCategory: "All markets",
          };
          const responses = await Promise.all([
            request(0, "PATCH", {
              instrumentId: "BTC/USD",
              notes: "Concurrent saved note",
              timeframe: "1d",
            }),
            request(0, "POST", prefs, "/api/preferences"),
            request(0, "POST", { instrumentId: "ETH/USD" }),
          ]);
          assert.ok(responses.every((r) => r.status === 200));
          const user = await db.user.findUniqueOrThrow({
            where: { id: users[0].id },
          });
          const data = await (await request(0)).json();
          assert.equal(data.items.length, 2);
          assert.equal(
            data.items.find((i: any) => i.instrumentId === "BTC/USD").notes,
            "Concurrent saved note",
          );
          assert.deepEqual((user.preferences as any).widgets, prefs.widgets);
        },
      );
      await t.test(
        "invalid instruments, timeframes and oversized notes are rejected without changing saved data",
        async () => {
          for (const [method, body] of [
            ["POST", { instrumentId: "FAKE" }],
            ["PATCH", { instrumentId: "BTC/USD", timeframe: "90h" }],
            ["PATCH", { instrumentId: "BTC/USD", notes: "x".repeat(4001) }],
          ] as const)
            assert.equal((await request(0, method, body)).status, 400);
          assert.equal(
            (await (await request(0)).json()).items.find(
              (i: any) => i.instrumentId === "BTC/USD",
            ).notes,
            "Concurrent saved note",
          );
        },
      );
      await t.test("removal affects only the signed-in owner", async () => {
        assert.equal(
          (await request(0, "DELETE", { instrumentId: "BTC/USD" })).status,
          200,
        );
        assert.ok(
          !(await (await request(0)).json()).items.some(
            (i: any) => i.instrumentId === "BTC/USD",
          ),
        );
        assert.equal(
          (await (await request(1)).json()).items[0].notes,
          "B only",
        );
      });
      await t.test(
        "private notes remain accessible after subscription expiry without unlocking quote access",
        async () => {
          await db.user.update({
            where: { id: users[0].id },
            data: { trialEndsAt: new Date(Date.now() - 10000) },
          });
          assert.equal(
            (
              await request(0, "PATCH", {
                instrumentId: "ETH/USD",
                notes: "Retain my notes",
              })
            ).status,
            200,
          );
          assert.equal((await request(0)).status, 200);
          assert.equal(
            (await request(0, "GET", undefined, "/api/markets")).status,
            403,
          );
        },
      );
    } finally {
      await db.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
      await db.$disconnect();
    }
  },
);
