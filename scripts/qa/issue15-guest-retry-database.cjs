// Adapted from #13 head 3ed19ba4: real-browser/database regression for #15.
// See docs/qa/guest-retry-fix.md; local instance only, fixture-only cleanup.
// No mocks, product changes, deployment, migrations, HARs or credential output.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");

const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const testedRoot = path.resolve(
  process.env.KAIPA_QA_TESTED_ROOT || process.cwd(),
);
const webRoot = path.resolve(
  process.env.KAIPA_QA_WEB_DIR || "/tmp/kaipa-issue15/web",
);
const evidenceDir =
  process.env.KAIPA_QA_EVIDENCE_DIR || "/tmp/kaipa-issue15/evidence";
const deployedRoot =
  process.env.KAIPA_QA_DEPLOYED_FUNCTIONS ||
  "/home/coder/workspaces/kaipa/infra/supabase/docker/volumes/functions";
const edgeContainer =
  process.env.KAIPA_QA_EDGE_CONTAINER || "kaipa-supabase-edge-functions";
const dbContainer = process.env.KAIPA_QA_DB_CONTAINER || "kaipa-supabase-db";
// Deliberately restricted to this local self-hosted instance.
const upstream = "http://127.0.0.1:8010";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sqlText = (value) => "'" + value.replaceAll("'", "''") + "'";
function sql(query) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8" },
  ).trim();
}
function ok(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
// Store immutable SQL rows once, while retaining each observation's ordered
// row IDs and timestamp. Assertions still run against the original SQL results.
function compactEvidence(result) {
  const compact = JSON.parse(JSON.stringify(result));
  const catalog = new Map();
  function rowIds(rows) {
    return rows.map((row) => {
      if (catalog.has(row.id)) assert.deepEqual(catalog.get(row.id), row);
      else catalog.set(row.id, row);
      return row.id;
    });
  }
  for (const request of compact.requests) {
    if (!request.databaseRowsBeforeBrowserResponse) continue;
    request.databaseRowIdsBeforeBrowserResponse = rowIds(request.databaseRowsBeforeBrowserResponse);
    delete request.databaseRowsBeforeBrowserResponse;
  }
  for (const scenario of compact.cases) {
    if (!scenario.rows) continue;
    scenario.rowIds = rowIds(scenario.rows);
    delete scenario.rows;
  }
  if (compact.finalDatabaseRows) {
    compact.finalDatabaseRowIds = rowIds(compact.finalDatabaseRows);
    delete compact.finalDatabaseRows;
  }
  compact.rowCatalog = [...catalog.values()];
  return compact;
}
const evidence = {
  testedCommit,
  startedAt: new Date().toISOString(),
  requests: [],
  cases: [],
  productFailures: [],
};
const runId = randomUUID();
const journeyId = "qa-issue15-" + runId;
let userId, shareId, browser, context, server, admin, infrastructureFailure;
let mode = "setup",
  dropNext = false,
  normalRequest;
const inFlight = new Set();
function rows(caption) {
  return JSON.parse(
    sql(`SELECT coalesce(json_agg(m ORDER BY created_at,id),'[]'::json) FROM
    (SELECT id,journey_id,share_id,guest_session_id,request_key,caption,is_text,created_at
     FROM public.shared_moments WHERE journey_id=${sqlText(journeyId)}
     ${caption ? "AND caption=" + sqlText(caption) : ""}) m;`),
  );
}
async function post(page, caption) {
  await page.getByText("添加", { exact: true }).click();
  await page.getByPlaceholder("说点什么…（没有照片也可以发布）").fill(caption);
  await page.getByText("发布", { exact: true }).click();
}
async function enter(page, code) {
  await page.goto(`${evidence.browserOrigin}/j/${code}`);
  await page.getByText("QA 丢响应补验", { exact: true }).waitFor();
  await page.getByPlaceholder("你的名字").fill("QA Browser Guest");
  // Returning guests keep an editable name input but use a different CTA.
  await page.getByText(/^(加入这段旅程|进入旅程)$/).click();
  await page.getByText("添加", { exact: true }).waitFor();
}
async function settleRequests() {
  await Promise.all([...inFlight]);
}
async function replay(page, body, count) {
  // Browser fetch, same real guest token and SDK headers captured in memory.
  // This exercises deployed HTTP/SQL replay, not a second UI/hook invocation.
  return page.evaluate(
    async ({ url, body, headers, count }) =>
      Promise.all(
        Array.from({ length: count }, async () => {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          const result = await response.json();
          return { status: response.status, id: result.id };
        }),
      ),
    {
      url: upstream + "/functions/v1/resources",
      body,
      headers: normalRequest.headers,
      count,
    },
  );
}

(async () => {
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    process.loadEnvFile(
      process.env.KAIPA_QA_APP_ENV || "/home/coder/workspaces/kaipa/.env",
    );
    const { createClient } = require(
      testedRoot + "/node_modules/@supabase/supabase-js",
    );
    const { chromium } = require(
      process.env.KAIPA_QA_PLAYWRIGHT_MODULE ||
        "/tmp/kaipa-qa-tools/node_modules/playwright",
    );
    evidence.node = process.version;
    evidence.playwright = require(
      path.join(
        process.env.KAIPA_QA_PLAYWRIGHT_MODULE ||
          "/tmp/kaipa-qa-tools/node_modules/playwright",
        "package.json",
      ),
    ).version;
    evidence.sourceHashes = {};
    for (const file of execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", testedCommit, "src/web", "App.web.tsx"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")) {
      const expected = hash(
        execFileSync("git", ["show", testedCommit + ":" + file]),
      );
      assert.equal(
        hash(fs.readFileSync(path.join(testedRoot, file))),
        expected,
        "Tested source mismatch: " + file,
      );
      evidence.sourceHashes[file] = expected;
    }
    evidence.deployment = {
      containers: execFileSync(
        "docker",
        [
          "inspect",
          edgeContainer,
          dbContainer,
          "kaipa-supabase-rest",
          "kaipa-supabase-kong",
          "--format",
          "{{.Name}} {{.Image}} {{.Config.Image}} {{.State.StartedAt}}",
        ],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n"),
      functions: {},
    };
    for (const file of ["resources/index.ts", "_shared/resource-guard.ts"]) {
      const expected = hash(
        execFileSync("git", [
          "show",
          testedCommit + ":supabase/functions/" + file,
        ]),
      );
      const deployed = hash(fs.readFileSync(path.join(deployedRoot, file)));
      assert.equal(deployed, expected, "Deployment mismatch: " + file);
      evidence.deployment.functions[file] = deployed;
    }
    const functionBody = sql(
      "SELECT prosrc FROM pg_proc WHERE oid='public.write_resource_guest_moment(text,text,jsonb)'::regprocedure;",
    );
    const migration = execFileSync(
      "git",
      [
        "show",
        testedCommit +
          ":supabase/migrations/20261008140000_resource_uploads.sql",
      ],
      { encoding: "utf8" },
    );
    const expectedBody = migration
      .split("create function public.write_resource_guest_moment")[1]
      .split("as $$")[1]
      .split("$$;")[0]
      .trim();
    assert.equal(
      functionBody,
      expectedBody,
      "Deployed write function body differs",
    );
    evidence.deployment.sqlBodySHA256 = hash(functionBody);
    evidence.deployment.sqlBodyMatchesTestedMigration = true;
    evidence.deployment.indexes = sql(
      "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='shared_moments' ORDER BY indexname;",
    ).split("\n");
    evidence.webBundles = {};
    for (const file of fs.readdirSync(
      path.join(webRoot, "_expo/static/js/web"),
    )) {
      evidence.webBundles[file] = hash(
        fs.readFileSync(path.join(webRoot, "_expo/static/js/web", file)),
      );
    }
    const secret = execFileSync(
      "docker",
      ["exec", edgeContainer, "printenv", "SUPABASE_SERVICE_ROLE_KEY"],
      { encoding: "utf8" },
    ).trim();
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    admin = createClient(upstream, secret, options);
    const owner = createClient(
      upstream,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      options,
    );
    const email = `qa-issue15-${runId}@example.test`,
      password = randomUUID();
    const created = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "QA Owner" },
      }),
    );
    userId = created.user.id;
    evidence.fixture = { userId, journeyId };
    ok(await owner.auth.signInWithPassword({ email, password }));
    ok(
      await owner
        .from("journeys")
        .insert({
          id: journeyId,
          user_id: userId,
          name: "QA 丢响应补验",
          region: "QA",
          lng: 110,
          lat: 25,
          tone: "forest",
          total_days: 1,
        }),
    );
    const share = ok(
      await owner.rpc("ensure_journey_share", { p_journey_id: journeyId }),
    );
    assert.equal(share.status, "active");
    shareId = sql(
      `SELECT id FROM public.journey_shares WHERE journey_id=${sqlText(journeyId)};`,
    );
    evidence.fixture.shareId = shareId;
    server = http.createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const file = path.resolve(
        webRoot,
        "." + (pathname.includes(".") ? pathname : "/index.html"),
      );
      if (!file.startsWith(webRoot + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        response.setHeader(
          "Content-Type",
          file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".html")
              ? "text/html"
              : "application/octet-stream",
        );
        response.end(fs.readFileSync(file));
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    evidence.browserOrigin = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({
      executablePath:
        process.env.KAIPA_QA_CHROMIUM ||
        "/home/coder/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    evidence.chromium = browser.version();
    context = await browser.newContext({ locale: "zh-CN" });
    const pageErrors = [];
    context.on("page", (page) =>
      page.on("pageerror", (error) => pageErrors.push(error.message)),
    );
    await context.route("**/*", (route) => {
      const task = (async () => {
        const request = route.request(),
          url = new URL(request.url());
        if (!["localhost", "127.0.0.1"].includes(url.hostname))
          return route.abort();
        if (
          url.origin !== upstream ||
          url.pathname !== "/functions/v1/resources" ||
          request.method() !== "POST"
        )
          return route.continue();
        const body = request.postDataJSON();
        if (body.action !== "guest_add") return route.continue();
        const requestMode = mode;
        const dropped = dropNext;
        if (dropped) dropNext = false;
        if (!normalRequest) {
          const original = await request.allHeaders();
          normalRequest = {
            body,
            headers: Object.fromEntries(
              [
                "apikey",
                "authorization",
                "x-guest-session",
                "content-type",
              ].map((key) => [key, original[key]]),
            ),
          };
        }
        const record = {
          sequence: evidence.requests.length + 1,
          mode: requestMode,
          startedAt: new Date().toISOString(),
          action: body.action,
          requestKey: body.requestKey,
          caption: body.moment.caption,
        };
        evidence.requests.push(record);
        // Fetch completes against the real gateway/Edge/DB; disable proxy retries.
        const response = await route.fetch({ maxRetries: 0, timeout: 15000 });
        const returned = await response.json();
        record.upstreamResponseAt = new Date().toISOString();
        record.upstreamStatus = response.status();
        record.responseId = returned.id;
        record.gatewayHeaders = Object.fromEntries(
          Object.entries(response.headers()).filter(([key]) =>
            /^(x-kong-request-id|x-request-id|sb-request-id|x-kong-upstream-latency|x-kong-proxy-latency)$/.test(
              key,
            ),
          ),
        );
        assert.equal(response.status(), 200);
        assert.ok(returned.id);
        record.databaseRowsBeforeBrowserResponse = rows(body.moment.caption);
        record.commitObservedAt = new Date().toISOString();
        assert.ok(
          record.databaseRowsBeforeBrowserResponse.some(
            (row) =>
              row.id === returned.id && row.request_key === body.requestKey,
          ),
        );
        record.browserResponse = dropped
          ? "aborted-after-confirmed-commit"
          : "fulfilled";
        if (dropped) await route.abort("failed");
        else await route.fulfill({ response });
      })();
      inFlight.add(task);
      task.finally(() => inFlight.delete(task)).catch(() => {});
      return task;
    });
    const page = await context.newPage();
    page.on("requestfailed", (request) => {
      if (
        request.url() === upstream + "/functions/v1/resources" &&
        request.postDataJSON()?.action === "guest_add"
      ) {
        evidence.browserFailure = {
          requestKey: request.postDataJSON().requestKey,
          error: request.failure()?.errorText,
        };
      }
    });
    await enter(page, share.code);

    mode = "normal-ui";
    await post(page, "QA15 正常发布");
    await page.getByText("QA15 正常发布", { exact: true }).waitFor();
    await settleRequests();
    assert.equal(rows("QA15 正常发布").length, 1);
    evidence.cases.push({
      name: mode,
      rows: rows("QA15 正常发布"),
      passed: true,
    });

    mode = "lost-response-ui";
    dropNext = true;
    await post(page, "QA15 丢响应后重试");
    await page.getByText("操作失败，请稍后重试", { exact: true }).waitFor();
    const draft = page.getByPlaceholder("说点什么…（没有照片也可以发布）");
    assert.equal(await draft.inputValue(), "QA15 丢响应后重试");
    assert.equal(await draft.isEditable(), false);
    await settleRequests();
    assert.equal(rows("QA15 丢响应后重试").length, 1);
    assert.equal(
      await page.getByText("QA15 丢响应后重试", { exact: true }).count(),
      0,
    );
    assert.equal(
      evidence.browserFailure?.requestKey,
      evidence.requests.at(-1).requestKey,
    );
    evidence.cases.push({
      name: mode,
      rows: rows("QA15 丢响应后重试"),
      visibleRows: 0,
      passed: true,
    });
    await page.screenshot({
      path: path.join(evidenceDir, "lost-response.png"),
    });

    mode = "retry-ui";
    const firstKey = evidence.requests.at(-1).requestKey;
    const firstId = evidence.requests.at(-1).responseId;
    // Retry the retained original draft, through the actual publish button.
    await page.getByText("发布", { exact: true }).click();
    await page.getByText("QA15 丢响应后重试", { exact: true }).waitFor();
    await settleRequests();
    const retried = rows("QA15 丢响应后重试");
    assert.equal(evidence.requests.at(-1).requestKey, firstKey);
    assert.equal(evidence.requests.at(-1).responseId, firstId);
    assert.equal(await page.getByPlaceholder("说点什么…（没有照片也可以发布）").count(), 0);
    const visibleRows = await page
      .getByText("QA15 丢响应后重试", { exact: true })
      .count();
    evidence.cases.push({
      name: mode,
      rows: retried,
      visibleRows,
      expectedRows: 1,
      passed: retried.length === 1 && visibleRows === 1,
    });
    if (retried.length !== 1 || visibleRows !== 1)
      evidence.productFailures.push(
        "UI retry after confirmed commit uses a new requestKey and duplicates the database row",
      );
    await page.reload();
    await page.getByText("进入旅程", { exact: true }).click();
    await page.getByText("添加", { exact: true }).waitFor();
    const visibleAfterReload = await page
      .getByText("QA15 丢响应后重试", { exact: true })
      .count();
    assert.equal(visibleAfterReload, 1);
    assert.equal(rows("QA15 丢响应后重试").length, 1);
    evidence.cases.push({
      name: "retry-ui-after-reload",
      visibleRows: visibleAfterReload,
      passed: true,
    });
    await page.screenshot({
      path: path.join(evidenceDir, "one-after-reload.png"),
    });

    mode = "new-identical-operation-ui";
    await post(page, "QA15 正常发布");
    await page.getByPlaceholder("说点什么…（没有照片也可以发布）").waitFor({ state: "detached" });
    await settleRequests();
    const newRows = rows("QA15 正常发布");
    assert.equal(newRows.length, 2);
    assert.equal(new Set(newRows.map((row) => row.request_key)).size, 2);
    evidence.cases.push({ name: mode, rows: newRows, passed: true });

    mode = "same-key-serial-browser-fetch";
    const serial = [
      await replay(page, normalRequest.body, 1),
      await replay(page, normalRequest.body, 1),
    ].flat();
    assert.ok(
      serial.every(
        (result) =>
          result.status === 200 &&
          result.id === evidence.requests[0].responseId,
      ),
    );
    assert.equal(rows("QA15 正常发布").filter((row) => row.request_key === normalRequest.body.requestKey).length, 1);
    assert.equal(rows("QA15 正常发布").length, 2);
    evidence.cases.push({
      name: mode,
      responses: serial,
      rows: rows("QA15 正常发布"),
      passed: true,
    });

    // A fresh key verifies concurrent first-insert contention, not only replay of an existing row.
    mode = "same-fresh-key-concurrent-browser-fetch";
    const freshBody = {
      ...normalRequest.body,
      requestKey: randomUUID(),
      moment: { ...normalRequest.body.moment, caption: "QA15 同键并发" },
    };
    const concurrent = await replay(page, freshBody, 3);
    assert.ok(
      concurrent.every(
        (result) => result.status === 200 && result.id === concurrent[0].id,
      ),
    );
    assert.equal(rows("QA15 同键并发").length, 1);
    evidence.cases.push({
      name: mode,
      requestKey: freshBody.requestKey,
      responses: concurrent,
      rows: rows("QA15 同键并发"),
      passed: true,
    });

    mode = "same-session-two-tabs-ui";
    const second = await context.newPage();
    await enter(second, share.code);
    await Promise.all([
      post(page, "QA15 双页同时发布"),
      post(second, "QA15 双页同时发布"),
    ]);
    await Promise.all([
      page.getByText("QA15 双页同时发布", { exact: true }).waitFor(),
      second.getByText("QA15 双页同时发布", { exact: true }).waitFor(),
    ]);
    await settleRequests();
    const tabRows = rows("QA15 双页同时发布");
    assert.equal(tabRows.length, 2);
    assert.equal(new Set(tabRows.map((row) => row.guest_session_id)).size, 1);
    assert.equal(new Set(tabRows.map((row) => row.request_key)).size, 2);
    evidence.cases.push({
      name: mode,
      rows: tabRows,
      passed: true,
      meaning:
        "Two independent UI submissions; not proof of automatic concurrent hook retry",
    });
    evidence.finalDatabaseRows = rows();
    assert.deepEqual(pageErrors, []);
    evidence.pageErrors = pageErrors;
    evidence.executionPassed = true;
  } catch (error) {
    infrastructureFailure = error;
    evidence.executionPassed = false;
    evidence.failure = error.message;
  } finally {
    // Stop browser traffic before removing only the fixture account and its cascade-owned rows.
    try {
      if (context) await context.close();
      await settleRequests();
      if (browser) await browser.close();
      if (server) await new Promise((resolve) => server.close(resolve));
    } catch (error) {
      evidence.shutdownFailure = error.message;
      infrastructureFailure ||= error;
    }
    try {
      const sessions = shareId
        ? JSON.parse(
            sql(
              `SELECT coalesce(json_agg(id),'[]'::json) FROM public.resource_guest_sessions WHERE share_id=${sqlText(shareId)};`,
            ),
          )
        : [];
      evidence.fixtureSessionIds = sessions;
      if (sessions.length)
        sql(
          `DELETE FROM public.resource_rate_windows WHERE scope='guest_write' AND subject IN (${sessions.map(sqlText).join(",")});`,
        );
      if (userId) ok(await admin.auth.admin.deleteUser(userId));
      const remaining = JSON.parse(
        sql(`SELECT json_build_object(
        'auth', (SELECT count(*) FROM auth.users WHERE id=${sqlText(userId || "00000000-0000-0000-0000-000000000000")}),
        'profiles', (SELECT count(*) FROM public.profiles WHERE id=${sqlText(userId || "00000000-0000-0000-0000-000000000000")}),
        'journeys', (SELECT count(*) FROM public.journeys WHERE id=${sqlText(journeyId)}),
        'shares', (SELECT count(*) FROM public.journey_shares WHERE journey_id=${sqlText(journeyId)}),
        'moments', (SELECT count(*) FROM public.shared_moments WHERE journey_id=${sqlText(journeyId)}),
        'guestSessions', (SELECT count(*) FROM public.resource_guest_sessions WHERE share_id=${sqlText(shareId || "")}),
        'uploadTickets', (SELECT count(*) FROM public.resource_upload_tickets WHERE user_id=${sqlText(userId || "00000000-0000-0000-0000-000000000000")}),
        'sessionRateWindows', (SELECT count(*) FROM public.resource_rate_windows WHERE scope='guest_write' AND subject IN (${sessions.length ? sessions.map(sqlText).join(",") : "''"}))
      );`),
      );
      evidence.cleanup = remaining;
      assert.ok(
        Object.values(remaining).every((count) => count === 0),
        "Fixture cleanup incomplete",
      );
    } catch (error) {
      evidence.cleanupFailure = error.message;
      infrastructureFailure ||= error;
    }
    evidence.finishedAt = new Date().toISOString();
    evidence.productAcceptancePassed =
      !infrastructureFailure && evidence.productFailures.length === 0;
    fs.writeFileSync(
      path.join(evidenceDir, "guest-retry-database.json"),
      JSON.stringify(compactEvidence(evidence), null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          executionPassed: evidence.executionPassed,
          productFailures: evidence.productFailures,
          cases: evidence.cases.map(({ name, passed }) => ({ name, passed })),
          cleanup: evidence.cleanup,
          failure: evidence.failure,
          cleanupFailure: evidence.cleanupFailure,
        },
        null,
        2,
      ),
    );
    process.exitCode = evidence.productAcceptancePassed ? 0 : 1;
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
