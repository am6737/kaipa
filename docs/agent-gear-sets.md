# Agent gear sets

装备页的“装备清单”（`gear_sets` + `gear_set_items`）是按场景命名、可复用的装备组合，
不是某次旅程的清单。Requests such as “帮我补充我现在清单的高海拔三天两夜的装备清单里面的装备”
used to be read as hiking planning (thread b81d61ab, 2026-10-20). They now route to
their own intent and write.

## Routing

- Router intent `gear_set` allows only `add_gear_set_items`. It never needs a journey,
  date or destination and never runs the staged pipeline.
- The interpreter maps named-set requests to `add_gear_set_items`, domain `general`,
  `packingMode: none`.
- Removing or renaming inside a set has no tool yet and stays `unsupported`.
- App entry `gear_set_onboarding` maps to `gear_set`.

## Tools

- `list_gear_sets` reads the sets live (not via the revision-cached gear snapshot),
  with each item's library ID, category and `owned`.
- `add_gear_set_items` calls the RPC `agent_add_gear_set_items`
  (migration `20261020120000_agent_gear_sets.sql`). The call is additive only:
  - It finds the set by `setId`, or by case-insensitive name, or creates it.
  - It reuses library items by `gearItemId` or by exact name.
  - Anything else becomes a library item with `owned = false` (待购), weight 0 and
    price 0, so library totals stay truthful.
  - Items already in the set are skipped.
  - The result splits `addedOwned` / `addedToBuy` / `skipped`.
- Undo (`undo_agent_run`, kind `add_gear_set_items`):
  - unlinks what this run linked;
  - deletes the 待购 items it created that no set uses any more;
  - deletes the set if this run created it and it is now empty.

## App

- `GearItem.owned`: absent or true means owned. 待购 items show a badge in lists
  and a notice with 已买到 in the item detail.
- The gear set page has “AI 补充装备” in the more menu and in the empty state.
  It sends a hidden prompt carrying the set ID.
- The assistant shows a result card (“已加入 N 件装备，其中 M 件待购”) that opens the
  sets page.
