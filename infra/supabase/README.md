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
- `infra/supabase/docker/` — the Git-tracked source of the self-hosted stack:
  `docker-compose*.yml`, `run.sh`, `setup.sh`, `reset.sh`, `utils/`, `tests/`,
  `dev/`, `.env.example`, `CONFIG.md`, `CHANGELOG.md`, `versions.md`, `README.md`

## Where things live

`infra/supabase/docker/` is both the Git-tracked source of the stack (compose
files, `run.sh`, `utils/`, `tests/`, `dev/`, docs) and the live runtime
workspace. Everything runtime-only is gitignored there:

- `.env` (and `.env.*` variants), `kaipa-client.env` — secrets, never commit
- `volumes/` — DB data, storage files, Kong config, deployed functions
- `_archive/` — legacy debris (old migrations from an unrelated project, backups)
- `agent-worker.mjs`, `agent-worker.compose.yml`, `rail-query/`,
  `rail-query.compose.yml` — runtime copies installed by
  `deploy-agent-worker.sh` / `deploy-rail-query.sh` from the tracked sources in
  `infra/supabase/`; edit the tracked ones, never the copies

To manage the stack: `cd infra/supabase/docker && sh run.sh status|logs|restart …`.
For overrides (`pg17`, `rustfs`, …) use `sh run.sh config add|remove <name>`.

## What must stay outside Git

- generated Supabase `.env` files with service-role keys / DB passwords
- `volumes/` (DB data, storage, Studio snippets, local backups)
- runtime copies of `agent-worker.*` and `rail-query*`

## Create a fresh isolated runtime

Run from the repo root:

```bash
infra/supabase/setup-kaipa-supabase.sh
```

The target runtime dir defaults to `infra/supabase/docker/` (point
`KAIPA_SUPABASE_RUNTIME_DIR` elsewhere for an isolated copy). The script copies
a self-hosted Supabase Docker template, patches it to use Kaipa
container names/ports, generates fresh JWT/API keys, starts Docker, applies Kaipa
schema/migrations, creates `demo@kaipa.app / demo123456`, seeds demo data, and writes
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

## Deploy changes

This checkout is self-hosted only. Do not run `supabase link`,
`supabase functions deploy`, or `supabase db push` here.

Deploy one Edge Function:

```bash
infra/supabase/deploy-functions.sh app-agent
```

Deploy all repository Edge Functions:

```bash
infra/supabase/deploy-functions.sh
```

The deploy script refuses to run when this checkout is linked to Supabase Cloud
or when the App and runtime URLs differ. It syncs into the Docker bind mount,
restarts the Edge Runtime, and checks every deployed route through port `8010`.

Apply one SQL migration to the self-hosted database:

```bash
infra/supabase/apply-migration.sh supabase/migrations/<migration>.sql
```
