# Transport Planning

## Default full-journey scope (2026-10-08)

Smart planning includes round-trip main transport, trail transfers, hiking,
necessary accommodation and packing unless the user explicitly declines travel.
The date range and generic day count cover departure through return, including
time on the road. Separately requested hiking days remain a distinct constraint.
`includeRoundTripTransport` defaults to true for legacy task decisions as well;
the interpreter records explicit exclusions with user evidence.

The full planner can query rail/flight and ground transport, then review the
combined travel/hiking window. Available current location supplies the default departure/return place without confirmation; only unavailable location plus a missing explicit origin triggers a question;
missing return legs or travel outside the total trip window keep the plan
incomplete. Service estimates remain unverified even when timing is consistent.
GPX recording days are route references and cannot supply total trip duration.
An unspecified total is estimated during complete journey planning and retained
in `derivedDays`, separately from the user's `days`.

Planner items use `custom` for transport/rest, `stay` for accommodation and
`activity` for hiking. Endpoint completeness counts hiking activity groups and
existing boundaries, excluding transport-only days. Full plans no longer offer
transport as an optional follow-up. Existing transport-only follow-ups retain
their limited write scope and preserve saved hiking arrangements.

The checks cover deterministic planning/creation guards and endpoint completion;
live provider/model behavior still needs a deployment smoke test.

## Independent main-transport step (2026-10-08)

Full hiking plans use the available current location as the default departure/return city, with explicit user places taking precedence. Without a mode preference they compare rail and flight; self-drive is included when requested. The interpreter extracts
`travelRequest` with verbatim user quotes; a preference answer continues the
original full-journey scope. A usable named GPS fix supplies the default departure city without a confirmation round. The smart-planning entry can reuse an already authorized
one-shot fix; explicit location action requests permission when needed. Manual
city input remains available.

The durable `transport` stage now runs for a single-route full journey as well
as a multi-route one. It resolves query endpoints, then deterministically calls
`search_transport` for dated 12306/FlyAI offers (production Amadeus fallback when FlyAI is not configured) or
`search_ground_transport` for AMap driving distance/time/tolls. `mainTravel`
retains requests, actual results, concrete timeline rows and limitations; the
existing `segments` still describes inter-route transfers. One usable mode per
direction is selected in the user's mode order; alternatives remain in the
artifact. This selection is not an optimization of cost or total journey time.
Rail queries default to outbound departures after 06:00 and return departures
after 08:00 (18:00 for a one-day round trip); these are planning defaults, not
proof of a workable connection. Available lower-priced seats are used for the
per-person price. The itinerary model plans connecting transfers, lodging and
hiking against these results. Provider-derived main-transport rows replace duplicate or speculative model
service rows before saving and during repair, while local ground transfers
remain separate. Unknown dates, unavailable providers, unusable rail
connections and sold-out results cannot become invented timed service rows.
When total days are undecided, the endpoint step can propose total days with an explicit allocation of hiking, city travel, trail access and buffers, then query a candidate return date. This estimate stays separate from user-provided days; route-recording days alone cannot establish total duration.

Real flights use the private FlyAI query service when configured; otherwise production Amadeus credentials are required. AMap driving results are
road estimates, not real shuttle availability or proof of road access. No
booking is made. No SQL migration or native permission change is required.

Checks:

```bash
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/main-transport_test.ts supabase/functions/app-agent/search/ground-transport_test.ts
node scripts/test-agent-main-transport-e2e.mjs --report=/tmp/kaipa-main-transport-e2e.json
```

Self-hosted validation on 2026-10-08 passed the real three-turn intake and
planning flow with a disposable account. The 2026-10-10 outbound G2340
(Nanning East → Guilin North, 06:25–08:44, second class CNY 121.50/person)
and 2026-10-12 return D919 (Guilin North → Nanning East, 08:04–10:17,
second class CNY 144.50/person) were generated from provider responses and
saved with the other itinerary items; the save stage had no failed operations.
These are dated test snapshots, not booking or current availability promises.
The plan correctly remained partial because local access and trail operation
were unverified. Disposable journeys, threads and account were removed.
A separate live AMap check returned Chengdu → Kangding road distance/time/tolls.
The Edge container was reconnected to the private rail sidecar using the rail
deployment script; production flight credentials remain unconfigured.

## Transport follow-ups

