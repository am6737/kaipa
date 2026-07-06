# DeepSeek Smart Plan Integration Design

## Goal

Use DeepSeek from a Supabase Edge Function to generate intelligent journey itinerary items for the existing Kaipa smart planning entry point. The DeepSeek API key must stay on the backend and must not be bundled into the Expo app.

## Context

The Expo app is on SDK 56. Existing frontend code already calls `generateSmartPlan(...)` in `src/lib/smartPlan.ts`, which invokes the Supabase Edge Function named `smart-plan`. The itinerary UI in `src/components/overlays/JourneyTimeline.tsx` can generate, preview, and apply returned plan items to the journey timeline.

## Architecture

- Frontend remains a thin client.
  - It sends journey metadata, existing timeline rows, and planning preferences to `smart-plan`.
  - It receives normalized `items` and applies them through existing timeline code.
- Supabase Edge Function `smart-plan` owns provider selection and LLM calls.
  - Default provider is DeepSeek.
  - The DeepSeek key is read from `DEEPSEEK_API_KEY` in Supabase secrets.
  - No DeepSeek key is stored in `EXPO_PUBLIC_*`, app config, or source code.
- Fallback planning remains available if no provider key is configured or the model call fails in a recoverable way.

## DeepSeek Request

The function will call DeepSeek's OpenAI-compatible chat completions endpoint with a system prompt that asks for concise outdoor trip itinerary planning in JSON. The model must return only items matching the frontend contract:

```ts
{
  items: Array<{
    day: string;
    title: string;
    timeStart?: number;
    timeEnd?: number;
    note?: string;
  }>;
}
```

`timeStart` and `timeEnd` are minute-of-day values from `0` to `1439`.

## Error Handling

- Missing DeepSeek secret: use deterministic fallback itinerary and return a warning.
- HTTP/API failure: throw a concise error unless a fallback path is already explicitly used.
- Malformed model JSON: attempt JSON extraction, normalize valid items, and reject empty results.
- Output size: cap normalized items to 80.

## Security

- Rotate the API key that was pasted in chat and set the new value as a Supabase secret.
- Do not commit secrets.
- Do not expose the key through Expo public environment variables.

## Testing

- Type-check the function/frontend TypeScript where practical.
- Run a local invocation or static validation of the Edge Function code.
- Verify the UI path still calls `smart-plan` and can render/apply returned items.

## Deployment Notes

Set the Supabase secret before using the feature:

```bash
supabase secrets set DEEPSEEK_API_KEY=<rotated-deepseek-key>
```

Then deploy the function:

```bash
supabase functions deploy smart-plan
```
