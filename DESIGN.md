# DESIGN.md: Kaipa

This is the design source of truth for the Kaipa app (Expo, React Native). Agents and contributors should follow it whenever they create or substantially redesign UI. If a feature needs a new visual pattern, update this file first.

Tokens and shared components live in `src/design-system/`, and colours live in `src/theme/theme.ts`. Import only from the public barrel, never from internal files:

```ts
import { AppFieldCard, AppQuestionHeader, layout, radius, space, type } from '../../design-system';
```

## 1. Visual theme and atmosphere

Three pages set the baseline, each for a different kind of screen:

- **个人信息** (`PlanningProfilePage` and its 身高 / 体重 / 出生年份 pickers in `src/components/me/`) sets the form and measurement language.
- **攻略详情** (`RouteGuidePage` in `src/components/discover/`) sets the reading language: long-form content with a floating action footer.
- **对话** (`AppAssistant` in `src/components/assistant/`) sets the conversation language: unboxed replies, rich result cards and a pill composer.

All three feel calm, airy and work-focused, never promotional.

1. **One question per surface.** A page or card asks one thing. 个人信息 is a stack of single-value cards. Each picker page opens with a direct question ("当前的身高是？") and a sentence on why the app asks.
2. **Numbers are the hero.** Values use large, tabular, semibold type, while labels and units stay quieter. Show `--` for an empty value, never `0`.
3. **Explain the why.** Every input has a one-line hint saying how the AI uses it ("用于估算…").
4. **Soft, rounded, flat.** Cards use large radii on the grouped background. They have no border at rest and no shadow in light mode. Depth is reserved for raised controls such as the measurement panel.
5. **Accent means "active".** The accent marks the current focus, a selection, progress, the primary action or meaningful data identity. It is never decoration.
6. **Quiet chrome.** Navigation is floating and transparent. The primary action is an icon, and it stays dimmed until there is something to commit.
7. **Light and dark are equal.** Design both modes together, with the same hierarchy and enough contrast in each. Never pick a fixed colour that only works in light mode.
8. **Content first, chrome floats.** On reading and conversation pages the content owns the full width and scrolls under floating controls: round 44pt buttons at the top, pill-shaped actions at the bottom. Controls are the only things that carry shadow or a hairline edge; the content itself stays flat.
9. **Structure comes from space, not boxes.** Reading pages separate sections with generous gaps and hairlines. Chat replies sit directly on the canvas with no bubble. A surface appears only for things the user acts on or compares: the user's own message, a result card, a source, a field.
10. **Show the work, then the answer.** Anything that takes time (AI research, weather, uploads) shows live progress in plain rows with a quiet status indicator. It never blocks the screen with a spinner, and it collapses to a summary when done.

## 2. Colour

Always read colours from `theme`. The only literal allowed is `#FFFFFF` for text on a filled accent or danger background. The accent is user-selectable (`ACCENT_PRESETS`), so treat it as dynamic.

| role | tokens |
| --- | --- |
| base background | `bg` |
| grouped list, form and settings pages | `groupedBg` |
| clean detail canvas | `featureSurface` |
| floating controls | `controlSurface` |
| standard card | `surfaceTop` |
| recessed field, chip, filter, soft stat block | `fieldSurface`, `fieldBorder` |
| measurement panel | `measureSurface`, `measureBorder`, `measureShadow` |
| text | `text` (primary), `text2` (labels, hints, units), `text3` (placeholders, chevrons, empty `--`) |
| emphasis | `accent`, `accentSoft` (highlight bands), `accentSofter` |
| destructive and error | `danger`, `dangerSoft` |
| liked state | `like` |
| lines and tracks | `hairline`, `border`, `progressTrack` |

Rules from the reading and conversation pages:

