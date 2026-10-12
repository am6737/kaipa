-- Backfill live-observation author names: rows published before the fix
-- stored the hard-coded '我'/'Me' instead of the author's real nickname.
UPDATE route_observations AS o
SET author_name = COALESCE(
  NULLIF(TRIM(p.display_name), ''),
  NULLIF(TRIM(p.nick), '')
)
FROM profiles AS p
WHERE p.id = o.user_id
  AND o.author_name IN ('我', 'Me', 'me')
  AND COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(p.nick), '')) IS NOT NULL;
