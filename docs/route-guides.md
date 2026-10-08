# Route detail, reference plans and guide UI

The route card retains its original title, information pills, month strip,
photo carousel, description and action/feedback styling. The whitespace-oriented
design in `docs/previews/route-guide-refined.html` applies only to the added
separate route-weather and recent-observation, reference-plan and community-guide modules. Entry
remains the map's route card. Transport is part of the first/last itinerary days,
with no standalone transport section. Earlier implementation screenshots predate
this restoration of the original overview styling.

## Content and scope

`src/data/routeGuides.ts` provides bilingual editable planning scaffolds for a
one-day hike, two days with lodging, and three days camping. They are explicitly
presented as reference plans and are **not reviewed route-specific recommendations**. They do
not infer campsite names, water supplies, daily distance, timing or safety from
a route's length. Draft locations remain to be confirmed. All drafts include
categorized gear; lodging does not include camping shelter/sleep equipment.

Community guides currently come from local demonstration records, displayed with
normal author names and guide copy without sample labels. They support
recommendation/helpful/update ordering, accommodation filters and separate
itinerary/equipment/reflection views. Helpful feedback is session-local and is
not a community vote. There is no public guide publishing or public journey read
in this version; private journeys, participants and orders are not published.
Production community data needs an explicit publication snapshot, scoped public
read policies, durable votes and review/moderation before replacing examples.

Recent observations now use four local fixtures per route for requested UI
review, including user posts, an official post and a verification badge. Their
fixed October 2026 timestamps, authors, text and verification are fabricated;
scenery images come from the existing illustrative photo library. Fixtures are
not written to the database. Weather values still come from the weather provider. `useRouteWeather` reads a three-day Open-Meteo forecast for
the catalog route's coordinates, with a 15-minute memory cache, timeout, retry
and unavailable state. It identifies the nearby-coordinate forecast and source;
it does not claim to forecast the full trail or summit. Weather is not an access
or safety verdict. Weather dates and missing values come from the provider.

## Journey creation

`Poi.planningTemplate` is an ephemeral payload passed through the existing
route-first creation flow. It defaults duration to the scaffold's day count,
displays the selected plan and packing import hint, and uses a single creation
button instead of starting AI generation. Changing route or day count requires
selecting another scaffold; the template is never silently truncated or applied
to another route. Dates and trip name remain editable.

Journey creation uses the existing persistence path. After that succeeds,
`journey_import_route_guide` saves the daily groups/items and requesting user's
personal gear list atomically. Only an owned active journey with matching route
and duration and no existing itinerary/packing items can import. A receipt makes
replays idempotent. Imports do not overwrite existing journey contents, create a
shared gear list or mark imported items as packed. Version snapshots are batched.
If import fails, the created journey is retained and a retry notice is available
in the current app session. The pending retry notice is not persisted across an
app restart. Schema errors are not reported as successful imports.

## Validation

```sh
npx tsc --noEmit
node --test scripts/test-route-guides.cjs
node scripts/test-route-guide-import-db.cjs
npx expo export --platform web --output-dir /tmp/kaipa-route-guide-web
```

The database test runs the migration plus owner-isolation, atomic rollback,
replay, route/duration and existing-data cases inside a transaction that rolls
back fixtures. Apply using the workspace's self-hosted migration script:

```sh
infra/supabase/apply-migration.sh supabase/migrations/20261007140000_route_guide_import.sql
```

No Edge Function deployment is needed. There are no Expo API/native config
changes. Root checks apply to these app files; no admin changes are involved.

The full web bundle currently imports the native-only image crop picker in
`src/components/me/AccountPage.tsx` during startup. Browser visual validation uses
a temporary exported bundle with **only that unused native module stubbed**;
repository code is not patched for that unrelated issue. Browser screenshots
verify actual React Native Web route/guide components, not the HTML mockup.
Native device rendering still needs a device or simulator pass.

A disposable signed-in browser session verified route selection, draft switching,
plan and guide equipment tabs, sorting, lodging filter, helpful feedback,
reflection and back navigation. The creation flow saved three days, nine
itinerary items and fifteen unpacked personal gear items, confirmed by reading
the database as that test user. The test account and its data were removed.

## Recent observations: product design

Route weather and recent observations have separate sections and detail entries.
The observations entry currently shows local fixtures, with two entries on the
route card and four in the list. Photo viewing reuses the existing carousel.
Publishing and official verification are not implemented. Existing journey media uploads support images
and videos but do not make journey content into public route observations.

The intended publishing form records the route, visited/captured time, trail
section or location, text and optional photos/videos. Text-only reports are valid.
List entries show visited time separately from published time and sort primarily
by visited time. Older posts belong in history rather than appearing current.
Source (user or official) and verification (unverified or officially checked,
with verifier/time) are separate fields. Users cannot grant verification badges
themselves. Official verification should identify the checked observation and
time, rather than implying that the entire route is currently passable.
