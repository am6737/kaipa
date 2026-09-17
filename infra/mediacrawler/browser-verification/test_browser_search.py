import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

import httpx

from browser_search import SearchController, SearchError, WebpageSearch, create_app, is_search_response, normalize_results


def payload():
    return {"success": True, "data": {"items": [
        {"model_type": "note", "id": "abc123", "xsec_token": "public+note/token",
         "note_card": {"display_title": "Route", "desc": "Description"}},
        {"model_type": "note", "id": "abc123", "note_card": {"display_title": "Duplicate"}},
        {"model_type": "rec_query", "id": "other", "note_card": {"display_title": "Suggestion"}},
    ]}}


class ResponseTests(unittest.TestCase):
    def test_normalizes_deduplicates_and_encodes_note_links(self):
        result = normalize_results(payload(), 3)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Route")
        self.assertIn("xsec_token=public%2Bnote%2Ftoken", result[0]["url"])
        self.assertEqual(result[0]["snippet"], "Description")

    def test_empty_results_are_distinct_from_bad_schema(self):
        self.assertEqual(normalize_results({"success": True, "data": {"items": []}}, 3), [])
        for value in ({}, {"success": True, "data": {}}, {"success": True, "data": {"items": [{"new_schema": True}]}}):
            with self.assertRaises(SearchError):
                normalize_results(value, 3)

    def test_security_restriction_is_actionable(self):
        with self.assertRaises(SearchError) as caught:
            normalize_results({"success": False, "code": 300011}, 3)
        self.assertEqual(caught.exception.code, "verification_required")

    def test_filters_stale_queries_other_pages_and_untrusted_hosts(self):
        def response(path="v2", keyword="Route", page=1, host="edith.xiaohongshu.com"):
            return SimpleNamespace(url=f"https://{host}/api/sns/web/{path}/search/notes",
                                   request=SimpleNamespace(method="POST", post_data_json={"keyword": keyword, "page": page}))
        self.assertTrue(is_search_response(response(), "route"))
        self.assertTrue(is_search_response(response("v1"), "Route"))
        self.assertTrue(is_search_response(response(host="so.xiaohongshu.com"), "Route"))
        self.assertFalse(is_search_response(response(keyword="Old"), "Route"))
        self.assertFalse(is_search_response(response(page=2), "Route"))
        self.assertFalse(is_search_response(response(host="edith.xiaohongshu.com.evil.test"), "Route"))


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    async def test_challenge_blocks_until_explicit_resume(self):
        engine = SimpleNamespace(search=AsyncMock(side_effect=SearchError("verification_required")))
        controller = SearchController(engine, interval=0)
        for _ in range(2):
            with self.assertRaises(SearchError):
                await controller.search("route", 3)
        self.assertEqual(engine.search.await_count, 1)
        self.assertEqual(controller.blocked, "verification_required")
        controller.resume()
        engine.search.side_effect = None
        engine.search.return_value = []
        self.assertEqual(await controller.search("route", 3), [])

    async def test_serializes_and_spaces_searches(self):
        active, maximum, starts = 0, 0, []

        async def search(*_):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            starts.append(asyncio.get_running_loop().time())
            await asyncio.sleep(0.01)
            active -= 1
            return []

        controller = SearchController(SimpleNamespace(search=search), interval=0.03)
        await asyncio.gather(controller.search("one", 3), controller.search("two", 3))
        self.assertEqual(maximum, 1)
        self.assertGreaterEqual(starts[1] - starts[0], 0.03)

    async def test_timeout_cancels_search_and_releases_lock(self):
        cancelled = asyncio.Event()

        async def search(*_):
            try:
                await asyncio.sleep(60)
            finally:
                cancelled.set()

        controller = SearchController(SimpleNamespace(search=search), interval=0, timeout=0.01)
        with self.assertRaises(SearchError) as caught:
            await controller.search("route", 3)
        self.assertEqual(caught.exception.code, "search_timeout")
        self.assertTrue(cancelled.is_set())
        self.assertFalse(controller.lock.locked())

    async def test_queue_timeout_is_bounded(self):
        controller = SearchController(SimpleNamespace(search=AsyncMock()), queue_timeout=0.01)
        await controller.lock.acquire()
        try:
            with self.assertRaises(SearchError) as caught:
                await controller.search("route", 3)
            self.assertEqual(caught.exception.code, "search_busy")
            self.assertEqual(controller.waiting, 0)
            controller.waiting = controller.queue_limit
            with self.assertRaises(SearchError):
                await controller.search("route", 3)
        finally:
            controller.lock.release()

    async def test_disconnect_does_not_close_browser(self):
        engine = WebpageSearch()
        engine.playwright = SimpleNamespace(stop=AsyncMock())
        engine.browser = SimpleNamespace(close=AsyncMock())
        await engine.close()
        engine.playwright.stop.assert_awaited_once()
        engine.browser.close.assert_not_awaited()


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_auth_validation_errors_and_resume(self):
        engine = SimpleNamespace(search=AsyncMock(return_value=[]), close=AsyncMock())
        controller = SearchController(engine, interval=0)
        app = create_app(controller, api_key="a" * 32)
        headers = {"X-Kaipa-Browser-Key": "a" * 32}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for path in ("/v1/search", "/v1/resume"):
                result = await client.post(path, json={"query": "route"})
                self.assertEqual(result.status_code, 401)
            self.assertEqual((await client.get("/v1/status")).status_code, 401)
            self.assertEqual((await client.get("/docs")).status_code, 404)
            engine.search.assert_not_awaited()
            self.assertEqual((await client.post("/v1/search", headers=headers, json={"query": "  "})).status_code, 422)
            self.assertEqual((await client.post("/v1/search", headers=headers, json={"query": "route", "limit": 21})).status_code, 422)
            controller.blocked = "verification_required"
            result = await client.post("/v1/search", headers=headers, json={"query": "route"})
            self.assertEqual(result.status_code, 409)
            self.assertEqual(result.json()["code"], "verification_required")
            self.assertEqual((await client.get("/v1/status", headers=headers)).json()["blocked"], "verification_required")
            self.assertEqual((await client.post("/v1/resume", headers=headers)).status_code, 200)
            result = await client.post("/v1/search", headers=headers, json={"query": "  route   guide "})
            self.assertEqual(result.json(), {"results": [], "mode": "browser"})
            engine.search.assert_awaited_once_with("route guide", 6)


if __name__ == "__main__":
    unittest.main()
