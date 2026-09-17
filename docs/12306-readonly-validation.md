# 12306 MCP Read-Only Validation

## Scope and Reproduction

- Date: 2026-09-09, approximately 03:18-03:19 UTC / 11:18-11:19 Asia/Shanghai.
- Upstream: https://github.com/Joooook/12306-mcp
- Version: `0.3.10`; commit `ff6439da6f63d7d72181abea4568abd69878c600`.
- Isolated checkout: `/tmp/kaipa-12306-validation-qzutJa/source`.
- Installed the lockfile with `npm ci --ignore-scripts --no-audit --no-fund` and
  compiled with the project's pinned TypeScript compiler. No upstream source edits.
- Ran MCP over stdio with a minimal environment, no application credentials, no
  HTTP listener, no booking operations and no CAPTCHA/TLS bypass.
- Parent-enforced startup/request deadlines and two-second spacing between calls.
  The client and child server were closed after testing.
- Live harness/report: `validate.mjs` and `report.json` in the isolated directory.
- Offline harness/report: `offline-checks.mjs` and `offline-report.json` there.
  Offline checks extract upstream functions using the TypeScript AST and inject
  dependencies; they do not make provider requests or alter upstream source.

## Live Results

MCP initialization succeeded and exposed eight read-only tools. Eight tool calls
were made in one session:

| Case | Result |
| --- | --- |
| Current date | Returned `2026-09-09` in Shanghai's calendar. |
| Station lookup | Returned Nanning East `NFZ`, Guilin North `GBZ`, Yangshuo `YCZ`, Guilin `GLZ`. |
| Past date | Returned an error message, but did not set MCP `isError`. |
| Unknown station | Returned an error message, but did not set MCP `isError`. |
| Nanning East to Guilin North, 2026-09-11 | Returned train times, class prices and availability; approximately 484 ms after initialization. Results included a different Guilin-city station. |
| Yangshuo to Nanning East, 2026-09-11 | Returned train times, class prices and availability; approximately 200 ms. |
| Yangshuo to Nanning East via Guilin | Returned two limited results; approximately 301 ms. Both were marked `same_train=true`, and their actual intermediate station was Guilin North. |
| Date 40 days ahead, 2026-10-19 | Returned MCP error `Cannot read properties of undefined (reading 'result')`, not a meaningful presale-window status. |

Examples observed, not current guarantees or reservations:

| Date | Route | Train | Departure / Arrival | Second class snapshot |
| --- | --- | --- | --- | --- |
| 2026-09-11 | Nanning East to Guilin North | G2340 | 06:25 / 08:44 | CNY 121.50, availability `有` |
| 2026-09-11 | Yangshuo to Nanning East | D8270 | 19:26 / 22:32 | CNY 157.50, availability `有` |

The latter is a useful evening-return candidate to evaluate against the hiking
finish and station transfer, not a claim that the full hiking connection has been
verified. Prices and seats can change and require checking before purchase.

## Integration Risks Confirmed

1. Exact-station queries can include nearby/same-city station results. Enforce
   telecode matching for exact-station intent, or explicitly expose alternatives
   and recalculate local transfers. Apply limits after this filtering.
2. A same-train split itinerary is not an ordinary train change. Preserve
   `same_train`, actual station codes, segment identities and ticket/seat caveats.
   The observed four-minute interval must not be advertised as a general safe
   transfer time.
3. Normalize text errors as well as MCP `isError`. A successful MCP envelope does
   not mean a successful railway query. Never turn a failed query into no seats.
4. Validate calendar dates and the currently applicable sale window before
   upstream calls. Out-of-window responses must not become raw parser errors.
5. The network helper has no explicit timeout and startup depends on parsing live
   HTML/JS. Add bounded requests, initialization health checks, conservative
   concurrency, short-lived caching and circuit breaking.
6. Use JSON results and validate all fields. The public-site endpoints and custom
   pipe-field parsing are not a versioned developer contract or an availability SLA.

## Offline Checks

- `checkDate('2027-02-30')` returned true: impossible future calendar dates can pass.
- A synthetic 23:30 departure plus two hours correctly produced next-day arrival.
  This does not establish correctness for boarding a long-distance train on a day
  later than its original departure date; the parser uses `start_train_date`, so
  that case needs separate reconciliation with the requested boarding date.
- Injected network unavailability returned text `Error: get tickets data failed.`
  without an MCP error flag.
- Injected provider data without `data.result` threw the same property-access
  error observed for the live out-of-window query.

## Decision

Technically viable for a guarded read-only pilot: actual 12306-backed train queries
worked from this environment without a commercial API key. This supersedes any
inference that no railway data can be queried merely because a public developer
API application was not found.

Implemented follow-up: a pinned internal sidecar behind `search_transport`
validates and normalizes direct exact-station queries. The subsequent connection
extension exposes single-page two-leg candidates with explicit time/station
assessments; same-train splits are labelled and never approved as transfers. See
[integration safeguards and deployment](rail-query-integration.md).
Retain official 12306 manual verification and explicit retrieval timestamps.
MIT code licensing does not itself settle upstream data-use terms or provide a
service guarantee.

No production application code, Agent provider settings, user journeys, database
records or deployed services were changed by this validation.
