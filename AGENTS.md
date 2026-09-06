# Project Instructions

Kaipa is an Expo SDK 56 + React Native + TypeScript app.

## Guidelines

- Keep changes small and scoped.
- Do not overwrite or revert unrelated user changes.
- Preserve existing Chinese UI copy unless asked otherwise.
- Use existing theme, i18n, navigation, and shared components where practical.
- Keep TypeScript strict-compatible.
- Do not commit `.env`, tokens, service-role keys, or other secrets.

## Project notes

- Supabase is self-hosted for this workspace. Deploy Edge Functions with `infra/supabase/deploy-functions.sh`; never use `supabase functions deploy` or link this checkout to Supabase Cloud.
- Apply individual SQL changes with `infra/supabase/apply-migration.sh`; do not use `supabase db push` from this checkout.
- Main app: `App.tsx`, `src/AppRoot.tsx`.
- Web guest app: `App.web.tsx`, `src/web/`.
- UI/navigation state: `src/nav/NavContext.tsx`.
- Supabase data hooks: `src/hooks/`, composed by `src/data/DataContext.tsx`.
- Native maps use MapKit on iOS and AMap on Android; Expo Go should keep fallback behavior.

## Design system

- Treat the redesigned gear overview, gear detail/list, and checklist detail/list pages as the app-wide visual baseline.
- Read and follow `DESIGN.md` and `docs/design-system.md` when creating or substantially redesigning app UI.
- Import public design-system APIs from `src/design-system/index.ts`; do not depend on its internal files directly.
- Prefer semantic `Theme` colors and shared spacing, radius, typography, layout, and motion tokens over one-off values.
- Keep business-specific components in their feature directory; only promote components that are genuinely reusable across product domains.
- Validate new or changed UI in both light and dark modes.

## Expo

Only check Expo SDK 56 docs when changing Expo APIs, native config, plugins, EAS, permissions, file/media APIs, or SDK-version-sensitive behavior.

## Validation

Run relevant checks before finishing, usually:

```bash
npx tsc --noEmit
```
