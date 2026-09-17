# Manual Browser Verification

This desktop is separate from the MediaCrawler gateway. It starts on a blank page
and never logs in or copies existing cookies automatically. Its authenticated
browser-search service runs searches only when requested. See
[Travel Search Modes](../README.md) for the optional gateway integration.

## Lifecycle

```bash
python3 infra/mediacrawler/browser-verification/manage.py start
python3 infra/mediacrawler/browser-verification/manage.py status
python3 infra/mediacrawler/browser-verification/manage.py restart
python3 infra/mediacrawler/browser-verification/manage.py stop
```

Start prints the noVNC URL. Sign in to Coder, then enter the password from
`~/.local/state/kaipa-browser-verification/password.txt`. Each start rotates it;
`restart` rebuilds/recreates the service while preserving the password and profile.
Use the desktop browser to navigate to Xiaohongshu and complete any platform
verification yourself. Do not run automated searches while verification is pending.

The session stops after four hours, including when a browser tab remains open.
The private profile persists for a later manual restart. Stop does not delete it.
`logs` prints recent service logs; logs can contain visited URLs, so do not publish them.

## Security Boundaries

- noVNC is published on host `127.0.0.1:6082`. Use Coder's authenticated
  HTTPS port proxy or an authenticated tunnel, never public port sharing.
- VNC (`5900`) and CDP (`9222`) listen only on the container's loopback interface.
  Neither is published. The gateway uses the separate HTTP search service, not CDP.
- Browser search is published on host `127.0.0.1:8073` and requires its own random
  API key for search, status, and resume. Only liveness is unauthenticated. The key
  is stored in `~/.local/state/kaipa-browser-verification/search-api-key.txt` (0600).
- VNC has a separate password. Its legacy eight-character authentication is
  defense in depth; HTTPS and Coder access control remain mandatory.
- The container runs as UID 1000, drops all capabilities, prevents privilege
  escalation, uses a read-only root, and limits memory, processes, and CPU.
- The only mounts are read-only Chrome binaries, the VNC/search secrets, and a dedicated
  profile. No project directory, Docker socket, original browser profile, or
  application environment file is mounted.
- Chrome runs without its internal sandbox because the current host cannot
  support the user-namespace sandbox. Container isolation is not equivalent to
  Chrome's renderer sandbox. Use this only for short-lived verification on
  trusted sites; do not browse arbitrary links or use important personal accounts.
- Clipboard synchronization is disabled. Cookies/profile data are private files,
  not encrypted at rest. Workspace administrators can access them.

The full Chrome installation defaults to the most recently modified cached
Playwright Chromium binary. Override with `KAIPA_BROWSER_CHROME_DIR` if needed.
Set `KAIPA_BROWSER_STATE_DIR` to change the private storage location. These
settings must be consistent across start, stop, status, and logs commands.

## Verification

```bash
python3 infra/mediacrawler/browser-verification/manage.py status
python3 infra/mediacrawler/browser-verification/manage.py health
```

Health checks HTTP, CDP discovery, and the VNC protocol, not platform
login or search availability. Never interpret healthy as a cleared risk challenge.

Run tests using a Python environment with `requirements.txt`, `httpx`, and an
installed Playwright Chromium (the adjacent MediaCrawler environment has these):

```bash
RUN_BROWSER_SEARCH_UI_TESTS=1 ../MediaCrawler/.venv/bin/python -B -m unittest \
  discover -s infra/mediacrawler/browser-verification -p 'test_*.py' -v
```

UI fixture tests intercept all network requests; they never contact XHS.
