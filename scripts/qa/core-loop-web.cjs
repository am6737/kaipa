// QA acceptance helper: run from the repository root; see docs/qa/core-loop-acceptance.md.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const evidenceDir =
  process.env.KAIPA_QA_EVIDENCE_DIR || "/tmp/kaipa-qa-evidence";
fs.mkdirSync(evidenceDir, { recursive: true });
const http = require("node:http");
const { chromium } = require(
  process.env.KAIPA_QA_PLAYWRIGHT_MODULE ||
    "/tmp/kaipa-qa-tools/node_modules/playwright",
);
const server = http.createServer((req, res) => {
  const name = req.url.split("?")[0];
  const path =
    "/tmp/kaipa-qa-web" + (name.includes(".") ? name : "/index.html");
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
(async () => {
  await new Promise((resolve) => server.listen(18769, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath:
      "/home/coder/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const results = [];
  const failures = [];
  const check = (path, label, fn) => {
    try {
      fn();
      console.log("PASS " + path + " " + label);
    } catch (error) {
      failures.push({ path, label, message: error.message });
      console.log("FAIL " + path + " " + label + ": " + error.message);
    }
  };
  try {
    for (const path of ["/", "/j/AB12", "/j/INVALID", "/j/%E0%A4%A"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const requests = [];
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return ["127.0.0.1", "localhost"].includes(host)
          ? route.continue()
          : route.abort();
      });
      await page.route("**/functions/v1/**", async (route) => {
        requests.push(new URL(route.request().url()).pathname);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "QA controlled offline" } }),
        });
      });
      await page.goto("http://127.0.0.1:18769" + path);
      await page.waitForTimeout(1200);
      const body = await page.locator("body").innerText();
      const retryVisible = await page.getByText(/^(Retry|Try again|重试|重新尝试)$/i).first().isVisible();
      results.push({ path, body, errors, requests, retryVisible });
      await page.screenshot({
        path: evidenceDir + "/web-" + results.length + ".png",
      });
      check(path, "renders without uncaught errors", () => {
        assert.deepEqual(errors, []);
        assert.ok(body.trim(), "Page must not be blank");
      });
      if (path === "/") {
        check(path, "login entry renders", () => assert.match(body, /Phone number|手机号/));
      } else if (path === "/j/AB12") {
        check(path, "503 reaches the guest service", () =>
          assert.deepEqual(requests, ["/functions/v1/resources"]));
        check(path, "503 is recoverable and is not labelled an expired invite", () => {
          assert.doesNotMatch(body, /Link expired or invalid|链接已过期或无效/i);
          assert.match(body, /network|temporar|service|网络|暂时|服务/i);
          assert.ok(retryVisible, "Temporary service failure needs a retry entry");
        });
      } else {
        check(path, "invalid link is handled with a visible message", () =>
          assert.match(body, /Link expired or invalid|链接已过期或无效/i));
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 2));
  console.log("failed assertions=" + failures.length + " " + JSON.stringify(failures));
  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => {
  console.error(error.message);
  server.close();
  process.exitCode = 1;
});