- A detail or conversation canvas is `featureSurface` (never a literal `#fff`, which breaks in dark mode). Grouped collection pages use `groupedBg`, unless their lists have no cards: the gear library, set list, set editor and set detail sit on `featureSurface`, since a grey page only exists to lift white cards.
- Floating pill controls (footer actions, composer, suggestion chips) are `controlSurface` with a `hairline` border or a soft shadow. On a white page they need the shadow (`theme.controlShadow`), or they disappear into it.
- In chat, the user's message is `accentSoft`; quick replies and the selected thread use `accentSofter`; sources, pending attachments and the unselected state of a filter use `fieldSurface`; result and plan cards use `surfaceTop`.
- Secondary metadata (dates, host names, time ranges, item indexes) uses `text3`. Body copy that supports a title uses `text2`. Only titles and primary values use `text`.
- Semantic status colours: `danger` for errors and for cancelling a voice message, `accent` for the primary action, active progress and the send button. `like` is the filled heart of a like (有用 / 有帮助) button. A one-off colour for any other single feature should likewise be a named theme token, not a literal.

Category, route, chart and identity colours may carry data meaning. Decorative colour must not compete with content or reduce contrast in dark mode.

## 3. Typography

Use a role from `type` and colour it with `text`, `text2` or `text3`. Don't add a new size to a screen when an existing role fits. If nothing fits, add a role here and in `tokens.ts`.

Roles from the 个人信息 pages:

| role | spec | use |
| --- | --- | --- |
| `question` | 27 / 700 / lh 38 | opening question of a single-question page |
| `lead` | 14 / lh 23 | explanation under the question |
| `fieldLabel` | 17 / 600 | field-card label and unit |
| `fieldValue` | 21 / 600, tabular | field-card value |
| `hint` | 12 / lh 19 | hint and error lines under a field |
| `chip` | 14 / 600 | choice chips |
| `readoutLabel` | 14 / 500 | label above a live readout |
| `display` | 86 / 600 / -3, tabular | live measurement value (76 when inline) |
| `displayUnit` | 19 / 600 | unit beside the display value |

App-wide roles:

| role | spec | use |
| --- | --- | --- |
| `pageTitle` | 25 / 800 | top-level screen titles, dialogs |
| `navTitle` | 17 / 700 | pushed-page nav bar |
| `sectionTitle` | 18 / 800 | in-content section heading |
| `cardTitle` | 15 / 700 | tile and row titles |
| `body` | 14.5 | running text, property rows |
| `eyebrow` | 12 / 600, uppercase | section labels above grouped cards |
| `caption` | 11.5 | secondary detail |
| `metric` | mono 16 / 800 | compact stat strips |
| `summaryValue` | mono 34 / 800 / -1.2, tabular | headline totals, set side by side at equal weight (装备总重量、总价值) |

Reading roles (攻略详情), all in `type`:

| role | spec | use |
| --- | --- | --- |
| (title) | `pageTitle` with `lineHeight: 36` | guide or plan title |
| `reading` | 14.5 / lh 27 | guide review and other long text; the generous leading is what makes long Chinese text comfortable |
| `readingLead` | 14.5 / lh 25 | the author's description under the title |
| `readingSummary` | 15 / 600 / lh 25 | day summary above its steps |
| `dayLabel` | 15 / 800 / lh 21, uppercase | `DAY 1` heading of an itinerary day |
| `step` | 13 / lh 23, `text2` | itinerary step, with a `text3` two-digit index (`01`) |
| `meta` | 11.5 / lh 19, `text2` | author, dates, counts |
| `tableName` | 12.5 / lh 19 | gear name |
| `tableNumber` | 11 / lh 19, tabular | gear weight and quantity (right-aligned, fixed-width columns) |

Conversation roles (对话), also in `type`. They all set `letterSpacing: 0`; don't apply negative tracking to chat text.

