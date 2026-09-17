# Background Planning

## Request Lifecycle

All natural-language turns, including clarification replies, use the background
worker. See [the planning harness](agent-harness.md) for task interpretation and
execution scope. The `turn` endpoint atomically inserts the run, original request, attachments and
user message, then returns HTTP 202 with `status: running`. The client persists
the thread ID and polls durable state; neither a mounted screen nor an open
HTTP connection is needed to execute the plan.

`agent_jobs` is a private Postgres queue. `kaipa-agent-worker` claims one job at
a time using `FOR UPDATE SKIP LOCKED`, signs a ten-minute authenticated JWT for
that job's user, and invokes `execute_job` with a random lease token. The Edge
Function validates both ownership and lease, and executes all business tools
using the user's RLS-scoped client. Queue service credentials and JWT signing
keys remain in the self-hosted runtime, never in queue payloads or the app.

The Edge runtime has a five-minute hard execution limit. A six-minute lease
prevents overlapping execution after a transport error or restart. Expired
leases are reclaimed by the worker; transient failures retry up to three
attempts with bounded backoff. Do not increase the Edge hard limit past the
lease duration without updating both settings. Worker downtime leaves jobs
queued; Docker restarts the worker automatically.

## Tracks and Recovery

GPX/KML/KMZ are read from the user's storage prefix through our storage client,
not fetched from arbitrary attachment hosts. The existing parser produces
distance, ascent, endpoints and a bounded waypoint summary for the model.
Raw track files are never model file inputs. Full coordinates and original
file references are saved with the journey. KMZ extraction is limited to KML
entries and 15 MB uncompressed contents.

Attachments persist through clarification and retries. Invalid tracks fail
before conversational tool execution and offer file selection. The tool-free
interpreter may already have run. Other final failures retain
saved content and offer `retry_run`. Recovery reuses the same run ID, request,
attachments and successful tool receipts. Journey creation, owner membership
and thread binding commit in one transaction. Existing itinerary/packing
identity checks prevent re-adding already persisted items when a worker dies
between a business write and recording its tool result. This is at-least-once
execution with idempotent planning writes, not exactly-once model execution.
Live-state reads bypass tool-result replay so recovery sees the latest saved
journey and checklist. If a non-planning insertion, deletion or undo has an
uncertain outcome, recovery stops and asks the user to inspect their data;
those commands are not blindly replayed.

Historical request-mode failures can be resumed when their original user
message is available and no newer run supersedes them. Legacy raw track inputs
are sanitized when session history is read. Already-running or completed retry
requests return the existing run instead of creating another one.

## Deploy

From the checkout, using the self-hosted runtime only:

```bash
infra/supabase/apply-migration.sh supabase/migrations/20260907130000_agent_background_jobs.sql
infra/supabase/deploy-functions.sh app-agent
bash infra/supabase/deploy-agent-worker.sh
```

Deploy the migration before the updated app. Fresh runtime setup also applies
the migration and starts the worker. Worker redeployment gracefully waits for
the active HTTP request, then recreates the container. Edge redeployment can
interrupt jobs; leases recover them without requiring a client to reconnect.

## Verify and Operate

```bash
npx tsc --noEmit
npx --yes deno check supabase/functions/app-agent/index.ts
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/
node scripts/test-assistant-track-upload.cjs
node --experimental-strip-types scripts/test-packing-activity-presentation.mjs
docker logs --tail 50 kaipa-agent-worker
```

`supabase/tests/agent-background-jobs.sql` exercises queue and creation
transactions and rolls all fixtures back. Run it against an idle test queue.
`node scripts/test-agent-background-e2e.mjs` uses the configured model and a
disposable account to test real uploads, background execution, duplicate
submission, resume and invalid-track rejection. It removes its fixtures.

Inspect `agent_jobs.state`, `attempts`, `lease_until`, `available_at` and
`last_error` with an administrator connection. Queue functions and payloads
are not accessible to anonymous or authenticated clients. User-facing
progress intentionally hides intermediate validation failures and retries.
