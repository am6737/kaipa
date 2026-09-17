# Versioned Agent Context

Kaipa v55 separates conversation memory from current database state. No Redis or
client-side revision bookkeeping is required.

## Reads

- `agent_journey_revisions` tracks journey metadata, track, itinerary and packing
  separately. These counters are independent of the user-visible version history,
  whose snapshots may be grouped by agent run.
- Database triggers cover native/web edits, collaborators, agent writes, deletions,
  checklist toggles, membership changes and restores. Gear and profile changes have
  a separate per-user revision.
- Track summaries (WGS84 start/end, cumulative length, ascent label, waypoints) are
  computed on track changes, not on every model turn. Raw coordinates and elevation
  arrays remain in the database and are only read by backend geometry operations.
- Each turn checks the lightweight revision manifest, then supplies matching
  thread-scoped snapshots from `agent_context_cache`. Mismatched snapshots are not
  included. `get_journey_details(sections)` fetches only missing/changed sections;
  transport needs journey/track/itinerary, not packing or gear.
- An already-bound track attachment is not downloaded and parsed again each turn.
  Newly uploaded or unbound attachments still go through normal validation.

## Writes

`apply_agent_journey_change` locks the journey and personal revision row, validates
the operation's dependency versions, applies the entire tool write and records its
output/undo receipt in one transaction. All related writers take the same parent
lock through database triggers. Existing RLS and feature write permissions remain
in force. A concurrent edit yields `agent_context_conflict` without any partial
write (PostgREST HTTP 409 / `PT409`, not a retryable SQL serialization failure).
The agent must reread affected sections and reconsider its plan; it must not
blindly retry stale arguments. SQL also rechecks exact deletion IDs and labels.

Agent writes are serialized within a run. Successful writes advance only their
observed dependencies and invalidate affected in-memory snapshots. A lost HTTP
response can replay the transaction's saved receipt without duplicating rows.
Each tool is atomic; a whole multi-tool plan is **not** one long transaction.
Existing create and undo RPCs retain their own transaction/validation semantics.

## Conversation Memory

Raw history remains in `agent_session_items`; visible chat history is unchanged.
The model's historical inputs omit raw geometry, redundant data snapshots and old
system-injected snapshot payloads. Current state is supplied separately.

When sanitized history exceeds 32,000 characters and contains more than six user
turns, a tool-free summarizer merges older turns with the prior memory. Six whole
recent turns are retained, so tool calls/results are never split. The summary
preserves user-confirmed constraints, prior decisions, selected origin/return
points, unresolved questions and archive IDs. Historical GPS is not live location.

Memory is limited to 12,000 characters and persisted with an archive boundary only
after successful summarization. A failure keeps all remaining history rather than
dropping user constraints. `read_conversation_history` can retrieve original
messages when memory is ambiguous. Long-term memory is model-generated, not a
guarantee of perfect recall; archival retrieval and current-state validation remain
the sources of truth.

## Deployment and Checks

Use the self-hosted scripts, in this order:

```bash
infra/supabase/apply-migration.sh supabase/migrations/20260907180000_agent_context_revisions.sql
infra/supabase/apply-migration.sh supabase/migrations/20260907181000_agent_atomic_writes.sql
infra/supabase/apply-migration.sh supabase/migrations/20260907190000_agent_schedule_edits.sql
infra/supabase/deploy-functions.sh app-agent
npx tsc --noEmit
npx --yes deno check supabase/functions/app-agent/index.ts
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/
node scripts/test-agent-context-db.cjs
node scripts/test-agent-context-e2e.mjs
node scripts/test-agent-context-e2e.mjs --schedule-only
```

The SQL test runs against the schema installed by
`infra/supabase/setup-kaipa-supabase.sh` and wraps everything in a rollback
transaction, so it leaves no fixtures behind. It tests scope invalidation, atomic
receipts, conflicts, rollback, deletion identity, permissions and raw-geometry
exclusion. It no longer installs its own migrations first: those carry one-off
`journeys.track_coords` backfills that `20260916120000_tracks_library.sql`
removes. The live integration test uses a disposable account/journey and cleans
them up; it contacts the worker and configured model. Neither test alters
existing users' journeys.

Use `node scripts/test-agent-context-e2e.mjs --concurrency-only` for the two-connection
conflict check without invoking the model. Memory summarization has a 60-second
deadline; a timeout preserves the uncompressed history.

## Existing Journey Schedule Edits

`update_journey_schedule` is available in both global and journey modes. It
requires observed `journey` and `itinerary` revisions, and updates the start date,
day count and whole-day assignments in one transaction with its undo receipt.
Omitting `plannedDate` preserves the existing date. Every existing row day and
active group must be assigned exactly once to a distinct day within `totalDays`.
The operation preserves row/group IDs, titles, checks, route endpoints and packing;
it rejects incomplete assignments, group merging, reversed route endpoint order,
and destinations occupied by deleted groups. Custom groups should only be moved
when explicitly requested; assignments normalize their target labels to `Day N`.

Undo restores only schedule fields and refuses intervening schedule changes.
Unrelated title/check edits are retained. Subsequent reversible operations in the
same run are undone first through the existing run-level undo mechanism. The
`--schedule-only` live test verifies rescheduling, a follow-up addition, and undo
against the configured model, then runs the two-connection conflict check.
