# Route comments (路线评论)

On 2026-10-16, route comments replaced the route card's recent observations
(近期实况).

## Why

The old design had these problems:

- `section` was never filled in.
- `visited_at` was always the publish time.
- 「实况」 clashed with the Live Photo badge.
- There were no replies and no pagination.
- The `route_condition_moderation` switch only worked in the client. Rows were
  always saved as `pending`, so with the switch off nobody else saw a post,
  while its author thought it was published.

## Product rules

- **Thread shape:** top-level comments with one level of replies. A reply can
  @ the thread author or anyone who already replied in the thread. Replies to
  replies stay under the same top-level comment. A thread shows its first two
  replies, and the rest expand with 「展开 N 条回复」.
- **Media:** top-level comments take up to 9 images, videos or Live Photos
  (50 MB per file, video ≤15 s). Replies are text only, enforced by a CHECK.
  Text is at most 500 characters.
- **Moderation:** comments publish first and are reviewed afterwards. Users can
  report a comment (广告或引流 / 不实路况信息 / 辱骂或人身攻击 / 其他). Each
  user counts once; authors can report their own comment too. Three open reports hide
  the comment automatically. Admins restore, hide or delete comments under
  后台 → 路线评论. Restoring or hiding settles the open reports.
- **Deletion:** an author can delete their own comment. A top-level comment that
  still has replies becomes a 「该评论已删除」 placeholder. The placeholder goes
  away when its last reply is deleted.
- **Sorting:** 最热 (likes, then replies, then time) or 最新. 20 per page.
- **Rate limit:** 20 comments per user per 10 minutes.
- **Notifications:**
  - `comment_reply` goes to the thread author, plus the @'d user.
  - `comment_like` goes to the comment author and is merged per liker per
    route over 24 h.
  - Both open the route's comment page. See `docs/push-notifications.md`.

## Data (`20261016120000_route_comments.sql`)

- `route_comments`: `parent_id` is null for top-level comments. `status` is
  `visible`, `hidden` or `deleted` (the placeholder). Counters are maintained
  by triggers and RPCs.
- `route_comment_likes`: the (comment, user) pair is the primary key.
- `route_comment_reports`: the (comment, reporter) pair is the primary key.
  `resolved_at` is set when an admin handles the report. Clients have no access.
- Clients can only SELECT visible and placeholder rows, and INSERT their own
  rows. All other writes go through these RPCs:
  - `toggle_route_comment_like`
  - `delete_route_comment`, which returns `'deleted' | 'tombstoned'`
  - `report_route_comment`
- The project's default privileges grant anon and authenticated everything, so
  the migration revokes those grants first and adds back only what's needed.
- Tests: `supabase/tests/route-comments.sql`. The test needs two auth users and
  rolls everything back. To dry-run a new migration in the same transaction,
  strip the migration's own `begin;`/`commit;` first. Otherwise its `commit`
  ends the wrapping transaction and the migration is really applied.

### Migrating from 近期实况

- `route_observations` rows were copied with the same ids. Rejected rows became
  `hidden`; pending and approved rows became `visible`. Old helpful votes became
  likes.
- During the transition, the trigger `route_observations_forward_to_comments`
  copies inserts and deletes from un-updated clients into `route_comments`.
  `route_observations.moderation_status` now defaults to `approved`, and the
  `route_condition_moderation` feature control was removed.
- Once every client is on the new build (via OTA), drop `route_observations`,
  `route_observation_helpful_votes`, the forwarding trigger and the old
  `observation_like` routing.

## Client

- `src/hooks/useRouteComments.ts`:
  - Lists use offset pagination, and replies are fetched in batch.
  - Mounted lists for the same route share updates through a module-level
    subscriber map.
  - Mutations: `submitRouteComment`, `toggleRouteCommentLike`,
    `deleteRouteComment`, `reportRouteComment`.
- `src/components/discover/RouteCommentsView.tsx`: the full page, with sorting,
  the list, a bottom composer with a reply chip, and an action sheet.
- `RouteCommentItem.tsx`: the route-card preview row and the thread item.
- `RouteCommentMedia.tsx`: the media strip and viewer.
- The route card shows 「评论 N」 and two preview rows. When there are no
  comments, the empty state opens the comment page with the composer focused
  (`openRouteGuide({ view: 'comments', compose: true })`).
