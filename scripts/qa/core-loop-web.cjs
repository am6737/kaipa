// QA acceptance helper: run from the repository root; see docs/qa/core-loop-acceptance.md.
const fs = require("node:fs");
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
  try {
    for (const path of ["/", "/j/AB12", "/j/INVALID", "/j/%E0%A4%A"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const requests = [];
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
      results.push({ path, body, errors, requests });
      await page.screenshot({
        path: evidenceDir + "/web-" + results.length + ".png",
      });
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((x) => x.errors.length || !x.body.trim()))
    process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  server.close();
  process.exitCode = 1;
});
