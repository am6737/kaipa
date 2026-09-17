# Transport Planning V1

The transport follow-up reuses confirmed journey travel facts, suggests a one-shot
device location when useful, and plans a continuous outbound/return chain while
preserving the saved hike. No SQL migration is required.

## Location and Confirmation

- Only the transport quick-reply action opportunistically collects an already
  authorized fix. Accommodation and ordinary unrelated messages do not.
- A confirmed origin or explicit location refusal suppresses this collection for
  the same journey. New journeys do not inherit these facts.
- Unrequested OS permission prompts are avoided. `permission_required` lets the
  agent offer a `request_location` button alongside manual place input.
- Device-location consent does not confirm the departure or return place. The
  agent confirms named places separately, using concrete names in replies so a
  confirmation does not sample a new fix.
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
permission configuration is unchanged. No live ticketing integration is added.

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
