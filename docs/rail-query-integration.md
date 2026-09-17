# Read-Only Railway Integration

Implemented 2026-09-09 using Joooook/12306-mcp 0.3.10, pinned commit
`ff6439da6f63d7d72181abea4568abd69878c600`. This is an unofficial adapter to public
12306 queries, not an authorized developer contract or booking service. Upstream
MIT licensing does not settle data-use terms, rate allowances or commercial use.

## Boundaries

- Agent `search_transport(mode=rail)` calls only `http://rail-query:8787/query`.
  The URL is server configuration, never model input; redirects are refused.
- Internal Docker service exposes only `POST /query` and `GET /health`, with no
  published host port. Health means facade liveness, not 12306 availability.
  It trusts the existing Supabase private network; do not publish it or attach
  untrusted workloads. There is no HTTP authentication or public access contract.
- Upstream runs over stdio with a minimal environment, no app credentials and no
  arbitrary tool dispatch. Only exact-station lookup and direct or interline ticket
  lookup are called. No login, booking, payment, CAPTCHA/TLS bypass or retry.
- Container is nonroot, read-only, drops capabilities, uses bounded temporary
  storage, memory, CPU and processes. Build installs the pinned lockfile without
  lifecycle scripts. Base Node image security updates remain an operator task.

## Query Protections

- Validate the real calendar in Asia/Shanghai. Past/invalid dates are rejected;
  the conservative presale query window is today through today+14 inclusive.
  Later dates return `not_on_sale` without contacting 12306. This does not assert
  sale opening at midnight: station release times and special notices still apply.
  Review the 15-day policy if official sale rules change.
- Resolve exact Chinese station names to telecodes. Do not strip suffixes or
  silently use city/nearby stations. Filter upstream results by both requested
  codes/names before sorting and limiting to ten offers.
- `earliestHour` (0-23, null/default 0) filters departures before limiting, so an
  evening return is not hidden behind the first ten morning trains.
- Require JSON data, not just a successful MCP envelope. Error text, malformed
  data, invalid station records, unexpected response types and inconsistent times fail
  closed. Never send raw upstream errors to the model or UI.
- Rebase departure on the requested boarding date, derive arrival from duration,
  verify the arrival clock and include explicit `+08:00` offsets.
- Prices are per adult (`pricedAdults=1`), not a group quote. Preserve seat
  availability strings, including unknown `--`; never promise group availability.
- Default queries remain direct. Set `viaStation` to an exact interchange arrival
  station for two-leg connection candidates. This field also isolates cache keys.
- Connection results retain actual arrival/departure stations, internal train IDs,
  both legs' timestamps, durations and seat/fare snapshots. They have no synthetic
  through fare or group quote. The Edge adapter independently validates continuity,
  waiting time, identities and the sidecar's assessment before exposing results.
- `buffer_met` means two different trains at the same station, with at least 45
  minutes. This is a conservative planning floor, NOT an official minimum transfer
  time, proof of station transfer access, delay protection or ticket guarantee.
- `insufficient_buffer` is below that floor; `station_change_unverified` needs
  independently verified ground transport and boarding buffers even with a large
  gap. Both are `usableForPlanning=false`, not approved transport options.
- `overnight_unverified` marks a calendar-date change while waiting at the
  interchange, not merely an overnight train ride. Station opening, exit/re-entry
  and a safe rest/accommodation plan require checking; time alone cannot approve
  it. It is also `usableForPlanning=false`.
- `same_train_split` uses both provider flags and internal train identities (plus
  matching train numbers) to detect split tickets even when the displayed train
  number changes. It is not an ordinary transfer and is also unusable as one.
- Candidates with adequate time rank first, before the ten-result cap. Other
  candidates remain explicitly labelled so the Agent can explain exclusions.
  `status=results` means candidates were retrieved, not that any passed assessment.
- Waiting time is parsed from the upstream hours/minutes field and reconciled
  with total duration, leg clocks and the summary boarding/interchange/arrival
  dates. Crossing midnight does not silently turn into same-day travel.
  The onward boarding date must also be within the presale window; otherwise the
  query fails closed with `not_on_sale`, never fabricated onward availability.
- A small auditable build patch changes the upstream interline pagination loop
  to one iteration. `limitedNum=100` avoids premature trimming within that first
  page, while the wrapper filters exact stations and applies its own cap. No
  unbounded pagination or repeated hub/date searches. Coverage is explicitly
  partial; empty does not rule out other trains or connections. The source commit
  remains pinned; `upstream-single-page.patch` is the only upstream source change.

## Resource Limits

- One active query and at most one waiting query, to support concurrent outbound
  and return tool calls. Additional queries return `rate_limited`.
- Two seconds between queries, one second between station lookup and ticket lookup.
- Each child session has a 22-second total deadline including initialization;
  individual MCP calls time out at 12 seconds. SDK close terminates the child on
  completion/error/timeout, waiting for SDK termination before releasing the
  concurrency slot (up to four seconds of graceful/forced cleanup). Edge adapter
  deadline is 60 seconds including the
  bounded queue and child cleanup. There are no upstream retries.
- Cache at most 100 successful query snapshots for 60 seconds, including empty
  results. Cached results retain the original `retrievedAt`; never cache errors
  as empty results or serve stale entries after TTL.
