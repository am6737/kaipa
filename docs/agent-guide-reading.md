# Guide Body and Image Reading

## Workflow

`search_travel_web` returns short search snippets. The agent selects one to three
matching results and calls `read_travel_guide` instead of trying more keywords.
This reads the extracted body and returns numbered image candidates. It does
not mean those images have been analyzed. When the body leaves material gaps,
the agent selects candidate IDs with `read_travel_guide_images`.

Image reading returns visible text, directly observed relationships,
uncertainties, the article URL and each image URL/ID. The assistant must not
convert guide distances into exact GPX cumulative distances, infer place names
from scenery, or treat old water/safety claims as current verification. Neither
tool downloads or analyzes video/audio. Extracted text and images are untrusted
evidence, never instructions or authorization to change journey data.

## Configuration and Access

- Public web body extraction uses `TAVILY_API_KEYS` (or the legacy `TAVILY_API_KEY`) with Tavily Extract. Keys are tried in order when an upstream request fails.
  (`advanced`, `include_images=true`, no query-based snippet reranking).
- Vision uses the existing `KAIPA_AI_API_KEY`, `KAIPA_AI_BASE_URL` and
  `KAIPA_AI_MODEL`, with the same OpenRouter fallback as the main agent.
  The configured model/provider must accept Chat Completions image inputs.
- No new database migration is needed. Tool receipts use `agent_tool_calls`.
- Canonical Douyin URLs use the existing `MEDIACRAWLER_SEARCH_URL`'s sibling
  `/content` endpoint and `MEDIACRAWLER_API_KEY`, without Tavily. The gateway
  reuses full publisher captions and galleries from its fresh search cache, or
  reads the selected ID through the existing platform client. It validates
  business status and response shape; errors must not become empty results.
  In particular `status_code=0` with `search_nil_info.search_nil_type=verify_check`
  is a manual-verification requirement, not a successful empty search. The
  gateway reports HTTP 503 and pauses platform requests for five minutes;
  the app preserves the error code and displays a manual-verification message.
  The agent also reuses verification-blocked receipts and excludes that provider
  from further network calls in the same run, including rephrased queries and
  worker recovery. Verification does not trigger cookie refresh or API fallback.
  A video caption is labeled `video_caption`, not a transcript. Video covers
  are not article gallery images. Search results still carry short snippets;
  the full caption and image candidates are returned only by the read tool.
- This change does not introduce an authenticated Xiaohongshu detail endpoint.
  Public Xiaohongshu/article URLs can be attempted through Extract, but platform access
  is not guaranteed. Missing keys, extraction failures and blocked pages return
  unavailable, not a search snippet disguised as a body. No cookie collection,
  CAPTCHA solving, login/paywall bypass or automatic provider fallback is added.

Only URLs returned by this run's searches can be extracted. Vision accepts only
image IDs from successful extraction receipts in this run. Local/IP-literal,
credential-bearing, non-HTTP(S) and nonstandard-port URLs are rejected. Article
extraction is delegated to the Douyin gateway or Tavily. Most image URLs are
delegated to the vision provider. A small exact-host allowlist in
`search/guide-image-input.ts` downloads public CDN images server-side when the
vision provider cannot reach those CDNs. It follows no redirects, sends no
credentials or spoofed headers, limits each image to 4 MB and 8 seconds, and
checks both MIME type and file signature before using a data URL. Other hosts
are never downloaded by the Edge Function. Remote provider controls govern
DNS resolution and redirects for delegated URLs. The API calls themselves reject
redirects so API credentials cannot follow a redirect to another service.

## Budgets and Recovery

Each task/run makes at most one guide discovery search. Verify route identity
against journey/track context before that search. Rephrased queries reuse the
original results without a new provider request or search activity receipt.
Serialization covers concurrent calls and durable receipts cover worker recovery,
including empty/unavailable results. Missing facts remain explicitly unresolved;
a new user task gets a new budget. Transport reference searches are separate.