| role | spec | use |
| --- | --- | --- |
| `welcomeTitle` | 25 / 800 / lh 31 | empty-state greeting |
| `welcomeBody` | 19 / 700 / lh 27 | empty-state sentence |
| `message` | 14.5 / lh 22 | user and assistant messages; selectable |
| `suggestion` | 14.5 / 500 | starter prompt pills |
| `quickReply` | 15 / 600 / lh 20 | follow-up pills |
| `resultTitle` | 15 / 700 / lh 20 | action-result card title |
| `planTitle` | 20 / 800 / lh 26 | plan preview card |
| `planDay` | 15.5 / 800 / lh 21 | day heading in a plan preview |
| `planItem` | 13.5 / lh 19 | plan preview row |
| `planTime` | 12 / 600 / lh 18, `text3` | time range in a plan row |
| `sourceTitle` | 14 / 700 / lh 19 | source card title |
| `sourceHost` | 11.5 / lh 15, `text3` | source card host |
| `composerInput` | 15 / lh 20 | message field |
| `disclaimer` | 11 / lh 14, `text3`, centred | "AI generated" notice under the composer |
| `sheetTitle` | 26 / 800 / lh 32 | conversation list sheet |
| `threadTitle` / `threadCardTitle` / `threadMeta` | 16 / 700, 16.5 / 700, 12 | active thread title, thread list card title and meta |
| `chatLabel` / `chatDetail` / `chatDetailStrong` / `chatAction` / `chatCopy` | 12 / 600, 13, 13 / 700, 14 / 700, 13 | support labels, plan meta, action-result detail and link, view-journey button, copy button |
| `journeySuggestion` / `voiceHint` / `threadAction` / `fileName` | 15 / 500, 13 / 600, 15 / 700, 9.5 | journey suggestion row, voice gesture hint, new-thread button, pending file name |
| `researchTitle` / `researchLineTitle` / `researchSubtitle` / `researchLine` / `researchMeta` | 15 / 800, 13.5 / 700, 12.5 / 500, 12.5, 11.5 | `ResearchActivity` rows |

Guide page extras: `tableName` also serves the tab labels, `indexMono` the day number, `rowTitle`, `labelStrong`, `small`, `note` and `planRowTitle` the plan and weather rows, `guideTitle` and `guideTitleCompact` the card title, `planHeading` the plan title, `gearCategory` and `gearSummary` the gear headers. `byline`, `textInput`, `micro`, `microNote` and `tiny` cover the author line, the condition composer input, the counter, the publish error and media badges.

- Any number that users compare or scan should use tabular figures (`fontVariant: ['tabular-nums']`) or the `metric` monospace. That includes weight, distance, money, duration, quantity, coordinates, percentages and years. The numeric roles above already include tabular figures.
- Text must wrap, shrink or truncate deliberately within its parent and never overlap nearby content. Check both Chinese and English strings.

## 4. Layout, spacing and shape

### Spacing: `space`

| token | px | typical use |
| --- | --- | --- |
| `xxs` | 4 | nudge between icon and text |
| `xs` | 8 | gap inside a row, gap between chips |
| `sm` | 12 | gap between stacked cards |
| `md` | 16 | card vertical padding, gap from question to description, standard content gap |
| `lg` | 20 | card horizontal padding |
| `xl` | 24 | page top padding, side padding on single-question pages |
| `xxl` | 30 | major section gap (`layout.sectionGap`), measurement panel padding |
| `xxxl` | 40 | gap from header to picker stage |

`layout` covers fixed dimensions: `pagePadding` 16 (list and form pages), `topBarHeight` 50, `iconButton` 44 (minimum touch target), `fieldHeight` 44 and `listRowMinHeight` 64. Single-question pages use `space.xl` side padding for a more open feel.

### Radius: `radius`

| token | px | use |
| --- | --- | --- |
| `control` | 11 | small inline controls |
| `card` | 16 | chips, text areas, buttons, standard cards |
| `feature` | 24 | settings cards (`MeCard`), wheel highlight |
| `showcase` | 30 | field cards, Me-screen tiles, measurement panels |
| `pill` | 999 | ticks, indicators, capsule buttons |

Nested corners step down one level: a `card` chip sits inside a `showcase` card. Dividers use `StyleSheet.hairlineWidth`.

### Spacing on reading and conversation pages

| where | value |
| --- | --- |
| reading page side padding | `space.xl` (24) |
| gap before a major section on a reading page | `space.xxl` (30); itinerary days are separated by `space.xl` padding and a hairline |
| heading to its content | `space.md` (16) to `space.lg` (20) |
| conversation side padding | `layout.pagePadding` (16) for messages and `space.lg` (20) for the composer |
| gap between messages | `space.lg` (20) after a user message, `space.xl` (24) after an assistant reply |
| footer clearance | scroll content ends at least `insets.bottom + 120` above the floating footer |

Additional shapes: floating buttons and composers are `radius.pill`; the user bubble, source card and action-result card are `radius.card`; plan preview cards and thread cards are `radius.feature`; bottom sheets round their top corners at 30 (`radius.showcase`) with a 30×4 drag handle.

