# Agent Request Recovery

The assistant distinguishes sending, accepted work, active planning, and an
unconfirmed connection. A completed HTTP reply renders immediately; activity
lookups and journey refreshes never block its display.

Pending requests persist locally, scoped to the user and journey, before the
network write. A lost response is recovered by its original `clientRunId`.
Each transport read has a 20-second deadline. Recovery uses non-overlapping
polls and checks again on foreground entry; network restoration is detected
by the next successful poll. Read failures never trigger automatic writes.
The explicit retry command checks the receipt first and only resends an
unacknowledged request with the same ID. Late responses cannot replace newer
requests or a conversation that has been left.

Clarifications now use the same durable background run as other turns.
Retries return the existing run and its saved result, including quick replies.
Task outcome and the final answer settle atomically; see
[the planning harness](agent-harness.md). Historical synchronous clarification
receipts remain readable, but new turns do not call `save_agent_clarification`.

## Deployment

```bash
infra/supabase/apply-migration.sh supabase/migrations/20260907150000_agent_clarification_receipts.sql
infra/supabase/deploy-functions.sh app-agent
```

Reload the native client bundle as well; deploying the function alone does
not update the mobile state handling.

## Verification

```bash
npx tsc --noEmit
node --test scripts/test-assistant-recovery.cjs scripts/test-assistant-track-upload.cjs scripts/test-assistant-planning-follow-ups.cjs
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/
node scripts/test-agent-request-recovery-e2e.mjs
```

The client tests exercise the actual component handlers with simulated
connectivity and AppState events. The integration test uses a disposable
self-hosted account and a proxy that forwards the request but drops its
response, and checks concurrent retries do not duplicate clarification
messages. It calls the configured model through the worker.

For physical-device acceptance, test airplane mode before and after sending,
backgrounding during a queued plan, reopening a pending conversation, and
typing a new draft before recovery. Verify restored replies appear once,
drafts survive, and status labels wrap in light/dark modes. The automated
AppState test is not a substitute for OS process-suspension testing.
