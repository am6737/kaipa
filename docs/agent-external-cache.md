> Runtime guide search and reading are retired and moved to offline collection. Planning now reads curated trusted route guides. See [route guide collection](route-guide-collection.md). The notes below preserve the previous implementation history.

# Agent External Cache

The app-agent external cache is shared across users and is intended for
non-user-specific evidence returned by providers. It is accessed only through
the service-role RPCs `read_agent_external_cache` and
`write_agent_external_cache`; end-user JWTs have no table or RPC permissions.

## Provider contract

New travel research sources must be registered through
`search/registry.ts` and returned through `aggregateTravelSearch`. The search
cache key (`travel-search:v3`) includes the normalized query text (trimmed,
whitespace collapsed, lowercased), route identity, knowledge topic, locale,
enabled source set and result limit, so Tavily, Xiaohongshu (`xhs`), Douyin (`douyin`) and
future providers share the same evidence cache without mixing source sets.

Provider adapters must return normalized results and must not put user data,
credentials, cookies or session state in the payload. Failed or verification-
required responses are never persisted.

Independent external tools such as maps, weather, hotel or equipment APIs must
use the same RPC pair with their own namespace and a TTL appropriate to the
data. Live availability and prices stay short-lived; route knowledge can use a
long TTL but must retain `retrievedAt` and source provenance.

The v3 namespace makes contaminated v2 search rows unreachable without deleting
them. Guide documents use `travel-guide:v1` keyed by the exact normalized public
URL, so different articles cannot collide by journey/topic. Research briefs
carry `researchCacheVersion: 3`; older briefs and multi-route briefs with
duplicated source sets or web facts are rebuilt instead of reused.

Rail snapshots default to 900 seconds. For departure dates within the next
48 hours (Asia/Shanghai), their effective TTL is at most 900 seconds, with
`RAIL_CACHE_TTL_SECONDS` as an upper bound. Cache reads also enforce the age
from `cacheMeta.observedAt`, including rows written with older, longer TTLs.
Planning skips services departing less than 60 minutes from the current time.
