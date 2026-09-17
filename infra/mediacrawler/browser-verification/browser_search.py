"""Authenticated XHS webpage search beside an existing, manually logged-in Chrome."""

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
import secrets
import time
from urllib.parse import urlencode, urlparse

from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from pydantic import BaseModel, Field


HOME = "https://www.xiaohongshu.com/explore"
SEARCH_PATHS = {"/api/sns/web/v1/search/notes", "/api/sns/web/v2/search/notes"}
ERRORS = {
    "verification_required": (409, "Complete platform verification in the browser, then explicitly resume search."),
    "login_required": (409, "Log in manually in the browser, then explicitly resume search."),
    "browser_unavailable": (503, "The existing browser is unavailable. No API fallback was attempted."),
    "search_busy": (429, "The browser search queue is full or its wait limit was reached."),
    "search_timeout": (504, "Webpage search timed out. No retry was attempted."),
    "search_failed": (502, "The platform rejected the webpage search."),
    "unexpected_response": (502, "The webpage returned an unsupported search response."),
}


class SearchError(Exception):
    def __init__(self, code):
        self.code = code
        self.status, self.detail = ERRORS[code]
        super().__init__(self.detail)


def normalize_query(value):
    return " ".join(value.split()).casefold()


def is_search_response(response, query):
    url = urlparse(response.url)
    if url.hostname not in {"edith.xiaohongshu.com", "so.xiaohongshu.com", "www.xiaohongshu.com"} or url.path not in SEARCH_PATHS:
        return False
    try:
        body = response.request.post_data_json
    except Exception:
        return False
    return (response.request.method == "POST" and isinstance(body, dict)
            and isinstance(body.get("keyword"), str)
            and normalize_query(body["keyword"]) == normalize_query(query)
            and body.get("page", 1) in (1, "1"))


def normalize_results(payload, limit):
    if not isinstance(payload, dict):
        raise SearchError("unexpected_response")
    if str(payload.get("code")) in {"300011", "300012"}:
        raise SearchError("verification_required")
    if payload.get("success") is not True:
        raise SearchError("search_failed")
    data = payload.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise SearchError("unexpected_response")
    results, seen = [], set()
    for item in data["items"]:
        if not isinstance(item, dict) or item.get("model_type") in {"rec_query", "hot_query"}:
            continue
        card = item.get("note_card")
        if not isinstance(card, dict):
            continue
        note_id = item.get("id")
        title = card.get("display_title") or card.get("desc")
        if (not isinstance(note_id, str) or not note_id.isalnum()
                or not isinstance(title, str) or not title.strip() or note_id in seen):
            continue
        seen.add(note_id)
        token = item.get("xsec_token")
        suffix = "?" + urlencode({"xsec_token": token, "xsec_source": "pc_search"}) if isinstance(token, str) and token else ""
        snippet = card.get("desc") if isinstance(card.get("desc"), str) else title
        results.append({"title": title.strip()[:180],
                        "url": f"https://www.xiaohongshu.com/explore/{note_id}{suffix}",
                        "snippet": snippet.strip()[:600]})
        if len(results) >= limit:
            break
    # A nonempty but unrecognizable note payload is not a successful empty search.
    if not results and any(isinstance(item, dict) and item.get("model_type") not in {"rec_query", "hot_query"}
                           for item in data["items"]):
        raise SearchError("unexpected_response")
    return results


class WebpageSearch:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.page = None

    async def connect(self):
        try:
            if self.playwright is None:
                self.playwright = await async_playwright().start()
            if self.browser is None or not self.browser.is_connected():
                self.browser = await self.playwright.chromium.connect_over_cdp("http://127.0.0.1:9222", timeout=5000)
                self.page = None
            if not self.browser.contexts:
                raise SearchError("browser_unavailable")
            if self.page is None or self.page.is_closed():
                # Own one tab; never navigate, close, or extract cookies from the user's tabs.
                self.page = await self.browser.contexts[0].new_page()
            return self.page
        except SearchError:
            raise
        except Exception:
            raise SearchError("browser_unavailable") from None

    async def check_access(self, page):
        for frame in page.frames:
            try:
                for selector, code in (
                    (".captcha-container, #captcha, .verify-container, iframe[src*='captcha']", "verification_required"),
                    (".login-container, .login-modal", "login_required"),
                ):
                    for locator in await frame.locator(selector).all():
                        if await locator.is_visible():
                            raise SearchError(code)
                challenge = frame.get_by_text("请完成验证", exact=False)
                if await challenge.count() and await challenge.first.is_visible():
                    raise SearchError("verification_required")
            except SearchError:
                raise
            except Exception:
                continue

    async def find_input(self, page):
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            await self.check_access(page)
            # New XHS UI embeds the actual search UI in a frame. Clicking first
            # checks hit-testing, so an obscured copy in the parent is not filled.
            for frame in reversed(page.frames):
                if frame.url != "about:blank" and urlparse(frame.url).hostname != "www.xiaohongshu.com":
                    continue
                for locator in await frame.locator("textarea, input[placeholder*='搜索'], input#search-input").all():
                    if not await locator.is_visible():
                        continue
                    try:
                        await locator.click(timeout=1000)
                        return locator
                    except PlaywrightTimeout:
                        continue
            await asyncio.sleep(0.25)
        raise SearchError("search_timeout")

    async def search(self, query, limit):
        page = await self.connect()
        await page.goto(HOME, wait_until="domcontentloaded", timeout=15000)
        await page.bring_to_front()
        field = await self.find_input(page)
        await field.fill(query, timeout=3000)
        future = asyncio.get_running_loop().create_future()
        tasks = set()

        async def capture(response):
            if future.done() or not is_search_response(response, query):
                return
            try:
                if response.status in {403, 429, 461, 471}:
                    raise SearchError("verification_required")
                if response.status == 401:
                    raise SearchError("login_required")
                if response.status != 200:
                    raise SearchError("search_failed")
                results = normalize_results(await response.json(), limit)
                if not future.done():
                    future.set_result(results)
            except SearchError as error:
                if not future.done():
                    future.set_exception(error)
            except Exception:
                if not future.done():
                    future.set_exception(SearchError("unexpected_response"))

        def on_response(response):
            task = asyncio.create_task(capture(response))
            tasks.add(task)
            task.add_done_callback(tasks.discard)

        page.on("response", on_response)
        try:
            # Exactly one submission. Never call XHS search APIs directly or retry.
            await field.press("Enter", timeout=3000)
            while not future.done():
                await self.check_access(page)
                await asyncio.wait({future}, timeout=0.5)
            return await future
        finally:
            page.remove_listener("response", on_response)
            if not future.done():
                future.cancel()
            elif not future.cancelled():
                future.exception()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def close(self):
        # Only our own tab is disposable. Never call browser.close().
        if self.page is not None:
            try:
                if not self.page.is_closed():
                    await self.page.close()
            except Exception:
                pass
        if self.playwright:
            await self.playwright.stop()


