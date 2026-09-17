"""Start/stop the private verification desktop; keep credentials out of git."""

import argparse
import os
from pathlib import Path
import secrets
import socket
import string
import subprocess
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "restart", "stop", "status", "logs", "health", "search-status", "resume-search"))
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(__file__).resolve().parent
    state = Path(os.environ.get("KAIPA_BROWSER_STATE_DIR", str(Path.home() / ".local/state/kaipa-browser-verification"))).resolve()
    chrome = os.environ.get("KAIPA_BROWSER_CHROME_DIR")
    if not chrome:
        candidates = list((Path.home() / ".cache/ms-playwright").glob("chromium-*/chrome-linux*/chrome"))
        if not candidates:
            parser.error("Set KAIPA_BROWSER_CHROME_DIR to a complete Chrome installation")
        chrome = str(max(candidates, key=lambda path: path.stat().st_mtime).parent)
    env = {**os.environ, "KAIPA_BROWSER_STATE_DIR": str(state), "KAIPA_BROWSER_CHROME_DIR": chrome}
    command = ["docker", "compose", "-f", str(root / "compose.yml")]
    if args.action in {"search-status", "resume-search"}:
        path = "status" if args.action == "search-status" else "resume"
        request = urllib.request.Request(
            f"http://127.0.0.1:8073/v1/{path}",
            method="GET" if path == "status" else "POST",
            headers={"X-Kaipa-Browser-Key": (state / "search-api-key.txt").read_text().strip()},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            print(response.read().decode())
    elif args.action in {"start", "restart"}:
        running = subprocess.check_output(command + ["ps", "--status", "running", "-q"], env=env, text=True).strip()
        if running and args.action == "start":
            parser.error("Session is already running; use status or stop first")
        if not running:
            for port in (6082, 8073):
                with socket.socket() as sock:
                    sock.bind(("127.0.0.1", port))
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        state.chmod(0o700)
        (state / "profile").mkdir(exist_ok=True, mode=0o700)
        (state / "profile").chmod(0o700)
        # VNC authentication uses only eight characters. Coder's authenticated
        # HTTPS proxy is the primary external access control, not this password.
        password_file = state / "password.txt"
        if args.action == "start" or not password_file.exists():
            password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
            with password_file.open("w") as output:
                output.write(password + "\n")
        password_file.chmod(0o600)
        key_file = state / "search-api-key.txt"
        if not key_file.exists():
            with key_file.open("x") as output:
                output.write(secrets.token_urlsafe(32) + "\n")
        key_file.chmod(0o600)
        recreate = ["--force-recreate"] if args.action == "restart" else []
        subprocess.run(command + ["up", "-d", "--build", "--wait", "--wait-timeout", "120", *recreate], env=env, check=True)
        proxy = os.environ.get("VSCODE_PROXY_URI", "http://127.0.0.1:{{port}}/").replace("{{port}}", "6082")
        print("Browser: " + proxy.rstrip("/") + "/vnc.html?autoconnect=1&resize=scale")
        print("VNC password file: " + str(password_file))
        print("Auto-stop: four hours. Existing crawler configuration is unchanged.")
    else:
        subcommand = {
            "stop": ["down"], "status": ["ps", "-a"], "logs": ["logs", "--tail", "60"],
            "health": ["exec", "-T", "browser", "python3", "/opt/session.py", "health"],
        }[args.action]
        subprocess.run(command + subcommand, env=env, check=True)


if __name__ == "__main__":
    main()
