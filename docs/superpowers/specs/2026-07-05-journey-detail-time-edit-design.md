# Journey Detail Time Editing Design

## Goal
Update the lower detail card in the journey detail split view so the identity header no longer shows the location subtitle. Instead, for journeys, it shows a tappable duration value such as `6时` or `3天`. Tapping it opens a bottom-sheet time picker card where users can edit the journey start and end times.

## User-facing behavior
- In the embedded journey detail card header:
  - Keep the journey title.
  - Remove the existing subtitle location line (`region` and date).
  - Show a compact duration chip under the title for journey items.
- Duration copy:
  - Durations under one day display as hours: `x时`.
  - Durations of one day or more display as days: `x天`.
  - Values should be derived from the current start/end dates when possible.
- Interaction:
  - Tapping the duration chip opens a time picker bottom sheet.
  - The sheet lets users adjust both start and end time.
  - Applying changes updates the journey and immediately refreshes the detail header and overview stats.

## Technical approach
Reuse the existing new-journey time picker concepts in `NewJourneySheet.tsx`: start/end tabs, calendar, time wheel, quick duration chips, and bottom-sheet presentation. To avoid coupling the detail view to the entire new-journey flow, extract or duplicate only the minimal picker needed for journey-detail editing.

## Data flow
- Source values:
  - Parse existing journey date fields where available.
  - Fall back to a sensible current/default start date when exact stored times are unavailable.
  - Use `days`, `totalDays`, or `trackDurationMs` as fallback duration inputs.
- On apply:
  - Compute duration from selected start/end.
  - Patch the current journey through `nav.patchCurrent` so local UI and persistence update together.
  - Update `days` to the localized day count and keep existing journey fields compatible with the rest of the app.

## Component changes
- `SelectedPoiCard`:
  - Render the embedded journey header subtitle as a tappable duration chip instead of location/date text.
  - Hold picker open/closed state for the time editing card.
- Time picker card:
  - Use the app's existing `NJBottomSheet`, `NJMiniCalendar`, `NJWheelPicker`, and date/time helpers where practical.
  - Provide cancel/done actions and preserve current styling.

## Error handling and edge cases
- If end time is before or equal to start time, force at least a minimal positive duration.
- If existing date strings cannot be parsed, initialize from the current date and existing duration/day count.
- If persistence fails, existing nav/db behavior already keeps the optimistic UI; no extra blocking alert is required for this small edit.

## Testing
- Type-check the project.
- Manually verify:
  - Embedded journey detail header no longer shows location subtitle.
  - Duration chip displays `x时` or `x天`.
  - Tapping opens the picker.
  - Changing start/end and pressing done updates the detail card.
  - Route detail cards are unaffected.
