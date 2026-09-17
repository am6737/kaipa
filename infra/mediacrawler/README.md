# Travel Search Modes

Xiaohongshu has two server-selected modes. This is an operator setting, not a
tool argument the language model or mobile client can override. Douyin is unchanged.

| Mode | Implementation | Login state |
| --- | --- | --- |
| `api` (default) | Existing MediaCrawler signed HTTP search | Existing crawler profiles |
| `browser` | Playwright fills the actual webpage search control and observes its response | Manually logged-in noVNC Chrome |

Browser mode does not replay a captured API request, generate search signatures,
or bypass CAPTCHA. It recognizes v1/v2 note-search responses from the known XHS
hosts, including `so.xiaohongshu.com`, and accepts only the submitted keyword and
first page. Unsupported responses are errors, not silently successful empty results.

## Switch Modes

Start the browser environment, complete login/verification manually, then select:

```bash
python3 infra/mediacrawler/browser-verification/manage.py start
infra/mediacrawler/start-kaipa-gateway.sh --xhs-search-mode browser
```

Switch back explicitly:

```bash
infra/mediacrawler/start-kaipa-gateway.sh --xhs-search-mode api
```

The switch restarts only the MediaCrawler gateway. The selection persists in
`~/.local/state/kaipa-gateway/xhs-search-mode`, including when the existing gateway
watchdog starts it again. `--restart` restarts with the saved mode. `XHS_SEARCH_MODE`
can override the saved default at process startup; the CLI flag has precedence.
In-flight gateway searches can be interrupted by a mode switch.

The gateway's `/health` reports `xhs_search_mode`. It is service liveness, not proof
that platform login/search is working. Search responses include `mode`, and caches
are separated by platform, mode, keyword and limit. Failed searches are not cached.

## Browser Service

The gateway talks to an authenticated HTTP service on host `127.0.0.1:8073`.
It never receives cookies or direct access to Chrome's CDP port. Defaults:

```text
XHS_BROWSER_SEARCH_URL=http://127.0.0.1:8073/v1/search
XHS_BROWSER_SEARCH_KEY_FILE=~/.local/state/kaipa-browser-verification/search-api-key.txt
```

The start script expands the default home path. When configuring a key-file path
directly in an environment file, use an absolute path. Alternatively provide
`XHS_BROWSER_SEARCH_API_KEY` through a server secret store. Never put it in an
`EXPO_PUBLIC_` setting or commit the key to git. Override `KAIPA_BROWSER_STATE_DIR`
consistently when moving browser state.

The browser service owns one separate tab, serializes searches, waits at least
10 seconds after each operation, allows at most four waiters, and limits queue
waiting to 10 seconds and each search operation to 45 seconds. The gateway HTTP
budget is 75 seconds, below the current app-agent source timeout of 90 seconds.
Keep that ordering if changing the source timeout. Successful identical queries
reuse the gateway's existing cache/coalescing behavior.

On CAPTCHA, platform restrictions, or a login prompt, the service returns an
actionable error and blocks further browser searches without additional platform
requests. There is no automatic API fallback. Inspect and resume after manual work:

```bash
python3 infra/mediacrawler/browser-verification/manage.py search-status
python3 infra/mediacrawler/browser-verification/manage.py resume-search
```

Resume only clears the circuit breaker; the next search still checks the webpage.
The breaker is process-local and resets on a browser service restart. Queue full,
browser unavailable, unsupported response, and timeout are separate errors.

The current verification session still stops after four hours. Until restarted,
browser-mode search reports unavailable; it never switches mode silently. This is
an attended browser integration, not a guarantee of unattended platform access.

Rebuild the browser service while preserving its profile and VNC password:

```bash
python3 infra/mediacrawler/browser-verification/manage.py restart
```

The adjacent `MediaCrawler` checkout contains the gateway routing changes in
`api/services/kaipa_browser_search.py` and `api/routers/kaipa.py`. Both this repo's
browser service and that checkout's gateway changes are required for deployment.

See [Browser Verification](browser-verification/README.md) for access controls and
the host's Chrome sandbox limitation. Platform terms and the MediaCrawler license
still apply; successful operation does not imply permission for commercial use.
