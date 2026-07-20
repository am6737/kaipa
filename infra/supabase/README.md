# Kaipa self-hosted Supabase

Kaipa should not share the same self-hosted Supabase instance with unrelated apps.
This folder contains the reproducible setup for an isolated Kaipa Supabase runtime.

## What belongs in Git

- `supabase/schema.sql`
- `supabase/guest-schema.sql`
- `supabase/*migration.sql`
- `supabase/seed.sql`
- `supabase/functions/`
- `infra/supabase/setup-kaipa-supabase.sh`

## What must stay outside Git

- generated Supabase `.env` files with service-role keys / DB passwords
- `volumes/db/data/`
- `volumes/storage/`
- Studio snippets and local backups

## Create a fresh isolated runtime

By default the runtime is created next to the app repo:

```text
/home/coder/workspaces/
  kaipa/                    # app repo
  kaipa-supabase-docker/    # generated runtime, not committed
```

Run:

```bash
infra/supabase/setup-kaipa-supabase.sh
```

The script copies a self-hosted Supabase Docker template, patches it to use Kaipa
container names/ports, generates fresh JWT/API keys, starts Docker, applies Kaipa
schema/migrations, creates `test@kaipa.app / kaipa123`, seeds demo data, and writes
Kaipa's public URL + anon key into the app `.env`.

If the script cannot find a source Supabase Docker folder automatically, pass one:

```bash
SUPABASE_DOCKER_SOURCE=/path/to/supabase-docker \
  infra/supabase/setup-kaipa-supabase.sh
```

Useful overrides:

```bash
KAIPA_SUPABASE_RUNTIME_DIR=/srv/kaipa-supabase-docker \
KAIPA_SUPABASE_PUBLIC_URL=https://8010--main--am--am6737.coder.dootask.com \
KAIPA_SUPABASE_KONG_HTTP_PORT=8010 \
KAIPA_SUPABASE_POSTGRES_PORT=5434 \
infra/supabase/setup-kaipa-supabase.sh
```

## Current local split

- Yibai keeps the existing Supabase on port `8000`.
- Kaipa uses its isolated runtime on port `8010`.

Do not point both apps at the same Supabase URL unless they are intentionally
sharing Auth, `profiles`, Storage, and database tables.