The transport follow-up reuses confirmed journey travel facts, suggests a one-shot
device location when useful, and plans a continuous outbound/return chain while
preserving the saved hike. No SQL migration is required.

## Location and Confirmation

- The transport quick-reply and smart-planning entry opportunistically collect
  an already authorized fix. Accommodation and ordinary unrelated messages do not.
- A confirmed origin or explicit location refusal suppresses this collection for
  the same journey. New journeys do not inherit these facts.
- Unrequested OS permission prompts are avoided. `permission_required` lets the
  agent offer a `request_location` button alongside manual place input.
- A usable named current device location is the default departure and return place without a confirmation question. Explicit user places override this default; location refusal is respected.
- Reverse geocoding retains only region/city/district. Unsupported or failed
  geocoding keeps the fix; stalled geocoding is bounded. Existing coordinate,
  accuracy, timestamp and stale-fix checks remain in place.

## State and Planning

`travelContext` is structured assistant-message UI metadata: journey ID, confirmed
origin/return place, direction, preferences, bookings and location refusal. It is
fed into subsequent execution turns, restored in client history, and kept distinct
from GPS. The server assigns the authoritative journey ID. Its contents are model
extractions of user confirmations, not a separate booking record or write grant.

The travel skill compares complete rail/air/road/local-transfer combinations,
including different outbound/return hubs, carpool fallback and self-drive vehicle
retrieval. It works backwards from hike start and forwards from hike finish.
Conflicts require a user decision before changing dates, hiking times or lodging.
Single fully specified transport insertions retain the existing narrow path.

`review_transport_plan` is a read-only consistency tool for full-chain planning.
It checks endpoints, inter-leg transfers, buffers, the saved hiking window supplied
by the agent, one-way scope, carpool fallback and vehicle-retrieval information.
It flags extra travel dates and separates unverified service facts from temporal
consistency. The skill requires review before saving, but this is not a database
enforcement gate and does not prove that model-supplied times or sources are true.
Existing write scope, itinerary conflict checks and duplicate protection remain
the authoritative write safeguards.

## Validation and Deployment

```bash
npx tsc --noEmit
node --test scripts/test-agent-location.cjs scripts/test-assistant-planning-follow-ups.cjs
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/transport-review_test.ts supabase/functions/app-agent/task_test.ts supabase/functions/app-agent/planning-follow-ups_test.ts supabase/functions/app-agent/itinerary-validation_test.ts supabase/functions/app-agent/session-memory_test.ts
```

Mocked location tests and deterministic review tests do not replace native-device
permission/geocoding checks or live-model evaluation. Existing assistant controls
are reused without a new layout; check location and confirmation replies on a
device in light and dark appearance before release.

Deploy the backend only with `infra/supabase/deploy-functions.sh app-agent` against
the self-hosted runtime, then reload the native app's updated JavaScript. Native
permission configuration is unchanged. Live flight/rail queries do not perform bookings.

## Live Model Regression

`scripts/test-agent-transport-e2e.mjs` runs the configured self-hosted model and
background worker with a disposable account. Locations are synthetic request
payloads, not actual device GPS. The script removes its account and journeys in
`finally` and checks itinerary/date/packing snapshots, saved confirmation state,
task receipts and actual model tool calls.

```bash
node scripts/test-agent-transport-e2e.mjs --report=/tmp/kaipa-transport-e2e.json
node scripts/test-agent-transport-e2e.mjs --case=location-candidate --report=/tmp/kaipa-transport-location.json
node scripts/test-agent-transport-e2e.mjs --case=save-reviewed-complete-chain --report=/tmp/kaipa-transport-save.json
```

Cases cover candidate-location confirmation, researched round-trip chains,
corrected return destinations despite a new GPS fix, narrow transfer insertion,
duplicate avoidance, permission handoff, location refusal, and saving a reviewed
complete chain. Reports include model responses and synthetic fixture snapshots;
do not substitute real user journeys when running this script.

Live evaluation exposed two presentation/scope issues: a pending location question
could be omitted from the visible response, and transport connections could be
misinterpreted as mandatory GPX hiking endpoint writes. The response renderer now
appends missing waiting questions without duplicating a visible terminal question;
the task interpreter explicitly distinguishes transport stops from cumulative GPX
endpoints. A transport-only save normally requires only `add_itinerary_items`.