Per task/run: at most three distinct article URLs, three image-read batches and
six distinct article/image-ID pairs. Each image request has at most four images.
Extraction is limited to 24,000 characters and 12 deduplicated image candidates,
with explicit truncation flags. Extraction and vision requests time out after
25 and 45 seconds respectively, with up to 8 seconds for permitted image CDN
downloads before vision; provider JSON response bodies are capped at
1 MB and 150 KB. The existing overall task timeout remains in effect.

Read operations serialize within the worker. Durable receipts enforce budgets
on recovery, reuse successful results and preserve failed/unavailable results
to avoid repeated provider calls. Overlapping image selections reuse previous
observations. There is no cross-user or cross-run global content cache in this
version, and a changed source may only be refetched in a new task. Provider
token usage, when supplied, is recorded in image tool receipts (not separately
in `agent_model_metrics`). No raw image bytes are stored in conversation history.

The UI reports article extraction and selected-image reading separately and
does not mark an unavailable result as successfully read. Existing light/dark
research-step styles are reused without layout or theme changes.

## Verification

```sh
deno test --allow-env supabase/functions/app-agent/search/douyin-reader_test.ts supabase/functions/app-agent/search/guide-reader_test.ts supabase/functions/app-agent/guide-tools_test.ts supabase/functions/app-agent/tools_test.ts
node --test scripts/test-assistant-guide-progress.cjs
npx tsc --noEmit
```

Tests mock providers: extraction shape, limits, challenges, errors, vision
payloads, image-ID provenance, durable replay, parallel budgets and progress
states. They do not prove live platform access or real-model OCR quality.
Deploy through `infra/supabase/deploy-functions.sh app-agent`; background worker
updates follow the existing self-hosted worker deployment process.

## Douyin Live Diagnosis (2026-09-09)

The configured gateway returned HTTP 200 and empty arrays for both a detailed
Hatian query and `哈天线`. A comparison using the existing login profile found
`status_code=0`, `data=[]`, and `search_nil_info.search_nil_type=verify_check`.
The normal browser search title was `验证码中间页`. Automated platform requests
must stop until a person completes verification; this is not a legitimate
zero-result query and no verification bypass is implemented.

The adjacent MediaCrawler checkout owns the gateway changes:
`tools/douyin_content.py`, `tools/search_runtime.py`,
`media_platform/douyin/core.py`, and `api/routers/kaipa.py`.
Run `.venv/bin/python -m pytest tests/test_douyin_content.py tests/test_kaipa_gateway.py tests/test_kaipa_browser_search.py -q`
from that checkout. `tools/diagnose_douyin.py` performs a bounded API/browser
comparison using a disposable copy of the existing login and refuses to start
a new login flow. Do not run it repeatedly while verification is pending.

## Tavily Live Verification (2026-09-09)

With the operator-supplied key in the private runtime environment, a Hatian
search returned six sources in 5.5 seconds. Extract retrieved 4,522 characters
from a 2bulu article and 17,912 characters from
`https://post.smzdm.com/p/a70kwp3d` in 2.2 and 2.6 seconds respectively.
The 2bulu images were largely interface/placeholder assets, not usable route
diagrams; known placeholders, avatars and QR-code candidates are now filtered.

The configured vision model could not fetch the SMZDM CDN image remotely.
The bounded exact-host image downloader allowed recognition to complete in
11.6 seconds (733 provider-reported tokens). The selected image was a landscape
photo, not a route diagram; the result explicitly could not establish location,
altitude or current safety. This confirms real image input, not the accuracy of
route-map OCR or the article's factual claims. The source includes AI-article
labeling, so its image is not independent proof of actual trail conditions.

`supabase/functions/app-agent/guide-reading.integration.ts` supports `search`, `read <URL>` and
`vision <image IDs>` phases. Load only the private runtime environment using
`--env-file`, and supply the actual deployed `KAIPA_AI_MODEL` for vision because
Docker Compose defaults are not present in the raw environment file. The probe
writes public article artifacts to `/tmp/kaipa-guide-live.json` with mode 0600,
never credentials, and does not modify journey data.
