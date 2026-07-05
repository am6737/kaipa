# KMZ Track Import Support Design

## Goal

Allow the existing track import flow to accept `.kmz` files in addition to `.gpx` and `.kml`.

## Approach

KMZ files are ZIP archives that contain a main KML file. The import flow will detect `.kmz`, read it as binary data, extract the KML, and pass that KML text to the existing `parseTrack()` pipeline.

Extraction order:

1. Use `doc.kml` when present.
2. Otherwise use the first `.kml` entry found in the archive.
3. If no KML entry exists, show the existing parse error.

## Code Boundaries

- Add a small KMZ extraction helper under `src/lib/` so zip handling is isolated from UI code.
- Keep GPX/KML parsing unchanged except where format labels or file extensions need to include KMZ.
- Update the file validation and localized copy to mention GPX / KML / KMZ.

## Data Flow

1. User picks a file from the route upload sheet.
2. If the extension is `gpx` or `kml`, read text and parse as today.
3. If the extension is `kmz`, read binary/base64, extract KML text, and parse using filename `*.kml`.
4. Compute stats and patch the current route with the same data fields as existing imports.

## Error Handling

- Unsupported extension: show the format error.
- Invalid ZIP, missing KML, unreadable KML, or track without enough points: show the existing parse/no-points errors.
- Keep the loading state reset in all failure paths.

## Testing

- Verify the provided `武功山反穿.kmz` contains `doc.kml` and imports through the new path.
- Run TypeScript checking if available.
- Add or run a small local extraction check for the helper when feasible.
