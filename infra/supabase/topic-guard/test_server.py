import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient

from server import MAX_BODY_BYTES, POLICY_VERSION, build_rails, create_app, parse_topic_verdict


@pytest.fixture
def client(monkeypatch):
    replies = []
    requests = []

    class Provider(BaseHTTPRequestHandler):
        def do_POST(self):
            assert self.headers.get("Authorization") == "Bearer test-only"
            requests.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            status, content = replies.pop(0)
            body = json.dumps({"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                               "usage": {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13}}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    worker = threading.Thread(target=provider.serve_forever, daemon=True)
    worker.start()
    monkeypatch.setenv("KAIPA_AI_API_KEY", "test-only")
    monkeypatch.setenv("KAIPA_AI_BASE_URL", f"http://127.0.0.1:{provider.server_port}/v1")
    monkeypatch.setenv("TOPIC_GUARD_MODEL", "test-model")
    monkeypatch.setenv("TOPIC_GUARD_TOKEN", "test-token")
    monkeypatch.setenv("DO_NOT_TRACK", "1")
    rails, model = build_rails()
    with TestClient(create_app(rails, model, "test-token")) as test_client:
        yield test_client, replies, requests
    provider.shutdown()
    provider.server_close()
    worker.join()


def check(client, message):
    return client.post("/check", headers={"Authorization": "Bearer test-token"},
                       json={"latestMessage": message, "recentMessages": [], "pendingQuestion": None})


def test_actual_nemo_input_rail_without_answer_generation(client):
    http, replies, requests = client
    for output, expected in [("on-topic", True), ("off-topic", False)]:
        replies.append((200, output))
        response = check(http, "test request")
        assert response.status_code == 200
        assert response.json()["allowed"] is expected
        assert response.json()["policyVersion"] == POLICY_VERSION
    assert len(requests) == 2  # Exactly one classifier call per request.
    assert all(request["max_tokens"] == 32 and not request.get("tools") for request in requests)
    assert all("api_key" not in request and "max_retries" not in request for request in requests)
    assert "骑自行车的鹅" in requests[0]["messages"][0]["content"]


def test_invalid_verdict_and_provider_failure_do_not_pass(client):
    http, replies, requests = client
    for status, output in [(200, "sure, here is your SVG"), (500, "provider secret error")]:
        replies.append((status, output))
        response = check(http, "generate svg")
        assert response.status_code == 503
        assert response.json() == {"detail": "topic_check_unavailable"}
    assert len(requests) == 2


def test_authentication_and_body_limits_run_before_model(client):
    http, replies, requests = client
    assert http.post("/check", json={"latestMessage": "hello"}).status_code == 401
    assert check(http, "").status_code == 422
    assert http.post("/check", headers={"Authorization": "Bearer test-token"},
                     content=b"x" * (MAX_BODY_BYTES + 1)).status_code == 413
    assert requests == []


def test_parser_accepts_only_explicit_verdicts():
    assert parse_topic_verdict(" ON-TOPIC\n")[0] is True
    assert parse_topic_verdict("off-topic")[0] is False
    for output in ["", "yes", "not off-topic", "on-topic or off-topic", '{"allowed":true}']:
        with pytest.raises(ValueError):
            parse_topic_verdict(output)
