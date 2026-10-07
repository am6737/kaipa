# Latest planning run dump

- Run: `6782ab8d-3da4-46f9-b7f4-6772ffac65ae`
- Status: `completed`
- Created: `2026-09-25T04:15:55.526957+00:00`
- Finished: `2026-09-25T04:22:20.713803+00:00`

## Important limitation

The exact model wire input/output was not persisted. This folder contains all persisted request payloads, stage artifacts, tool calls, and model metrics, plus a reconstruction of the visible plan/packing inputs. It does **not** contain the system prompt, tool JSON schemas, output schema, or hidden SDK session context.

## Files

- `reconstructed-input-output.json`: readable reconstruction of request, plan input context, plan output, packing input context, packing output.
- `records.json`: all exported records.
- `stage-*.json`: each stage input/output artifact persisted by the server.
- `model-metrics.json`: model timing/token usage.
- `export.jsonl`: raw database export.

## Model calls

| stage | model | ms | input tokens | output tokens | success | aborted |
|---|---|---:|---:|---:|---|---|
| interpretation | gpt-5.6-luna | 59983 |  |  | False | True |
| interpretation | gpt-5.6-luna | 38075 | 2488 | 1240 | True | False |
| plan | gpt-5.6-luna | 125060 | 32536 | 4183 | True | False |
| plan | gpt-5.6-sol | 49860 | 41395 | 2757 | True | False |
| packing | gpt-5.6-luna | 62470 | 9790 | 3365 | True | False |
| packing | gpt-5.6-luna | 12550 | 2173 | 584 | True | False |
| packing | gpt-5.6-luna | 22520 | 2311 | 530 | True | False |
