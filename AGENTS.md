# Project Instructions

Kaipa is an Expo SDK 56 + React Native + TypeScript app.

## Guidelines

- Do not overwrite or revert unrelated user changes.
- Preserve existing Chinese UI copy unless asked otherwise.
- Chinese UI statistics and parallel labels should not use the middle dot `·` as a separator; prefer spaces or clear Chinese punctuation.
- Do not commit `.env`, tokens, service-role keys, or other secrets.

## Project notes

- Supabase is self-hosted for this workspace. Deploy Edge Functions with `infra/supabase/deploy-functions.sh`; never use `supabase functions deploy` or link this checkout to Supabase Cloud.
- Apply individual SQL changes with `infra/supabase/apply-migration.sh`; do not use `supabase db push` from this checkout.
- Main app: `App.tsx`, `src/AppRoot.tsx`.
- Web guest app: `App.web.tsx`, `src/web/`.
- UI/navigation state: `src/nav/NavContext.tsx`.
- Supabase data hooks: `src/hooks/`, composed by `src/data/DataContext.tsx`.
- The app must open and show cached data offline. Data hooks keep their last good server state in `useOfflineState` (`src/lib/offlineCache.ts`); a failed fetch keeps that state instead of clearing it, and launch reads the stored session rather than blocking on a token refresh.
- `admin/` is a separate Vite app (kaipa-admin) with its own `package.json`; it is not part of the Expo app.
- Native maps use MapKit on iOS and AMap on Android; Expo Go should keep fallback behavior.
- `modules/` holds app-local Expo native modules (registered via `expo.autolinking.nativeModulesDir` in `package.json`); they need a prebuild/dev build and cannot ship through `expo-updates`. Rulers and wheels get their detent feel from `modules/haptics-engine`, which falls back to `expo-haptics` when the binary predates it.
- Do not drive scroll or picker ticks with `Haptics.impactAsync`: on Android every expo-haptics impact/selection call is one canned 50 ms waveform, so detents fired faster than that restart each other and buzz. Use `detentFeedback`, whose detents sit on the ruler's emphasised marks.
- `docs/` holds per-topic writeups (agent harness, rail-query, admin console, sign-in, release checklist) — check there before re-investigating.
- UI work follows the root `DESIGN.md`; use `src/design-system/` tokens and components instead of one-off sizes, radii, or colors.

## Expo

Only check Expo SDK 56 docs when changing Expo APIs, native config, plugins, EAS, permissions, file/media APIs, or SDK-version-sensitive behavior.

## Validation

Run checks from the directory you changed. The root command below covers only the Expo app: `tsconfig.json` excludes `admin/`, `supabase/functions/`, and `supabase/tests/`, so passing it there is a false green.

```bash
npx tsc --noEmit
```

In `admin/`, use its own scripts instead: `npm run lint`, `npm test`, or `npm run build`.
