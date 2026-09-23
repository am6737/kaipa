# Project Instructions

Kaipa is an Expo SDK 56 + React Native + TypeScript app.

## Guidelines

- Do not overwrite or revert unrelated user changes.
- Preserve existing Chinese UI copy unless asked otherwise.
- Do not commit `.env`, tokens, service-role keys, or other secrets.

## Project notes

- Supabase is self-hosted for this workspace. Deploy Edge Functions with `infra/supabase/deploy-functions.sh`; never use `supabase functions deploy` or link this checkout to Supabase Cloud.
- Apply individual SQL changes with `infra/supabase/apply-migration.sh`; do not use `supabase db push` from this checkout.
- Main app: `App.tsx`, `src/AppRoot.tsx`.
- Web guest app: `App.web.tsx`, `src/web/`.
- UI/navigation state: `src/nav/NavContext.tsx`.
- Supabase data hooks: `src/hooks/`, composed by `src/data/DataContext.tsx`.
- `admin/` is a separate Vite app (kaipa-admin) with its own `package.json`; it is not part of the Expo app.
- Native maps use MapKit on iOS and AMap on Android; Expo Go should keep fallback behavior.
- `docs/` holds per-topic writeups (agent harness, rail-query, admin console, sign-in, release checklist) — check there before re-investigating.

## Expo

Only check Expo SDK 56 docs when changing Expo APIs, native config, plugins, EAS, permissions, file/media APIs, or SDK-version-sensitive behavior.

## Validation

Run checks from the directory you changed. The root command below covers only the Expo app: `tsconfig.json` excludes `admin/`, `supabase/functions/`, and `supabase/tests/`, so passing it there is a false green.

```bash
npx tsc --noEmit
```

In `admin/`, use its own scripts instead: `npm run lint`, `npm test`, or `npm run build`.
