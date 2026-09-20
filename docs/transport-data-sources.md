# Transport Data Sources and Routing

Verification date: 2026-09-08. Public documentation was inspected; no provider
contract was signed and no production ticket inventory was accessed.

Follow-up on 2026-09-09: isolated read-only tests of Joooook/12306-mcp successfully
returned actual 12306-backed train times, prices, availability and interline data.
See [the validation report](12306-readonly-validation.md) for the pinned version,
observed results and required safeguards. The earlier lack of a verified public
developer API must not be interpreted as an inability to query railway data.
The railway adapter now uses a guarded, internal read-only sidecar. See
[deployment and limits](rail-query-integration.md). This is not an authorized
12306 developer or booking API.

## Findings

| Service | Verified evidence | Decision |
| --- | --- | --- |
| [12306](https://www.12306.cn/index/) | Public queries worked through pinned Joooook/12306-mcp; no authorized developer API contract was established. | Guarded read-only direct-train pilot, with official manual revalidation. No account login, booking or restriction bypass. |
| [Amadeus Flight Offers Search](https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search) | Official [OpenAPI specification](https://github.com/amadeus4dev/amadeus-open-api-specification/blob/main/spec/json/FlightOffersSearch_v2_swagger_specification.json) documents dated IATA origin/destination searches, adult count, currencies and offers. Official [SDK](https://github.com/amadeus4dev/amadeus-node) documents API key/secret and separate test/production environments. | Implement a production-only read adapter. Production credentials, commercial terms, quotas, China domestic coverage and actual route availability must be confirmed with the account/provider. Test inventory is explicitly a subset and cannot validate real availability. |
| [Duffel](https://duffel.com/docs/guides/getting-started-with-flights) | Official getting-started documentation describes account setup, access tokens and flight offer integration. | A viable alternative for evaluation, not enabled. Production onboarding, commercial terms and relevant Chinese airline coverage remain to be confirmed. |
| [Ctrip Open Platform](https://open.ctrip.com/) | Official portal responds, but the public shell did not establish current railway/aviation API permissions, commercial eligibility or detailed schemas. | Contact the platform for approved rail/flight products and contracts before selecting an adapter; do not assume portal access grants ticket data rights. |
| [Aviationstack](https://aviationstack.com/documentation) | Documentation endpoint redirects to APILayer documentation. A usable fare/seat offer contract was not established in this review. | Not selected as the ticket-offer source. Flight-status data must not be presented as a purchasable fare or available seat. |

For domestic China use, first obtain an approved distribution/data contract and
verify sample Nanning/Guilin and other target-route queries. A documented global
flight API alone is not evidence of comprehensive domestic airline coverage.

## Implemented Routing

- `search_transport` accepts a mode, travel date, origin, destination and adult
  count, plus an optional rail departure-hour lower bound. Railway queries use
  exact station names, Shanghai dates, per-adult fares and timestamped seat
  snapshots. Optional `viaStation` queries bounded two-leg candidates with explicit
  same-train, time-buffer and station-change assessments, not guaranteed through
  offers. The sidecar never exposes arbitrary MCP calls.
- Flight requests use the documented Amadeus production OAuth endpoint and
  Flight Offers Search GET endpoint only when production credentials are enabled.
  They preserve provider airport-local timestamps and the total price for the
  requested adult count. They do not book or reprice tickets.
- `not_configured`, `not_integrated`, `invalid_request`, `provider_error`, `empty`
  and `results` are distinct. None of the first five proves that no service exists
  or that tickets are sold out. Returned offers still need purchase-time repricing.
- `search_travel_web` has an explicit `purpose`. Transport reference queries use
  only the web provider, excluding community crawlers regardless of configured
  source order. A keyword backstop routes legacy train/flight/transfer queries the
  same way even when purpose is omitted or incorrectly set to `guide`.
- Web-provider transport searches exclude XHS/Douyin/TikTok domains in the request
  and filter their returned URLs. Other web results are still only `web`
  references: operator provenance/date must be checked, not assumed official.
- Guide queries retain the existing sources. Transportation-specific progress
  labels distinguish reference research from live flight-offer lookup and state
  unavailable access explicitly.

## Credentials and Current Limits

At inspection, the running Edge Functions container had no populated
`TAVILY_API_KEYS` (or the legacy `TAVILY_API_KEY`) and no Amadeus credentials. The subsequent railway sidecar
deployment activates rail snapshots only; live flight access is still unconfigured.

Server-only configuration (no `EXPO_PUBLIC_` variables):

- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- `AMADEUS_ENVIRONMENT=production`
- `TAVILY_API_KEYS` (comma/newline-separated; `TAVILY_API_KEY` remains supported) for web references, not live inventory
- `RAIL_QUERY_URL=http://rail-query:8787`, set by the railway Compose override

The self-hosted setup script now supports these names. Existing deployments also
need the corresponding Docker Compose environment mappings and a functions
container recreation after credentials are installed; a function-code deploy or
container restart alone does not add new environment variables. Do not run the
entire bootstrap script merely to change a credential without reviewing its scope.

No secrets were created, printed, or committed. API responses are validated and
reduced to a small offer schema. Provider URLs are fixed, model arguments cannot
redirect credentials, and provider failures do not expose response bodies or keys.

## Checks

```bash
npx tsc --noEmit
npx --yes deno check supabase/functions/app-agent/index.ts
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/search/transport_test.ts supabase/functions/app-agent/search/aggregate_test.ts supabase/functions/app-agent/task_test.ts
```

Adapter tests mock provider responses. They verify the documented request shape,
production-only gating, group-price semantics, invalid responses, secret-safe
errors and the absence of community fallback. They do not demonstrate production
coverage or real ticket availability. The existing native assistant layout and
theme are reused; actual device presentation remains a release check.

Live self-hosted regression on 2026-09-08:

```bash
node scripts/test-agent-transport-e2e.mjs --case=transport-source-routing --report=/tmp/kaipa-transport-routing-e2e.json
node --test scripts/test-assistant-transport-progress.cjs
```

The configured real model queried rail and flight through `search_transport` and
used transport-only web references for local transfers, with no community provider
calls. It reported missing provider access, compared rail and air chains without
inventing confirmed services, and left journey/date/packing data unchanged. The
disposable account and journeys were removed. This validates routing and truthful
degradation, not a successful live ticket query; production credentials are still
absent.