### Cards versus open layout

Prefer open sections and unboxed lists. Use a card to frame a meaningful repeated group, a set of statistics, a form field or a state. Don't nest cards without a clear structural reason. Controls must keep stable dimensions so that layout doesn't shift as state changes.

## 5. Components

Reach for these before writing a page-local equivalent. Keep feature-specific components (for example `GearItemRow`) in their feature directory, built from the global tokens and primitives. Promote a component to `src/design-system/` only when at least two product areas genuinely need it.

### Form and measurement (from 个人信息)

| component | what it is |
| --- | --- |
| `AppFieldCard` | Label, large value, unit and chevron, with a hint and error underneath. Pass `onOpen` to push a picker page, or `onChange` for inline numeric input. The border turns accent on focus and `danger` on error. |
| `AppChoiceChip` | Multi-select chip (`accessibilityRole="checkbox"`) that fills with the accent when selected. Lay chips out in a `flexWrap` row with `gap: space.xs`; they grow to fill each line. |
| `AppTextArea` | Multiline free text on `fieldSurface`, placed inside a card under the chips for "other". |
| `AppQuestionHeader` | `question` plus `lead`; opens a single-question page. |
| `AppMeasurementPanel` | Raised panel with a 2px rim that hosts a ruler or wheel picker. Accepts `View` props, so it can be the `adjustable` accessibility element. |
| `AppReadout` | Live value made of label, display number and unit. `stacked` sits beside a vertical picker; `inline` centres above a horizontal ruler. |

### General

| component | what it is |
| --- | --- |
| `AppCard` | Standard elevated card surface. |
| `AppSectionHeader` | Eyebrow or title heading, with an optional trailing action. |
| `AppPropertyRow` | Label and value row with hairline dividers. |
| `AppMetricStrip` | Row of compact monospace stats. |
| `AppProgressBar` | Neutral track with an accent fill. |
| `AppIconButton` | 44×44 circular icon button. |
| `AppFilterButton` | Trailing filter control of a list header: sliders icon plus a label naming the current state (全部, or 筛选 N), at least 44pt tall with no fill. `active` turns it accent once anything narrows the list. What it opens is up to the page: a popover for a single choice, a bottom sheet for several. |
| `AppActionDialog` | Confirmation dialog, including the destructive variant. Its two buttons share one row: cancel on the left, the action (accent, or `danger` when destructive) on the right; a long label shrinks to fit instead of wrapping. Dialogs with a field (`RenameTrackDialog`) use the same row. |
| `DetailPage` | Full-screen detail shell with a floating back button. |
| `AppHeaderSearch` | Top-bar search that expands in place. |

### Reading and conversation (feature-level, to promote when reused)

These live in their feature folders today. They are the reference implementations; copy their behaviour before inventing a variant.

| component | where | what it is |
| --- | --- | --- |
| `RouteGuideTabs` | `discover/RouteGuideContent.tsx` | Underlined tab strip: equal-width tabs, a 2px `text`-coloured underline on the selected tab, hairline under the strip, `accessibilityRole="tab"`. |
| `RouteGuideSectionHeader` | same | `sectionTitle` with an optional right-aligned "查看全部 ›" action (44pt tall). |
| `RouteGuideRow` | same | List row: two-line title, `caption` facts, author with avatar, and an 80×84 (64×64 compact) rounded thumbnail on the right. Rows are separated by hairlines, not cards. |
| `RouteGuideItinerary` | same | Day blocks: uppercase day label, bold summary, then numbered steps in `text2`. |
| `RouteGuideEquipment` | same | Gear table: weight stat strip, then category groups with right-aligned weight and `×n` columns. |
| footer actions | `discover/RouteGuidePage.tsx` | Absolutely positioned footer with pill buttons on `controlSurface`: a "有用" like button (heart plus count) and the primary "按此攻略创建行程" action, which gets the larger share (`flex: 1.45`). |
| message | `assistant/AppAssistant.tsx` | User message: right-aligned, `accentSoft` bubble, max width 84%. Assistant message: full width, no bubble. |
| `ResearchActivity` | same | Collapsible progress list for AI work: one line per step, a loading-dots indicator on the running step, completed steps in muted text. |
| `SourcesStrip` | same | Horizontal strip of 220×94 source cards on `fieldSurface`, each with a brand icon, host, arrow and two-line title. Not pressable when there is no URL. |
| `PlanPreviewCard` / `ActionResultCard` | same | Result cards on `surfaceTop` with a soft shadow; the card ends with an "open" link that takes the user to the real object. |
| quick replies and suggestions | same | Pill chips (`accentSofter` for follow-ups, `controlSurface` for the starter prompts), at least 44pt tall. |
| composer | same | Pill field on `controlSurface` with a soft shadow: add (+) on the left, multiline input, and one action on the right that changes between mic, send, stop and uploading. The action turns `accent` once there is something to send or cancel. |
| thread sheet | same | Bottom sheet on `featureSurface` with a drag handle; thread cards are 96pt tall, `radius.feature`, `accentSofter`, and reveal actions on swipe. |