2026-09-08 self-hosted validation used the configured `gpt-5.6-sol` model. All eight
distinct cases passed across the initial run and targeted post-fix regressions.
The final full-chain run called `review_transport_plan`, saved exactly three new
transport rows, retained the original hike/date/packing snapshots, and reported
`completed` with only `add_itinerary_items` required. Disposable accounts and
journeys were removed after each run. The deployed task and response-rendering
files were hash-checked against this checkout; the Edge Functions service was
healthy. Actual phone GPS/permission behavior and light/dark UI remain separate
device checks.

## Empty rail result audit (2026-10-08)

The latest Dangling run queried exact stations 南宁东→成都 and returned empty.
A read-only live check using the same 2026-10-08 date and earliestHour=6 found
that 成都 remained empty, while 成都东 returned G3594, D1728 and G3586.
The request selected the wrong destination station; this was not a provider
outage or evidence of no trains to Chengdu city. These are dated snapshots.

Endpoint guidance now distinguishes city names from high-speed hubs and prefers
成都东 for Chengdu-region high-speed travel. Each direction can have at most one
explicit same-city alternative station pair. Only an empty primary result
triggers that separate query; provider failures do not. Both requests/results
remain in the artifact, so station substitution is visible. Explicitly requested
stations must be preserved.


## FlyAI domestic flight source (2026-10-08)

Flight queries prefer FlyAI when `FLYAI_QUERY_URL` is configured; rail continues
using the existing 12306 sidecar. The private `flyai-query` service runs the
official `@fly-ai/flyai-cli@1.0.16` to retain its upstream signing protocol.
The API key is supplied only to that service from the ignored runtime `.env`;
Edge uses a separate private query token. Neither credential reaches model
arguments, tool results, source files or the client. No public port is exposed.
A failed configured FlyAI query remains an explicit failure; it does not silently
change providers or fall back to unsigned requests or anonymous demo data.

The adapter validates dates, endpoints, flight identifiers, chronological local
times and purchase-link hosts. China-local timestamps are explicit `+08:00`.
Same-airport connection candidates require at least 90 minutes between legs;
this is only a planning floor, not a guarantee of protected transfer access.
Airport changes or shorter buffers are excluded. Provider results, notices and
booking links remain in the transport artifact. Timed timeline items use the
actual flight number, airports, source and adult query price. A connecting
journey price is shown once, not charged separately for every segment.

FlyAI does not receive the requested group size: `ticketPrice` is retained as a
single-adult quote (`pricedAdults: 1`, `priceBasis: per_adult_quote_not_group_total`).
Taxes, baggage, group seat availability and final purchase price are unverified.
Experience-mode notices are preserved if returned. No booking is performed.
Flight cache keys include the provider and use the existing 300-second TTL.

Configure `FLYAI_API_KEY` in `infra/supabase/docker/.env` (or the custom runtime
`.env`). Deployment generates the internal token if missing:

```bash
bash infra/supabase/deploy-flyai-query.sh
bash infra/supabase/deploy-functions.sh app-agent
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/search/flyai_test.ts supabase/functions/app-agent/search/transport_test.ts supabase/functions/app-agent/main-transport_test.ts
node scripts/test-agent-main-transport-e2e.mjs --flight --report=/tmp/kaipa-flyai-planning-e2e.json
```

The rail and FlyAI deployment scripts, and runtime setup, preserve both installed
Compose overrides when recreating Edge. The CLI has a 35-second execution limit;
Edge allows 40 seconds and surfaces sanitized errors without upstream stderr.
Live adapter checks with the configured personal key passed Beijing→Shanghai
and Chengdu→Kunming on 2026-10-10, including actual timed itinerary generation.
These are dated query snapshots, not current booking promises.

The deployed model/worker regression also passed flight lookup and timeline
persistence with a disposable account: Oct 10 JD5779 Beijing Daxing→Guilin
Liangjiang, 18:35–21:30, CNY620/adult; Oct 12 NS8076 Guilin→Beijing Daxing,
19:20–22:15, CNY400/adult. Both provider-derived rows were saved within an
8-item timeline, and the account/journeys/thread were removed. The overall run
remained partial: an unrelated schedule-update operation failed during saving.
The flight-query/persistence check passing does not establish that every full
planning operation completed. Prices remain timestamped snapshots.

