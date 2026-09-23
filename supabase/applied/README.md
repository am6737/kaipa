# Superseded one-off SQL

Historical patches whose contents are already folded into `schema.sql` or into
timestamped files under `../migrations/`. Kept for provenance only — new fresh
installs never apply these, and live databases already have them.

Do not add new files here: apply changes as `../migrations/<timestamp>_*.sql`
via `infra/supabase/apply-migration.sh`, and fold stable state back into
`schema.sql`.
