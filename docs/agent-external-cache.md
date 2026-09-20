# Agent External Cache

The app-agent external cache is shared across users and is intended for
non-user-specific evidence returned by providers. It is accessed only through
the service-role RPCs `read_agent_external_cache` and
`write_agent_external_cache`; end-user JWTs have no table or RPC permissions.

## Provider contract

New travel research sources must be registered through
`search/registry.ts` and returned through `aggregateTravelSearch`. The search
cache key includes the route identity, knowledge topic, locale, enabled source
set and result limit, so Tavily, Xiaohongshu (`xhs`), Douyin (`douyin`) and
future providers share the same evidence cache without mixing source sets.

Provider adapters must return normalized results and must not put user data,
credentials, cookies or session state in the payload. Failed or verification-
required responses are never persisted.

Independent external tools such as maps, weather, hotel or equipment APIs must
use the same RPC pair with their own namespace and a TTL appropriate to the
data. Live availability and prices stay short-lived; route knowledge can use a
long TTL but must retain `retrievedAt` and source provenance.