## Daily stop chains (2026-10-08)

A moving itinerary item now supplies `startLocation` and `location` as separate
places. The writer expands the departure into its own ordinary timeline row;
compound `A→B` location names fail validation. Provider train/flight segments
save departure and arrival rows using their actual local dates and times,
including next-day arrivals. Full plans repeat the previous day's final place
at the next day's start; incremental edits do not insert these daily markers.
Untimed local rows retain their relative order when provider services merge in,
and local transfers mentioning the train they connect to remain local transfers.

Hiking start/end rows are resolved from the same stored GPX distances and
waypoint indexes as the daily boundaries. They retain track ID, distance and
length for the existing map's recorded-track routing. Named station/airport
places without coordinates use bounded AMap lookup and WGS84 conversion during
saving. Failed lookup retains an unresolved named place; vague lodging/camp
labels are not mapped to an arbitrary hotel. Coordinates and addresses from a
POI lookup are not accommodation bookings or proof of trail access.

Arrival places retain `incomingMode` as transport metadata. Per the requested
map behavior, all ordinary places, including airport-to-airport and
station-to-station pairs, use the existing AMap driving navigation and road
distance measurement. Hiking segments still use their stored GPX geometry. Reload updated app
JavaScript to use this map behavior. Previously saved timelines are not migrated.

Checks include `itinerary-locations_test.ts`, `main-transport_test.ts`, the
existing plan/save tests and `scripts/test-journey-track-legs.cjs`.

## Daily summaries and concise items (2026-10-08)

Smart plans now provide one `groupNotes` paragraph per day: departure, intermediate
places, destination and main activity in 1–2 sentences, normally 30–80 Chinese
characters. Avoid repeated stop lists, service times/fares, source explanations,
obvious advice and disclaimers. Mention a material constraint briefly once;
keep unresolved feasibility issues in task unverified/blocker fields rather
than repeated “not verified”, “not included in the query” or “allow extra time”
process explanations in each daily note. Planned lodging is not a booking. Timeline titles remain
short place names or separately actionable tasks, with their existing times,
coordinates, route IDs and GPX boundaries retained. Full, chunked and repair
planning all carry the notes. The presentation pass preserves supplied summaries
without appending verbose titles or provider receipts, and filters standalone
query/booking-process explanations while retaining known route constraints; legacy responses without
notes retain their descriptive information in a fallback. It also
merges adjacent repeated start markers while preferring measured GPX locations.

`add_itinerary_items` writes the notes atomically with rows through the existing
versioned change/receipt path. It fills new or empty notes and preserves existing
user notes. Undo restores the previous note and refuses to undo over a later
manual note edit. The versioned itinerary context includes notes for follow-up
turns. The existing note editor and hook allow 1000 characters, matching the
server limit. Existing journeys are not batch-rewritten.

Apply `20261008150000_agent_itinerary_group_notes.sql` with the workspace migration
script. Checks: `itinerary-presentation_test.ts`, existing save/plan tests and
`node scripts/test-agent-group-notes-db.cjs` (transaction rollback fixtures).
The live main-transport regression checks saved daily summaries, concise titles,
provider stops/times and map coordinates.

Ordinary city lodging is left to the user. Smart planning does not create generic
“成都住宿”/placeholder hotel rows or hotel transfers. Without a user-selected
hotel, known station/airport stops anchor the city day and the next day. Named
user-selected hotels and necessary real hiking overnight places remain stops.
The expansion/presentation passes omit generic lodging markers before they can
be copied into the next day's chain; existing saved journeys are not rewritten.

## Research cache invalidation (2026-10-08)

Cross-run research reuse now requires a matching SHA-256 fingerprint of the
complete current confirmed route-facts RPC result, including content, source,
review metadata and current expiry state. Additions, edits under the same ID,
archival/removal and expired reviews rebuild the research brief. Row/object-key
ordering alone does not invalidate it. Legacy briefs without a fingerprint
rebuild once; failed library reads cannot authorize reuse or cache a valid
fingerprint. Changed evidence discards the prior synthesized prose and
estimates, not merely its source chips. GPX is still loaded from the catalog.
No migration or deletion of saved journeys is required. Checks cover edits,
archival, additions, ordering, expiry and failed reads in
`route-fact-sources_test.ts`.