Settings pages also use `MePushPage` (the shell) and `MeSection`, `MeCard`, `MeRow` and `SwitchRow` from `src/components/me/parts.tsx`.

## 6. Page patterns

### Form (个人信息)

`MePushPage` on `groupedBg`. A ✓ icon sits on the right; it shows at opacity 0.45 in `text3` until the draft changes. The content uses `paddingHorizontal: layout.pagePadding`, `paddingTop: space.xl` and `gap: space.sm`, with one `AppFieldCard` per value. Put a group of related controls in a card with the same shell (`radius.showcase`, `space.lg` / `space.md` padding). End the page with a centred `hint` line explaining the benefit. Validate on save and show the error on the field. Use a toast only for network failures. Settings pages follow the same rhythm and don't get a separate look.

### Single question (身高, 体重, 出生年份)

`MePushPage` with the title in the nav bar. The content uses `paddingHorizontal: space.xl` and starts with `AppQuestionHeader`. The picker stage comes `space.xxxl` below: an `AppReadout` plus an `AppMeasurementPanel`, side by side for vertical pickers or stacked inside the panel for horizontal rulers. Going back commits the value, so there is no save button. The picker must be `adjustable` with increment and decrement actions.

### Reading detail (攻略详情)

`DetailPage` with `scrollable={false}` and `flatChrome`, entered with `entryVariant="continuationX"` so it feels like a continuation of the list it came from. The canvas is `featureSurface`; the nav bar only carries the back button, a centred 17pt title and at most one icon action (share or add). Content scrolls with `paddingHorizontal: space.xl` and ends above the footer.

Order of content: a title, then a one-line author row (28px avatar and name), then dates in `caption`, then the author's description, then the itinerary, then equipment, then the review. Each section opens with a `sectionTitle`. Use tabs only to switch between alternatives of the same content (the reference plans), and keep them directly under the plan's description.

A footer floats above the scroll content for the actions that act on the whole page. Use at most two pills: a quiet secondary one (like) and one primary one (create a journey from this). The primary action keeps the neutral `controlSurface` look; it doesn't turn into a solid accent button. A selected state, such as a liked guide, is communicated by the icon fill and the count, with `accessibilityState={{ selected }}`.

A data-heavy page such as weather or conditions uses `groupedBg` and cards; the long-form guide page uses the clean canvas. Empty and loading states are a centred line of `text2` with a retry link in `accent`, never a blank page. Compose pages (sharing a condition) use a single multiline field on `surfaceTop` with a character counter, a media row and one publish pill that is `accent` only when valid.

### Conversation (对话)

A full-screen modal on `featureSurface` with no nav bar. A 44pt round `controlSurface` button sits on each side, with the title (the thread or journey name) centred between them.

The empty state is left-aligned: a small assistant mark, a `welcome title`, and a short list of suggested prompts as pills the user can tap. Anchor it to the bottom of the screen so it sits next to the composer.

Messages:
- The user's message is a right-aligned `accentSoft` bubble with `radius.card`; the assistant's reply is plain text across the full width, selectable, with a copy action under it.
- Attachments sit under the message they belong to (112pt image thumbnails, or a file row with an icon, name and size). Upload status appears inline with a retry that is at least 44pt tall.
- While the assistant works, show `ResearchActivity` above the reply. When it finishes it collapses; it never replaces the reply.
- Results the user can act on arrive as cards (`PlanPreviewCard`, `ActionResultCard`, sources) after the text, each with a clear link into the real object. Sources scroll horizontally and bleed to the screen edges.
- Suggested follow-ups arrive as `accentSofter` pills. They are disabled while a request is running.