- Three provider failures open a 60-second circuit breaker; invalid user inputs
  do not count. The next admitted query probes recovery without an automatic retry.
- HTTP body is bounded to 2 KiB; connections, request bodies and headers have limits.

## Self-Hosted Deployment

```bash
bash infra/supabase/deploy-rail-query.sh
bash infra/supabase/deploy-functions.sh app-agent
```

The first command installs/builds the service and adds `RAIL_QUERY_URL` to the
functions container via `rail-query.compose.yml`. It does not modify secrets,
databases or the worker. The second uses the project's self-hosted function
deployment path. Never use Supabase Cloud deployment commands.

When later recreating the full Docker stack, include `-f rail-query.compose.yml`
alongside the base Compose file (and other required overrides), or rerun the
rail deployment script. Plain base-only recreation can remove the environment
mapping; a function-code restart alone cannot restore it. To disable queries,
stop `kaipa-rail-query`; the tool degrades explicitly without ticket claims.

## Verification

```bash
node --test infra/supabase/rail-query/*.test.mjs scripts/test-assistant-transport-progress.cjs
npx tsc --noEmit
cd supabase/functions/app-agent
deno test --allow-env search/rail_test.ts search/transport_test.ts tools_test.ts
deno check agent.ts index.ts
```

Real-model regression from the workspace root (disposable account, no user data):

```bash
node scripts/test-agent-transport-e2e.mjs --case=rail-readonly-live --report=/tmp/kaipa-rail-live-e2e.json
node scripts/test-agent-transport-e2e.mjs --case=rail-connection-live --report=/tmp/kaipa-rail-connection-e2e.json
node scripts/test-agent-transport-e2e.mjs --case=rail-transfer-buffer-live --report=/tmp/kaipa-rail-buffer-e2e.json
```

Private-service live smoke (two sequential upstream calls from concurrent HTTP
requests, cache timestamps, date guards and disabled arbitrary tool route):

```bash
docker exec -i kaipa-rail-query node --input-type=module < scripts/test-rail-query-live.mjs
docker exec -i kaipa-rail-query node --input-type=module < scripts/test-rail-connections-live.mjs
```

Live sidecar evidence on 2026-09-09: for travel on September 11, exact Nanning East
to Guilin North returned ten capped direct offers, including G2340 06:25-08:44,
second class CNY 121.50 per adult. Yangshuo to Nanning East after 18:00 returned
D8270 19:26-22:32 (second class CNY 157.50) and G3742 19:35-22:27. These are dated
snapshots, not current seat guarantees. October 15 returned `not_on_sale`.

The first real-model run exposed concurrency rejection of the return leg. The
bounded one-item waiting queue addresses this without relaxing upstream single
concurrency or adding retries. The regression checks both live directions,
explicit evening filtering and unchanged itinerary/date/packing data.

Verification outcome on 2026-09-09:

- 11 Node policy/queue/UI tests and 29 Deno adapter/tool/transport-review tests
  passed; application TypeScript and Deno agent/index checks passed.
- Queued real-model run passed in 115 seconds with ten outbound and two evening
  return offers. It identified that 08:44 arrival cannot meet the original 07:30
  hike start, kept final-mile feasibility unverified, and preserved all fixture
  itinerary/date/packing data. Disposable account and journeys were removed.
  Local report: `/tmp/kaipa-rail-live-e2e-queued.json`.
- Final deployed-service smoke passed at 03:42 UTC: both concurrent directions
  succeeded, cache preserved its original timestamp, invalid/out-of-window dates
  had distinct statuses, and arbitrary tool dispatch returned HTTP 404.
- Final container inspection: healthy, nonroot, read-only, no published ports.

## Connection Follow-Up

Live queries on 2026-09-09 for travel on September 11 returned:

- Yangshuo to Nanning East via Guilin North after 18:00: two four-minute splits,
  D8270/D8271 and G3742/G3743. Both retained identical underlying train IDs and
  were marked `same_train_split`, never approved as four-minute transfers.
- Nanning East to Shanghai Hongqiao via Changsha South: six candidates on the
  first page. G3592/G252 had 52 minutes at Changsha South and passed the time-only
  floor. Four other candidates had 34-44 minutes and were marked insufficient;
  G264/G264 was a five-minute same-train split. These remain snapshots, not
  purchasable itinerary guarantees or evidence of official station transfer rules.

Synthetic regressions additionally cover cross-station rejection, overnight
dates, inconsistent metadata, identity/flag disagreement and exact hub filtering.

Connection follow-up verification: 20 Node policy/queue/presentation tests and
32 Deno adapter/tool/review tests passed, along with application TypeScript and
Deno agent/index checks. Both real-model cases passed with disposable accounts
cleaned up: the split-ticket case took 76 seconds and the ordinary-transfer case
72 seconds. The latter correctly separated the 52-minute candidate from the
34-44-minute candidates and the same-train split, and explicitly denied any
official transfer/seat guarantee. No fixture itinerary, date or packing writes
occurred. Local reports are `/tmp/kaipa-rail-connection-e2e.json` and
`/tmp/kaipa-rail-buffer-e2e.json`.