class SearchController:
    def __init__(self, engine, interval=10, timeout=45, queue_timeout=10, queue_limit=4):
        self.engine = engine
        self.interval, self.timeout = interval, timeout
        self.queue_timeout, self.queue_limit = queue_timeout, queue_limit
        self.lock = asyncio.Lock()
        self.waiting = 0
        self.last_finished = float("-inf")
        self.blocked = None

    async def search(self, query, limit):
        if self.blocked:
            raise SearchError(self.blocked)
        if self.waiting >= self.queue_limit:
            raise SearchError("search_busy")
        self.waiting += 1
        try:
            await asyncio.wait_for(self.lock.acquire(), self.queue_timeout)
        except asyncio.TimeoutError:
            raise SearchError("search_busy") from None
        finally:
            self.waiting -= 1
        try:
            if self.blocked:
                raise SearchError(self.blocked)
            await asyncio.sleep(max(0, self.interval - (time.monotonic() - self.last_finished)))
            try:
                return await asyncio.wait_for(self.engine.search(query, limit), self.timeout)
            except (asyncio.TimeoutError, PlaywrightTimeout):
                raise SearchError("search_timeout") from None
            except SearchError as error:
                if error.code in {"verification_required", "login_required"}:
                    self.blocked = error.code
                raise
            except Exception:
                raise SearchError("browser_unavailable") from None
            finally:
                self.last_finished = time.monotonic()
        finally:
            self.lock.release()

    def resume(self):
        if self.lock.locked() or self.waiting:
            raise SearchError("search_busy")
        self.blocked = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=6, ge=1, le=20)


def create_app(controller=None, api_key=None):
    controller = controller or SearchController(WebpageSearch())

    @asynccontextmanager
    async def lifespan(_):
        yield
        await controller.engine.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    def authenticate(provided):
        key = api_key
        if key is None:
            try:
                key = Path(os.environ.get("BROWSER_SEARCH_KEY_FILE", "/run/secrets/browser-search-key")).read_text().strip()
            except OSError:
                key = ""
        if not key or len(key) < 32:
            return JSONResponse(status_code=503, content={"code": "not_configured", "detail": "Browser search authentication is not configured."})
        if not provided or not secrets.compare_digest(provided, key):
            return JSONResponse(status_code=401, content={"code": "unauthorized", "detail": "Invalid browser search credentials."})
        return None

    @app.exception_handler(SearchError)
    async def handle_error(_, error):
        return JSONResponse(status_code=error.status, content={"code": error.code, "detail": error.detail})

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/v1/status")
    async def status(x_kaipa_browser_key: str | None = Header(default=None)):
        denied = authenticate(x_kaipa_browser_key)
        if denied is not None:
            return denied
        return {"mode": "browser", "blocked": controller.blocked, "busy": controller.lock.locked(), "waiting": controller.waiting}

    @app.post("/v1/resume")
    async def resume(x_kaipa_browser_key: str | None = Header(default=None)):
        denied = authenticate(x_kaipa_browser_key)
        if denied is not None:
            return denied
        controller.resume()
        return {"blocked": None, "note": "Next search will check the webpage again; this does not prove verification succeeded."}

    @app.post("/v1/search")
    async def search(request: SearchRequest, x_kaipa_browser_key: str | None = Header(default=None)):
        denied = authenticate(x_kaipa_browser_key)
        if denied is not None:
            return denied
        query = " ".join(request.query.split())
        if len(query) < 2:
            return JSONResponse(status_code=422, content={"detail": "Search query is too short."})
        return {"results": await controller.search(query, request.limit), "mode": "browser"}

    return app


app = create_app()