Composer: pinned at the bottom on `featureSurface`, with a disclaimer line beneath. Pending attachments show as 64×64 tiles above it, each with a small remove button, and the attachment tray expands below it with an animation. Voice input is press-and-hold: the field is replaced by the live waveform, a hint says "release to send" or "release to cancel", and the cancelling state is shown in `danger`.

Conversation history opens as a bottom sheet. Never navigate away from the conversation just to switch threads.

### Overview

A strong page title, then a compact high-value summary, then a few grouped feature cards. Recent or actionable content comes before exhaustive data, with clear links into full collections. Summary tiles (as on the Me screen) are compact `AppCard`s on `fieldSurface` with `radius.feature` and no shadow. Use `layout.overviewCardMinHeight` (144) as a minimum and let longer content grow instead of making the height follow the width. They have a `cardTitle` and `caption` at the top, an `AppMetricStrip` or preview at the bottom, and open the matching page when tapped.

### Collection and list

Shared top chrome, with `AppHeaderSearch` for search. Sorting, filtering, selection and layout controls stay secondary. List and grid geometry stays stable. Empty, loading and error states are explicit.

What is counted must be visible. While searching, the count reads "shown / total", and the totals add up only the rows on screen. In the floating bottom bar, the add pill is the primary action, filled `accent` with white text, and sort stays on `controlSurface`.

The gear library (`gear/GearItemsList.tsx`) pages by category instead of filtering. Thumbnails that show a photo get a `hairline` edge so white-backed product shots keep their outline on the white page; grid cards sit on `fieldSurface`. 总重量 and 总价值 sit side by side at the same size (`summaryValue`, unit in `liveUnit`), with no card behind them, and follow the page on screen or, in selection, the selected items. Below them, sticky tabs list 全部 then each non-empty category, heaviest first, with the shared 系统 suffix dropped; the indicator follows the swipe and takes the category colour. A grid button at the end of the tab row, with no background of its own, opens 全部分类: a two-column sheet of plain tiles with name, count, weight share and weight, and no colour dots or bars. Swiping to another page keeps the summary collapsed if it was and lands at the top of the new page. List rows sit straight on the page with no card or divider; only a press (`fieldSurface`) or a selection (`accentSofter`) tints them. Weight (`metric`) sits over value (`caption`, mono) on the right. Under the name, the category shows only on 全部, then quantity with unit weight, and the 穿戴, 消耗, 备选 and 待购 tags.

The set list (`gear/GearSetsList.tsx`) uses the same background-free rows. The name and total weight (`metric`) share the first line, with counts, any description and value (`caption`) under them. A strip of up to six 40 px thumbnails follows, heaviest first, with `+N` in the last slot when more are left. Pinned sets get their own 置顶 group above 全部. There is no grid view and no summary total, because adding up sets means nothing.

The track library (`tracks/TracksPage.tsx`) follows the gear library on `featureSurface`, with no track-shape thumbnail and no grid view. 总里程 (km) and 总爬升 (m) sit side by side as `summaryValue` and follow the visible rows, or the selection in select mode (已选里程 / 已选爬升, 里程 / 爬升 on a filtered tab). Under them sticky 全部 / 已应用 / 未使用 tabs carry a small mono count, the active one bold `text` with a short accent underline and no hairline. Rows use the `SetRow` shell: name (`cardTitle`, up to two lines), then one caption line with ascent (`arrowUp`, mono), the short date, an accent 已应用 N tag and the mono file-format tag; distance alone in `metric` on the right. The header keeps only search and more; the accent 添加轨迹 pill opens a compact menu (导入文件 / 开始记录) next to itself, and import progress reads inline under the title.

