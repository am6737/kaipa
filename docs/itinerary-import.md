# 导入行程，检查硬伤

When the journey list is empty, the starter screen offers 「导入行程，检查硬伤」. It opens `ItineraryImportPage` (`nav.openItineraryImport()`). The user brings a plan they already have, reads a check report, and creates a journey with one tap.

## Flow

1. **Input**
   - Pasted text (at most 20,000 characters).
   - Up to 4 screenshots. They are fitted to a 2400 px long edge so the small text in long screenshots stays readable.
   - There is no track input. A matched catalog route brings its own track, and the user can upload their own track to the journey afterwards.
2. **Read**: `readItinerary` (`src/lib/itineraryImport.ts`) sends the text and images to the `itinerary-import` Edge Function.
   - The model **only transcribes**. It returns days, dates, distance, ascent, descent, stay, sleeping altitude and timed items, plus a `routeId` when the plan clearly matches a catalog route.
   - `normalizeItinerary` (`supabase/functions/itinerary-import/extract.ts`) removes anything out of range: unknown route ids, invalid dates and times, and implausible numbers.
3. **Check**: `checkItinerary` (`src/lib/itineraryCheck.ts`) is pure code, so the same draft always produces the same report.
   - If the plan matched a route, the published official plans come from `route_itineraries_published`. `chooseItinerary` picks the one closest in hiking days.
4. **Create**: 「创建旅程」 calls `create_journey_from_import`. Nothing is written before this tap.

## Checks (`CHECK_LIMITS`)

| Code | Severity | Rule |
| --- | --- | --- |
| datesBroken | 硬伤 | Stated dates do not run one day after another |
| dayTooLong | 硬伤 | A hiking day is over 30 km or has over 1800 m ascent |
| fewerDaysThanOfficial | 硬伤 | Fewer hiking days than the matched official plan |
| startInPast | 留意 | The start date is before today |
| timeOverlap | 留意 | Timed items within a day overlap or run backwards |
| dayLong | 留意 | A hiking day is over 20 km or has over 1200 m ascent |
| sleepAltitudeJump | 留意 | Above 3000 m, the sleeping altitude rises more than 500 m in one night |
| harderThanOfficial | 留意 | A day is more than 25% longer or steeper than the hardest official day |
| offSeason | 留意 | The start month is outside the plan's `bestMonths`, or the route's if the plan has none |
| noRestDay | 提醒 | 6 or more hiking days in a row |
| missingStay | 提醒 | A night (any day except the last) has no stay |
| unreadable | 提醒 | Parts the model could not read (at most 5) |

## Endpoint and RPC

- `itinerary-import` runs behind `protectEndpoint('ai', …, 'ai_requests')`.
  - Model: `ITINERARY_IMPORT_AI_MODEL` / `ITINERARY_IMPORT_AI_BASE_URL`, falling back to the `KAIPA_AI_*` settings.
  - Calls use temperature 0, JSON output and a 120 s timeout.
- `create_journey_from_import(p_request_id, p_journey, p_days)` (migration `20261024120000_create_journey_from_import.sql`):
  - Writes the journey, the host companion, the `Day N` groups (the day's route and numbers go in the group note) and the rows, all in one transaction.
  - Is idempotent through `journey_imports.request_id`. That table also records the sources and the issue counts the report showed.
  - Brings along the matched catalog route's track.

## Deploy

- Apply the migration with `infra/supabase/apply-migration.sh`.
- Deploy the function with `infra/supabase/deploy-functions.sh`.
- Never use `supabase db push` or `supabase functions deploy` from this checkout.
