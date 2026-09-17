import asyncio
import json
import os
import unittest
from unittest.mock import AsyncMock

from playwright.async_api import async_playwright

from browser_search import SearchError, WebpageSearch


@unittest.skipUnless(os.environ.get("RUN_BROWSER_SEARCH_UI_TESTS") == "1", "Opt-in Playwright fixture tests")
class BrowserUiTests(unittest.IsolatedAsyncioTestCase):
    async def exercise(self, response_status):
        requests = []
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                context = await browser.new_context()

                async def route(request_route):
                    request = request_route.request
                    if request.url.endswith("/explore"):
                        await request_route.fulfill(content_type="text/html", body="""
                            <textarea placeholder="Search">Wrong parent field</textarea>
                            <iframe style="position:fixed;inset:0;width:100%;height:100%"
                              src="https://www.xiaohongshu.com/test-frame"></iframe>
                        """)
                    elif request.url.endswith("/test-frame"):
                        await request_route.fulfill(content_type="text/html", body="""
                            <textarea placeholder="搜索小红书"></textarea>
                            <script>
                              document.querySelector('textarea').onkeydown = event => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                fetch('/api/sns/web/v2/search/notes', {
                                  method: 'POST', body: JSON.stringify({keyword: event.target.value, page: 1})
                                });
                              };
                            </script>
                        """)
                    elif request.url.endswith("/api/sns/web/v2/search/notes"):
                        requests.append(request.post_data_json)
                        await request_route.fulfill(status=response_status, content_type="application/json",
                                                    body=json.dumps({"success": True, "data": {"items": [
                                                        {"id": "abc123", "model_type": "note", "note_card": {"display_title": "Fixture route"}}
                                                    ]}}))
                    else:
                        await request_route.abort()

                # All traffic is intercepted; these tests never contact XHS.
                await context.route("**/*", route)
                page = await context.new_page()
                engine = WebpageSearch()
                engine.connect = AsyncMock(return_value=page)
                if response_status == 200:
                    result = await asyncio.wait_for(engine.search("桂林徒步", 3), 15)
                    self.assertEqual(result[0]["title"], "Fixture route")
                else:
                    with self.assertRaises(SearchError) as caught:
                        await asyncio.wait_for(engine.search("桂林徒步", 3), 15)
                    self.assertEqual(caught.exception.code, "verification_required")
                self.assertEqual(requests, [{"keyword": "桂林徒步", "page": 1}])
            finally:
                await browser.close()

    async def test_search_uses_visible_frame_and_submits_once(self):
        await self.exercise(200)

    async def test_webpage_captcha_response_stops_search(self):
        await self.exercise(461)