The set editor (`gear/GearSetEditor.tsx`) is the same page in edit form. The name is typed straight into a `pageTitle`-sized field with a `N/24` counter, and the description sits under it with no field chrome. Two `summaryValue` figures follow: skin-out weight and value. Under them a 基础 / 穿戴 / 消耗 line breaks the weight down and opens the weight-definitions sheet. Selected gear is grouped by category in the gear library's `ItemRow`s, and optional items are dimmed because they count toward no weight. Rows carry no controls. Tapping one opens a bottom sheet with a segmented 携带方式 control and a one-line note on how it counts, a quantity stepper, and 移出清单 / 完成. The bottom bar pairs 选择装备 (or 修改选择) with the accent create or save pill.

Tell "nothing yet" apart from "nothing matches". A filtered-out list shows a centred line with a clear-filter action. A collection that is truly empty keeps the page's shape: totals read `--` in `text3`, and dashed placeholder cards with the same geometry as the real cards stand where the list will be. The first placeholder is the "add the first one" action; the ones behind it fade out. Because that card already adds an item, the bottom bar drops both its add and sort pills and keeps only the AI create action, centred (`EmptyPlaceholderCards` in `gear/GearItemsList.tsx`, used by the gear library and an empty set's detail page). An empty set hides its share button, donut, breakdown and groups; its first card opens the set editor straight into gear selection, and 「AI 补充装备」 stays centred at the bottom.

