# NeMo input topic boundary

Kaipa uses NVIDIA NeMo Guardrails 0.24.1 as an internal Python service. Only
`IORails.check_async(..., rail_types=[RailType.INPUT])` runs: a configurable
`self check input` rail classifies service relevance using the existing
OpenAI-compatible flash endpoint. It does not generate assistant answers,
initialize intent embeddings, execute tools, or require a GPU/TopicControl NIM.

The domain policy is in `infra/supabase/topic-guard/prompts.yml`. Travel, outdoor
activities, routes, trip weather, gear, packing, app usage, travel translations
and calculations are supported. Greetings, cancellation and answers to relevant
pending questions remain supported. The requested deliverable determines scope:
a cycling goose SVG is unrelated despite the outdoor keyword. Separable mixed
requests pass the rail; the task interpreter and conversational instructions
limit work to the supported part. There is no output rail in this deployment.

## Request lifecycle

1. The existing durable worker loads at most eight recent visible messages,
   each bounded to 800 characters, and the same-journey pending question. Raw
   attachments, GPS, credentials and business snapshots are not classifier input.
2. `prepareTask` calls the internal authenticated `/check` endpoint before
   intent interpretation, journey hydration or attachment parsing.
3. NeMo returns an explicit allow/block result. The custom output parser accepts
   only `on-topic` or `off-topic`. Malformed results, model/service failures,
   timeouts and mismatched policy versions stop processing; they are not presented
   as proof that the user's topic is unrelated. Worker recovery handles errors.
4. The server persists `topicCheck` alongside the existing JSON task state.
   `offTopic` is server-owned and omitted from interpreter output. Rejection
   clears authorization and continuation and returns fixed localized copy with
   travel suggestions, without reserving a full-plan allowance or invoking tools.
5. Retries reuse the persisted verdict. Older saved tasks receive one check and
   retain their previously interpreted authorization when allowed. Increment
   `POLICY_VERSION` in Python and `TOPIC_POLICY_VERSION` in TypeScript together
   when changing the policy so old verdicts are checked again.

Classifier calls reserve the existing AI service token budget conservatively
and record `topic_check` model metrics. Provider token usage is currently not
returned by the check API, so the reservation is retained. Normal task
interpretation and business-tool/RLS permissions remain independent.

## Deployment

Run `infra/supabase/deploy-topic-guard.sh`. It generates an internal bearer token
only in the ignored runtime `.env`, builds and health-checks the service, runs
the real-model evaluation, then deploys `app-agent` through
`infra/supabase/deploy-functions.sh` and recreates Edge with the guard URL/token.
Existing rail/flyai provider overlays are preserved. Their deployment scripts
and Supabase setup preserve the topic-guard overlay too.

The guard publishes no host port and is not routed through Kong. It has no
Supabase credentials or database access. Container access logs and NeMo telemetry
are disabled. Its upstream model/API credential is server-only. Classifier
concurrency is eight; the 30-second service deadline includes admission waiting,
and Edge uses a 35-second HTTP deadline. Upstream retries are disabled.

`TOPIC_GUARD_MODEL` optionally overrides `KAIPA_AI_FLASH_MODEL` (then main model).
`TOPIC_GUARD_URL` and `TOPIC_GUARD_TOKEN` are required by Edge; there is no silent
fallback to the previous classifier when the service is absent.

## Validation

From `infra/supabase/topic-guard/`, install `requirements.txt` and pytest into a
Python 3.12 virtual environment and run `DO_NOT_TRACK=1 python -m pytest -q`.
Tests run the actual NeMo rail against a local stub model endpoint and verify
one classifier call, strict verdict parsing, failure handling, auth and body
limits. They do not substitute for semantic evaluation.

From `supabase/functions/app-agent/`, run `deno check index.ts` and
`deno test --allow-env --allow-read topic-boundary_test.ts task-store_test.ts task_test.ts`.
They cover HTTP-contract validation, budgets, persisted rejection/retry,
unavailable services, old task migration and tool authorization.

Run `docker exec kaipa-topic-guard python /app/evaluate.py` for the maintained
Chinese/English real-model cases in `eval_cases.json`, including misleading
travel framing, scope override attempts, short clarifications, mixed requests,
and legitimate travel work. Evaluation failure prevents activation by the deploy
script. Passing these examples does not establish a population-wide accuracy.

`node scripts/test-agent-topic-boundary-e2e.mjs` exercises the real queue/worker
and NeMo service with a disposable user, removed on exit. It verifies rejection
without interpretation/execution calls or tools, a normal greeting, a disguised
SVG request after travel conversation, and a mixed gear/SVG request. Use
`--mixed-only` to run just the mixed case.

Verified on the self-hosted runtime on 2026-10-08: 24 Edge regression tests,
4 Python tests and all 28 real-model classification examples passed (zero
false accepts/rejects in this sample). Classification latency was 1.02–4.20s,
median 1.87s. All four end-to-end turns passed; rejected turns invoked zero
business tools and only the `topic_check` model stage. Expo TypeScript check
passed after adding the user-facing “请求检查” timing label. The service and
Edge were deployed successfully. Results are sample evidence, not an accuracy
guarantee; mixed-request filtering still depends on the downstream model.

References: [NeMo topical rails](https://github.com/NVIDIA-NeMo/Guardrails/blob/v0.24.1/docs/configure-rails/colang/colang-1/tutorials/6-topical-rails/README.mdx),
[IORails implementation](https://github.com/NVIDIA-NeMo/Guardrails/blob/v0.24.1/nemoguardrails/guardrails/iorails.py),
[self-check input rail](https://github.com/NVIDIA-NeMo/Guardrails/blob/v0.24.1/nemoguardrails/library/self_check/input_check/rail.py).
