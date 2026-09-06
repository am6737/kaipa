# Kaipa app-agent

The app agent reads the signed-in user's Kaipa data and searches configured
travel sources through one normalized tool. All credentials stay in the Edge
Function environment.

## Required secrets

```bash
supabase secrets set \
  KAIPA_AI_API_KEY=... \
  KAIPA_AI_BASE_URL=https://ai.dootask.com/v1 \
  KAIPA_AI_MODEL=gpt-5.6-sol \
  AMAP_WEB_KEY=... \
  TRAVEL_SEARCH_SOURCES=tavily \
  TAVILY_API_KEY=...
```

`AMAP_WEB_KEY` is also used by the separate authenticated `map-search` function
for client place search and reverse geocoding. Deploy it after setting secrets:

```bash
infra/supabase/deploy-functions.sh map-search
```

Never expose this key through an `EXPO_PUBLIC_` environment variable.

If the project already has `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, the
agent uses those when `KAIPA_AI_API_KEY` is absent. In that case the base URL
defaults to `https://openrouter.ai/api/v1`.

`TRAVEL_SEARCH_SOURCES` is a comma-separated list. Supported values are
`tavily`, `xhs`, and `douyin`. When omitted, it defaults to `tavily`, preserving
the original behavior.

Optional search controls:

```bash
supabase secrets set \
  TRAVEL_SEARCH_TIMEOUT_MS=8000 \
  TRAVEL_SEARCH_MAX_RESULTS=10
```

Each provider has an independent timeout. Successful providers still return
results when another provider is unavailable, fails, or times out. Results are
interleaved across sources and deduplicated by URL. Xiaohongshu and Douyin run
in parallel through separate crawler processes. Requests for the same platform
remain serialized so they do not compete for one browser profile.

## MediaCrawler gateway

MediaCrawler must run as a separate Linux service. Do not place browser state,
cookies, or platform credentials in the Edge Function or mobile app. Kaipa
expects an authenticated gateway in front of the crawler:

```bash
supabase secrets set \
  TRAVEL_SEARCH_SOURCES=tavily,xhs,douyin \
  MEDIACRAWLER_SEARCH_URL=https://crawler.example.com/v1/search \
  MEDIACRAWLER_API_KEY=...
```

Kaipa sends:

```json
{
  "platform": "xhs",
  "query": "玉龙雪山徒步",
  "limit": 6
}
```

`platform` is `xhs` or `dy`. The gateway must return a `results` array:

```json
{
  "results": [
    {
      "title": "玉龙雪山徒步路线",
      "url": "https://www.xiaohongshu.com/explore/...",
      "snippet": "路线和体验摘要",
      "publishedAt": "2026-08-01T08:00:00Z",
      "score": 0.82
    }
  ]
}
```

The adapter also accepts common MediaCrawler field names such as
`display_title`, `note_url`, `aweme_url`, `desc`, and `create_time`. The gateway
must validate the bearer token, rate-limit requests, and never return cookies
or login state.

The standalone gateway included in the adjacent MediaCrawler workspace reads
`KAIPA_GATEWAY_API_KEY` and exposes only `/health` and `/v1/search`. Start it with:

```bash
KAIPA_GATEWAY_API_KEY=replace-with-a-long-random-value \
KAIPA_GATEWAY_SEARCH_TIMEOUT_SECONDS=120 \
XHS_SEARCH_WORKERS=2 \
DOUYIN_SEARCH_WORKERS=2 \
SEARCH_QUEUE_LIMIT=20 \
SEARCH_QUEUE_TIMEOUT_SECONDS=20 \
SEARCH_CACHE_TTL_SECONDS=600 \
uv run uvicorn api.kaipa_gateway:app --host 127.0.0.1 --port 8072
```

Each worker has an isolated browser profile initialized from the authenticated
platform profile. Search-only requests return first-page results over a
structured subprocess channel without writing shared JSONL files or fetching
every post detail. Identical in-flight queries are coalesced and completed
results are cached for the configured TTL. Queue overflow returns HTTP 429.

`127.0.0.1` is appropriate when the hosting platform publishes the port through
HTTPS. Otherwise, place a TLS-terminating reverse proxy in front of this port.
Do not expose the separate MediaCrawler WebUI API to the public internet.

Deploy after updating the function:

```bash
infra/supabase/deploy-functions.sh app-agent
```

When every enabled source is absent or unavailable, `search_travel_web` returns
an explicit unavailable result. The agent may continue with Kaipa journey,
route, and gear data, but it must not claim that live research was performed.

Community results from Xiaohongshu and Douyin are labeled with
`reliability: community`. They are suitable for discovery and inspiration, not
for critical facts such as closures, safety notices, timetables, or opening
hours.

The client passes a run UUID and polls `run_activity` while planning. Completed
assistant messages persist a compact `activities` summary alongside `sources`
and `planPreview` in `agent_messages.ui`, so the work log, research citations,
and itinerary preview survive conversation reloads.

Writes execute without interrupting the conversation. A completed run containing
reversible writes exposes one persistent "undo changes" action. Undo runs all
inverse operations in reverse order inside one database transaction. Deletions
execute directly but still require the current journey context and exact item IDs.

Apply `supabase/app-agent.sql` before deploying a function version that exposes
undo. The file is idempotent and adds the undo metadata plus the transactional
apply, finalize, and undo RPCs used by the Edge Function.
