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

- Main app: `App.tsx`, `src/AppRoot.tsx`.
- Web guest app: `App.web.tsx`, `src/web/`.
- UI/navigation state: `src/nav/NavContext.tsx`.
- Supabase data hooks: `src/hooks/`, composed by `src/data/DataContext.tsx`.
- Mapbox native globe requires a dev build; Expo Go should keep fallback behavior.

## Expo

Only check Expo SDK 56 docs when changing Expo APIs, native config, plugins, EAS, permissions, file/media APIs, or SDK-version-sensitive behavior.

## Validation

Run relevant checks before finishing, usually:

```bash
npx tsc --noEmit
```
