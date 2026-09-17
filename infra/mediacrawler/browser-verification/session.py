"""Isolated, time-limited browser with an authenticated webpage search service."""

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request


def health():
    for port, path in ((6080, "/vnc.html"), (9222, "/json/version"), (8073, "/health")):
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=2) as response:
            if response.status != 200:
                raise RuntimeError(f"Service on {port} is unavailable")
    with socket.create_connection(("127.0.0.1", 5900), timeout=2) as conn:
        if not conn.recv(12).startswith(b"RFB "):
            raise RuntimeError("VNC protocol is unavailable")


def run():
    os.umask(0o077)
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    children = []

    def launch(args):
        process = subprocess.Popen(args, start_new_session=True)
        children.append(process)
        return process

    try:
        password = Path("/run/secrets/vnc-password").read_text().strip()
        if len(password) != 8 or not password.isascii():
            raise ValueError("VNC password must contain exactly eight ASCII characters")
        with Path("/run/vnc-auth").open("wb") as output:
            subprocess.run(["tigervncpasswd", "-f"], input=(password + "\n").encode(), stdout=output, check=True)

        launch(["Xvfb", ":99", "-screen", "0", "1440x900x24", "-nolisten", "tcp", "-noreset"])
        for _ in range(100):
            if Path("/tmp/.X11-unix/X99").exists():
                break
            if stop.wait(0.1):
                return
        else:
            raise RuntimeError("Xvfb did not start")
        launch(["openbox", "--sm-disable"])
        launch([
            "x11vnc", "-display", ":99", "-listen", "127.0.0.1", "-no6", "-rfbport", "5900",
            "-rfbportv6", "-1",
            "-rfbauth", "/run/vnc-auth", "-forever", "-nevershared", "-dontdisconnect",
            "-noxdamage", "-noxrecord", "-nosel", "-quiet",
        ])
        launch(["websockify", "--web", "/usr/share/novnc", "0.0.0.0:6080", "127.0.0.1:5900"])
        # This host cannot run Chrome's user-namespace sandbox. The enclosing
        # nonprivileged container is the isolation boundary, without workspace mounts.
        launch([
            "/opt/chrome/chrome", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
            "--disable-background-networking", "--disable-sync", "--password-store=basic",
            "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9222",
            "--user-data-dir=/home/browser/profile", "--start-maximized", "about:blank",
        ])
        launch(["/opt/browser-search-venv/bin/uvicorn", "browser_search:app", "--app-dir", "/opt",
                "--host", "0.0.0.0", "--port", "8073", "--no-access-log"])
        for _ in range(100):
            try:
                health()
                break
            except Exception:
                if stop.wait(0.2):
                    return
        else:
            raise RuntimeError("Browser services did not become healthy")
        ttl = int(os.environ.get("SESSION_TTL_SECONDS", "14400"))
        deadline = time.monotonic() + ttl
        print(json.dumps({"status": "ready", "expires_in_seconds": ttl}), flush=True)
        while not stop.wait(1):
            if time.monotonic() >= deadline:
                print("Session time limit reached; shutting down.", flush=True)
                break
            if any(process.poll() is not None for process in children):
                raise RuntimeError("A browser service exited; shutting down all services")
    finally:
        # Close Chrome before its display server so the profile can flush cleanly.
        deadline = time.monotonic() + 10
        for process in reversed(children):
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            try:
                process.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()


if __name__ == "__main__":
    if sys.argv[1:] == ["health"]:
        health()
    else:
        run()
