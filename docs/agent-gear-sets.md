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
- App entry `gear_set_review` (清单判官) maps to `discuss`, so that turn has no write
  tool. Agreeing afterwards (“补上吧”) is routed as `gear_set` by the router.

## Skill

The review rubric and fill rules live in the `gear_sets` planning skill
(`skills.ts`): infer the scenario from the set name, then report missing,
redundant, heavy and mislabelled items, verdict first, and ask before adding.
The server injects it into the task input for `gear_set_review` and for any
`add_gear_set_items` task, so it does not depend on the model loading it. Edit
the rubric there; it ships with an app-agent deploy, not an app release.

## Tools

- `list_gear_sets` reads the sets live (not via the revision-cached gear snapshot),
  with each item's library ID, category, `owned`, per-unit `weightKg` (0 = not
  entered) and note.
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
- The gear set page has “清单判官” in the more menu when the set has gear, and
  “AI 配装” in the more menu and empty state when it has none (2026-10-28; was
  “AI 补充装备”). Both send a hidden prompt carrying the set ID plus their app entry.
- The assistant shows a result card (“已加入 N 件装备，其中 M 件待购”) that opens the
  sets page.

## Adding to the library by naming gear

The gear page's “AI 创建装备” opens a new conversation with “添加装备：” typed in,
not a questionnaire. Users list gear they already own (“添加装备：黑钻头灯、2L水袋”,
“帮我加一下始祖鸟冲锋衣、火枫炉头”), and every named item is saved without
follow-up questions (2026-10-27).

- Routing: with no current journey, adding one or more concrete items is
  `gear_add` even without the word 装备; with a journey open it still clarifies.
  The interpreter is told the same, because `applyIntent` can only narrow its writes.
- `add_gear` skips an item whose name is already in the library (ignoring case
  and spaces) and returns `existing: true`. That still counts as a receipt, so an
  all-duplicate request completes instead of reporting partial work. The result
  card lists only items actually added. `add_gear` has no undo.
  Identical calls of one run that are still executing share one result (the
  model once sent 加两个Nalgene as two parallel identical calls, and both passed
  the dedupe read). Prices are rounded, because `gear_items.price` holds whole yuan.
- Speed: the user's categories are put in the task input, so the agent skips
  `list_gear`; a task whose only write is `add_gear` runs execution on the flash
  model. A turn went from about 56 s to about 32 s (median, 19 scenarios). What
  remains is the topic rail, routing and interpretation (~16 s) plus the
  write and reply rounds.
- Live evaluation: `node scripts/evaluate-agent-gear.mjs` (19 scenarios:
  list formats, units, quantities, English, duplicates, a same-thread follow-up,
  and no-write cases). Each line shows whether the rules or the model handled it;
  the script waits out the per-user AI rate limit (6 turns a minute).

### Rule-based fast path

Plain “add these items” requests skip every model (`gear-fast-path.ts`,
2026-10-27): rule-handled turns take 1–5 s instead of about 32 s. It is the
intent + slot-filling front end voice assistants used before LLMs (Home
Assistant's hassil works the same way): a declarative grammar recognizes this
one intent, and anything it is unsure of falls through to the model path unchanged.

- Grammar: trigger phrases (添加装备：, 帮我加一下, 加个/再加一个, 把…加到装备库,
  add … to my gear), item separators, quantities (三个, 两根, ×2), weights
  (kg/g/克/公斤/斤), prices (元, ¥) and a keyword table for the default categories.
- Abstains: on questions, advice, gear still to buy, negation, other targets
  (清单/行程/gear sets), edits or deletes, references to earlier context (这个),
  vague lists, links, things added in other apps (提醒, 好友, 函数, 备注, users),
  attribute fragments (舒适温度零下10度), an ambiguous `3块`, Chinese names split
  only by spaces (速干衣 速干裤), an open journey, attachments uploaded with the
  turn, a pending question, and an app intent other than `gear_onboarding`. A
  message that never says 装备/gear also needs every item to match the category
  keyword table. A count is not enough (添加两个好友, 添加一个 Python 函数), so
  gear the table does not know (加两个Nalgene) goes to the model.
- It skips the NeMo topic check: a recognized gear add is in scope by
  construction. The decision still goes through `constrainTaskDecision` (the
  whole message is the authorization quote), and items are written through the
  `add_gear` tool, so scope checks, dedupe, the tool-call audit and the outcome
  are the model path's. The state records `routing.source: 'rules'`,
  `topicCheck.source: 'rules'` and the parsed items, so a retry writes the same
  items. Replies are fixed templates.
- Tests: `gear-fast-path_test.ts` holds labelled matches with their slots and
  abstentions with their reasons, plus a precision guard: no case in
  `intent-cases.ts` labelled anything but `gear_add` may match. Add a phrasing
  there before widening the grammar.
- Kill switch: set `KAIPA_GEAR_FAST_PATH=off` in the functions environment.

## Building a set from its description

The set editor (new and edit) has 按描述搭配 under the description field
(2026-10-27). It is not an agent turn: `src/lib/gearSetCompose.ts` sends the
description, the categories and the library to the `gear-set-compose` Edge
Function, which makes one model call and writes nothing.

- The model picks only library IDs. Gear it says is missing comes back with a
  category and a one-line reason (at most 8 items). A "missing" name that the
  library already has becomes a pick.
- The editor ticks the picks and marks them 「AI 选」 until the user edits them.
  Missing gear is listed as 「还缺 N 件」, checked by default. Saving creates each
  checked item as an `owned = false` library row (reusing one with the same
  name) and puts it in the set. Unchecked suggestions are dropped.
- 重新搭配 replaces only the earlier AI picks the user left alone. Gear the user
  picked stays in the set, and gear they removed is sent as `excludeIds` and
  never comes back.
- Speed: `reasoning_effort: 'none'` (one plain retry if the provider rejects
  it). On the flash model a call went from about 45 s to about 16 s. Most of
  what is left is the provider's output speed.
- Quota: `protectEndpoint('ai', …, 'ai_requests')`, like 导入行程.
