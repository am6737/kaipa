// QA acceptance helper: run from the repository root; see docs/qa/core-loop-acceptance.md.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const evidenceDir =
  process.env.KAIPA_QA_EVIDENCE_DIR || "/tmp/kaipa-qa-evidence";
fs.mkdirSync(evidenceDir, { recursive: true });
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { createClient } = require(
  process.cwd() + "/node_modules/@supabase/supabase-js",
);
const { chromium } = require(
  process.env.KAIPA_QA_PLAYWRIGHT_MODULE ||
    "/tmp/kaipa-qa-tools/node_modules/playwright",
);
process.loadEnvFile(
  process.env.KAIPA_QA_APP_ENV || "/home/coder/workspaces/kaipa/.env",
);
const url = "http://127.0.0.1:8010";
const secret = spawnSync(
  "docker",
  [
    "exec",
    "kaipa-supabase-edge-functions",
    "printenv",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  { encoding: "utf8" },
);
assert.equal(secret.status, 0);
const admin = createClient(url, secret.stdout.trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(
    url,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    options,
  ),
  member = createClient(
    url,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    options,
  );
const ts = require(process.cwd() + "/node_modules/typescript");
const vm = require("node:vm");
const path = require("node:path");
function hook(file, client) {
  const cache = new Map();
  const load = (f) => {
    if (cache.has(f)) return cache.get(f);
    const exports = {};
    cache.set(f, exports);
    const code = ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const mocks = {
      react: {
        useState: (v) => [v, () => {}],
        useEffect() {},
        useCallback: (f) => f,
      },
      "react-native": {},
      "../lib/supabase": { supabase: client },
      "../lib/storage": {
        ensureCloudMedia: async (v) => v,
        ensureCloudGearMedia: async (v) => v,
      },
      "../lib/resourceClient": { resourceUsageChanged() {} },
    };
    vm.runInNewContext(code, {
      exports,
      console,
      require: (name) =>
        name in mocks
          ? mocks[name]
          : name.startsWith(".")
            ? load(path.resolve(path.dirname(f), name + ".ts"))
            : require(name),
    });
    return exports;
  };
  return load(path.resolve(file));
}
const users = [];
const jid = "qa-core-" + randomUUID();
let browser, server;
const failures = [];
const result = async (label, fn) => {
  try {
    await fn();
    console.log("PASS " + label);
  } catch (e) {
    failures.push(label);
    console.log("FAIL " + label + ": " + e.message);
  }
};
const ok = (x) => {
  if (x.error) throw new Error(x.error.message);
  return x.data;
};
async function guest(body, token) {
  const r = await owner.functions.invoke("resources", {
    body,
    headers: token ? { "x-guest-session": token } : {},
  });
  const data = ok(r);
  if (data.error) throw new Error(data.error.message);
  return data;
}
(async () => {
  try {
    for (const [name, client] of [
      ["Owner", owner],
      ["Member", member],
    ]) {
      const email = "qa-core-" + randomUUID() + "@example.test",
        password = randomUUID();
      const created = ok(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: "QA " + name },
        }),
      );
      users.push({ id: created.user.id, email, password });
      ok(await client.auth.signInWithPassword({ email, password }));
      ok(
        await client
          .from("profiles")
          .update({ onboarded_at: "2026-10-13T00:00:00Z" })
          .eq("id", created.user.id),
      );
    }
    await result("email wrong password rejects", async () => {
      const r = await owner.auth.signInWithPassword({
        email: users[0].email,
        password: "wrong-controlled-password",
      });
      assert.ok(r.error);
    });
    await result("catalog real rows readable", async () => {
      const r = ok(await owner.from("routes").select("id,name").limit(3));
      assert.ok(r.length);
      console.log("catalog row count sampled=" + r.length);
    });
    await result("create and edit journey owned fixture", async () => {
      const journeys = hook("src/hooks/useJourneys.ts", owner).useJourneys(
        users[0].id,
      );
      assert.ok(
        await journeys.createJourney({
          id: jid,
          name: "QA 核心闭环",
          region: "QA",
          lng: 110,
          lat: 25,
          tone: "forest",
          totalDays: 2,
          participantPermissions: { inviteParticipants: true },
          companionList: [
            {
              userId: users[0].id,
              name: "QA Owner",
              ini: "Q",
              color: "#000000",
              host: true,
              self: true,
            },
          ],
        }),
      );
      await journeys.updateJourney(jid, {
        name: "QA 重启后仍在",
        totalDays: 3,
      });
    });
    await result(
      "fresh SDK client can sign in and reread saved journey",
      async () => {
        const restarted = createClient(
          url,
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
          options,
        );
        ok(
          await restarted.auth.signInWithPassword({
            email: users[0].email,
            password: users[0].password,
          }),
        );
        const row = ok(
          await restarted
            .from("journeys")
            .select("name,total_days")
            .eq("id", jid)
            .single(),
        );
        assert.equal(row.name, "QA 重启后仍在");
        assert.equal(row.total_days, 3);
        await restarted.auth.signOut({ scope: "local" });
      },
    );
    await result(
      "real gear hook create edit set and owner isolation",
      async () => {
        const gear = hook("src/hooks/useGear.ts", owner).useGear(users[0].id);
        const item = await gear.addItem({
          name: "QA 头灯",
          cat: "uncat",
          w: 0.1,
          p: 10,
          qty: 1,
        });
        assert.ok(item.id);
        await gear.updateItem(item.id, { name: "QA 新头灯", qty: 2 });
        const row = ok(
          await owner
            .from("gear_items")
            .select("name,qty")
            .eq("id", item.id)
            .single(),
        );
        assert.equal(row.name, "QA 新头灯");
        assert.equal(row.qty, 2);
        await gear.addSet("QA 套装", [item.id]);
        assert.equal(
          ok(
            await owner
              .from("gear_sets")
              .select("id")
              .eq("user_id", users[0].id)
              .eq("name", "QA 套装"),
          ).length,
          1,
        );
        assert.equal(
          ok(await member.from("gear_items").select("id").eq("id", item.id))
            .length,
          0,
        );
      },
    );
    let code;
    await result("owner creates active code", async () => {
      const r = ok(
        await owner.rpc("ensure_journey_share", { p_journey_id: jid }),
      );
      assert.equal(r.status, "active");
      assert.match(r.code, /^[0-9A-Z]{4}$/);
      code = r.code;
    });
    await result(
      "unsigned outsider cannot publish a forged companion presence",
      async () => {
        const outsider = createClient(
          url,
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
          options,
        );
        const ch = outsider.channel("journey-presence:" + jid);
        try {
          const status = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve("TIMEOUT"), 5000);
            ch.subscribe((status) => {
              if (
                ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)
              ) {
                clearTimeout(timer);
                resolve(status);
              }
            });
          });
          if (status === "SUBSCRIBED") {
            const tracked = await ch.track({
              userId: users[0].id,
              longitude: 110,
              latitude: 25,
              fixedAt: Date.now(),
            });
            console.log(
              "unsigned presence subscription=" + status + " track=" + tracked,
            );
            if (tracked !== "ok") {
              throw new Error(
                "UNVERIFIED: presence track=" + tracked +
                "; no explicit authorization denial was observed",
              );
            }
            assert.notEqual(
              tracked,
              "ok",
              "Unsigned non-member can forge the owner position on the public journey channel",
            );
          } else {
            throw new Error(
              "UNVERIFIED: presence subscription=" + status +
              "; a connection error or timeout is not proof of permission denial",
            );
          }
        } finally {
          await outsider.removeAllChannels();
        }
      },
    );
    await result("member has no access before join", async () => {
      const rows = ok(await member.from("journeys").select("id").eq("id", jid));
      assert.equal(rows.length, 0);
    });
    if (code) {
      await result("deployed journey-join joins and deduplicates", async () => {
        for (const expected of ["joined", "already_joined"]) {
          const r = ok(
            await member.functions.invoke("journey-join", {
              body: { code },
              headers: { "x-device-id": "qa-core-" + jid },
            }),
          );
          assert.equal(r.status, expected);
        }
      });
      await result(
        "member can read but cannot rename owner journey",
        async () => {
          assert.equal(
            ok(await member.from("journeys").select("id").eq("id", jid)).length,
            1,
          );
          const r = await member
            .from("journeys")
            .update({ name: "Unauthorized" })
            .eq("id", jid)
            .select("id");
          assert.ok(r.error || r.data.length === 0);
          assert.equal(
            ok(
              await owner
                .from("journeys")
                .select("name")
                .eq("id", jid)
                .single(),
            ).name,
            "QA 重启后仍在",
          );
        },
      );
      let g;
      await result(
        "deployed resources opens guest session and snapshot",
        async () => {
          g = await guest({ action: "guest_open", code });
          assert.ok(g.token);
          const snap = await guest({ action: "guest_snapshot" }, g.token);
          assert.equal(snap.journey.name, "QA 重启后仍在");
        },
      );
      if (g?.token) {
        await result(
          "guest session reload and same request replay deduplicate server-side",
          async () => {
            const resumed = await guest(
              { action: "guest_open", code },
              g.token,
            );
            assert.equal(resumed.sessionId, g.sessionId);
            const body = {
              action: "guest_add",
              requestKey: randomUUID(),
              moment: {
                guest_name: "QA Guest",
                guest_ini: "Q",
                guest_tone: "river",
                uri: "",
                caption: "QA controlled text",
                day: 1,
                is_text: true,
              },
            };
            const a = await guest(body, g.token);
            const b = await guest(body, g.token);
            assert.equal(a.id, b.id);
          },
        );
      }
      server = http.createServer((req, res) => {
        const path =
          "/tmp/kaipa-qa-web" +
          (req.url.split("?")[0].includes(".")
            ? req.url.split("?")[0]
            : "/index.html");
        try {
          res.setHeader(
            "Content-Type",
            path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".html")
                ? "text/html"
                : "application/octet-stream",
          );
          res.end(fs.readFileSync(path));
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
      await new Promise((resolve) =>
        server.listen(18770, "127.0.0.1", resolve),
      );
      browser = await chromium.launch({
        executablePath:
          "/home/coder/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
        headless: true,
        args: ["--no-sandbox"],
      });
      await result(
        "returning owner browser email login and reload",
        async () => {
          const context = await browser.newContext({ locale: "zh-CN" });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.route("**/*", (route) => {
            const u = new URL(route.request().url());
            return ["127.0.0.1", "localhost"].includes(u.hostname)
              ? route.continue()
              : route.abort();
          });
          try {
            await page.goto("http://127.0.0.1:18770/");
            await page.getByText(/^(More options|更多方式登录)$/).click();
            await page
              .getByText(/^(Continue with email|使用邮箱继续)$/)
              .click();
            await page
              .getByPlaceholder(/^(Email address|邮箱地址)$/)
              .fill(users[0].email);
            await page
              .getByPlaceholder(/^(Password|密码)$/)
              .fill(users[0].password);
            await page.getByRole("checkbox").click();
            await page
              .getByText(/^(Log In|Sign in|登录)$/)
              .last()
              .click();
            await page
              .getByText(/^(Discover|发现)$/)
              .first()
              .waitFor({ timeout: 20000 });
            await page.reload();
            await page
              .getByText(/^(Discover|发现)$/)
              .first()
              .waitFor({ timeout: 20000 });
            await page.getByText("发现", { exact: true }).first().click();
            await page
              .getByRole("button", {
                name: "搜索路线、地区或旅程",
                exact: true,
              })
              .click();
            await page
              .getByPlaceholder("搜索地点、路线、旅程或攻略")
              .fill("QA 重启后仍在");
            await page
              .getByText("QA 重启后仍在", { exact: true })
              .waitFor({ timeout: 20000 });
            await page
              .getByPlaceholder("搜索地点、路线、旅程或攻略")
              .fill("QA-NO-MATCH-987654321");
            await page.getByText("没有找到相关内容", { exact: true }).waitFor();
            assert.deepEqual(errors, []);
          } finally {
            console.log(
              "owner browser text=" +
                JSON.stringify(
                  (await page.locator("body").innerText()).slice(0, 2000),
                ),
            );
            await page.screenshot({ path: evidenceDir + "/owner-ui.png" });
            await context.close();
          }
        },
      );
      await result("real Web guest cover renders owned fixture", async () => {
        const context = await browser.newContext({ locale: "zh-CN" });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("response", (r) => {
          if (r.url().includes("/functions/v1/"))
            console.log("browser functions status=" + r.status());
        });
        await page.route("**/*", (route) => {
          const u = new URL(route.request().url());
          return ["127.0.0.1", "localhost"].includes(u.hostname)
            ? route.continue()
            : route.abort();
        });
        await page.goto("http://127.0.0.1:18770/j/" + code);
        try {
          await page
            .getByText("QA 重启后仍在", { exact: true })
            .waitFor({ timeout: 15000 });
        } finally {
          console.log(
            "guest cover text=" +
              JSON.stringify(await page.locator("body").innerText()),
          );
          await page.screenshot({ path: evidenceDir + "/guest-real.png" });
        }
        await page.getByPlaceholder("你的名字").fill("QA Browser Guest");
        await page.getByText("加入这段旅程", { exact: true }).click();
        await page.getByText("添加", { exact: true }).click();
        await page
          .getByPlaceholder("说点什么…（没有照片也可以发布）")
          .fill("QA browser text");
        await page.getByText("发布", { exact: true }).click();
        await page.getByText("QA browser text", { exact: true }).waitFor();
        await page.reload();
        await page.getByText("进入旅程", { exact: true }).click();
        await page.getByText("QA browser text", { exact: true }).waitFor();
        console.log("guest wall text persisted after reload");
        assert.deepEqual(errors, [], "Guest page must not have uncaught errors");
        await page.screenshot({ path: evidenceDir + "/guest-wall.png" });
        await context.close();
      });
      await result(
        "guest cannot delete another session text even with the same nickname",
        async () => {
          const other = await guest({ action: "guest_open", code });
          const body = {
            action: "guest_add",
            requestKey: randomUUID(),
            moment: {
              guest_name: "QA Guest",
              guest_ini: "Q",
              guest_tone: "river",
              uri: "",
              caption: "QA isolated session text",
              day: 1,
              is_text: true,
            },
          };
          const row = await guest(body, g.token);
          await assert.rejects(() =>
            guest({ action: "guest_delete", id: row.id }, other.token),
          );
        },
      );
      await result(
        "turning invite off rejects old code and existing guest session",
        async () => {
          ok(
            await owner.rpc("set_journey_invite_enabled", {
              p_journey_id: jid,
              p_enabled: false,
            }),
          );
          const r = ok(
            await member.functions.invoke("journey-join", {
              body: { code },
              headers: { "x-device-id": "qa-core-" + jid },
            }),
          );
          assert.equal(r.status, "busy");
          if (g?.token)
            await assert.rejects(() =>
              guest({ action: "guest_snapshot" }, g.token),
            );
        },
      );
    }
  } catch (e) {
    failures.push("setup");
    console.log("FAIL setup: " + e.message);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
    for (const user of users) {
      const r = await admin.auth.admin.deleteUser(user.id);
      console.log(
        (r.error ? "FAIL" : "PASS") +
          " cleanup disposable account" +
          (r.error ? ": " + r.error.message : ""),
      );
      if (r.error) failures.push("cleanup");
    }
    console.log(
      "failed steps=" + failures.length + " " + JSON.stringify(failures),
    );
  }
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