Adding an item has no chooser page. Every add control (the bottom pill, the first placeholder card, the picker's +) opens the same compact menu next to itself, opening away from the nearer screen edge. It has three rows: 粘贴链接, 拍照识别 and 手动填写 (`AddGearMenu` in `gear/AddGearMenu.tsx`). Each row goes straight into its step. 粘贴链接 opens a single-question page (`GearLinkPastePage`) built from `type.question`, `type.lead` and one pill field on `featureSurface`. Its trailing control is 粘贴 while the field is empty, which reads the clipboard, and turns into an accent arrow once the text holds a link. Recognition runs on that page and lands on the item form already filled in; on failure the error and a quiet 手动填写 stay on the page. 拍照识别 opens the full-screen camera, and backing out of it leaves the add flow; the shot is recognized on the form, with one line under the name for progress or the failure. The item form carries no method buttons of its own. Tapping the form's photo area opens the same compact menu (`GearAnchoredMenu`) at the touch point, with 拍照 and 从相册选择 rows. Recognition fills only fields that are still empty and tints the values it filled `accent` until the user edits them (number tiles switch to `accentSofter`), at the same size and padding so nothing shifts.

### Detail

`DetailPage` on `featureSurface`. An optional image or immersive hero, then a strong entity title, then the primary facts or metrics, then progressively more detailed metadata and related content. Secondary actions go in top-bar menus.

The track detail page (`tracks/TrackDetailPage.tsx`) is the reference. The map owns the whole screen and the story is pulled up over it on a three-detent `TrailSheet`: the lowest is the grab handle, the name in `pageTitle` and one compact row of headline numbers with icons (距离, 累计爬升, 累计下降, 用时 only when the file has it, `--` when it does not); the middle adds the elevation curve; fully open adds the `meta` line (date, source 实地记录 or 导入 GPX, an accent 标注点 N that selects the first mark, hidden when there are none), the other measures (用时, 平均速度, 累计下降, 最高海拔, 最低海拔, 轨迹点) in a three-column grid on one `fieldSurface` block, then 所属旅程 and 文件 (label and value rows). Nothing is separated by lines; only whitespace. Marks are never a list — a track can carry far too many. They are numbered in distance order both on the map and above the curve, and the two counts agree, so badge 7 is the same place everywhere. Tapping one puts a floating card on the map above the sheet: a photo thumbnail or a soft accent tile with its number, a mono `3 / 36` counter, the name, the distance and elevation, round previous/next buttons that step through the marks, and a small close; the body opens the mark detail, where rename, delete and the photos live. The card rides the sheet and fades out as the sheet reaches the top detent, and selecting a mark from a fully open sheet snaps it back to the middle. The curve shades the band under the line where the grade reaches 8% and again past 14% (`gradeModerate`, `gradeSteep`), names those two grades in a small legend, and turns its line to `text` while the bands show; holding and dragging it still scrubs, with a fixed-height readout above and the map marker following. Right-hand map controls ride the sheet and fade out as it nears the top. The layers control opens the same map style panel as the route card: 标准 or 卫星, plus switches for the kilometre labels along the line (on by default, with the total over the finish) and, when the track has marks, the marks themselves. Switching marks off clears both the map badges and the curve badges and closes the card. Back and ⋯ are bare icons with no disc behind them, kept legible over tiles by a light drop shadow. The footer carries 应用到旅程 and the primary 跟着轨迹走 as the sheet's own buttons (`TrailControlButton`, as on the recording page): flat `fieldSurface` for the secondary, solid `accent` with white for the primary, no shadow, since they sit on the sheet rather than float over a page. The footer slides away at the lowest detent; rename, export and delete are in the ⋯ menu. A file without elevation says so in place of the curve.

## 7. Motion and interaction

- Durations come from `motion`: `quick` 180 ms (dialogs, fades), `standard` 230 ms and `emphasized` 280 ms. Pushed pages use `pageSpring`, which has no bounce.
- `Press` has no press animation, no scale and no fade. Feedback comes from the change in state: colour, the switch sliding, or the next page opening. Don't add new `scaleTo` or `opacityTo` usages.
- Motion should explain hierarchy or continuity, not decorate.
- Use icons from the existing icon library. Every icon-only action needs an `accessibilityLabel`. Touch targets are at least 44×44.
- Put secondary actions in menus. Destructive actions need confirmation through `AppActionDialog` with `destructive`.
- Long operations show progress in place (research rows, upload status) and offer a way out: stop while running, retry after failure. Errors appear next to the thing that failed, in `danger`.
- Gestures must have a visible equivalent: swipe actions on a thread are also reachable from its menu, and press-and-hold voice input has a tap fallback. Announce live changes (upload status, step status) with `accessibilityLiveRegion="polite"`.
- Use the accent for state and the primary action. Avoid oversized, marketing-style calls to action.

## 8. Content and copy

- Keep existing Chinese copy and the i18n structure. Questions end with "？", and hints describe the benefit.
- **Separators:** don't use the middle dot `·`, bullets or slashes as the default separator between independent metadata or statistics (weight, value, count, category). Show structure with icon and value groups, spacing, labels, rows and columns, or wrapping. Plain spaces or Chinese punctuation are fine. Text lists are joined with `、`. Punctuation separators are acceptable only when they belong to natural language, a conventional data format, legal or brand copy, or another deliberate textual expression. Don't copy existing `·` patterns into new UI; migrate them when you touch that UI.
- Units are separate text after the value (`170` `cm`), so the number can be styled on its own.

## 9. Review checklist

Before merging UI work, check that:

- It follows this file and uses public design-system APIs and semantic theme values.
- Spacing, radii, type roles, page chrome and the surface hierarchy match the baseline.
- Light and dark modes keep the same hierarchy and enough contrast.
- Chinese and English strings fit without clipping or overlap.
- Empty, loading, error, editing, selection and destructive states have been considered.
- No feature-specific component was promoted to global without a real cross-domain use.
- `npx tsc --noEmit` passes in the root (the Expo app).

## 10. Known drift (backlog)

Fix these when you touch the affected areas:

- `OnboardingFlow` has its own copy of the field card (`OptionalField`) and pill-shaped dietary chips. Switch it to `AppFieldCard`, `AppChoiceChip` and `AppTextArea` so onboarding matches 个人信息.
- Font sizes are scattered: there are more than 25 distinct `fontSize` literals, many of them half-points (12.5, 13.5, 15.5). New code should use a `type` role.
- Radii are scattered too (14, 18, 22 and 26 are common). Map each to the nearest `radius` token.
- `RouteGuideContent`, `RouteGuidePage` and `AppAssistant` are fully on `type` roles. Keep new text on roles too.
- Existing `·` separators remain in `RouteWeatherCard` ("天气 · 多云") and in the research list's failure label ("… · 未完成"). Replace them with spacing or Chinese punctuation when you next touch them.
- `AppAssistant.tsx` is 2,400 lines. `ResearchActivity`, `SourcesStrip`, `PlanPreviewCard`, `ActionResultCard` and the composer should move into their own files under `assistant/` so the patterns in section 6 have one implementation each.
- Raised-panel shadows are hard-coded per screen (`'0px 8px 24px …'`). Move the repeated ones into theme tokens, as was done for `measureShadow`.
