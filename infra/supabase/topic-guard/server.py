"""Internal NeMo input-only topic rail; never generates the assistant answer."""
import asyncio
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import yaml
from fastapi import FastAPI, Header, HTTPException, Request
from nemoguardrails import RailsConfig
from nemoguardrails.guardrails.iorails import INTERNAL_ERROR_MESSAGE, IORails
from nemoguardrails.rails.llm.options import RailStatus, RailType
from pydantic import BaseModel, ConfigDict, Field

POLICY_VERSION = "kaipa-travel-v1"
MAX_BODY_BYTES = 96 * 1024
TIMEOUT_SECONDS = 30


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(max_length=800)


class TopicInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latestMessage: str = Field(min_length=1, max_length=64000)
    recentMessages: list[Message] = Field(default_factory=list, max_length=8)
    pendingQuestion: str | None = Field(default=None, max_length=1000)


def parse_topic_verdict(output: str):
    verdict = output.strip().lower()
    if verdict not in {"on-topic", "off-topic"}:
        # Do not let NeMo's permissive default parser treat malformed text as a pass.
        raise ValueError("invalid_topic_verdict")
    return verdict == "on-topic", []


def build_rails() -> tuple[IORails, str]:
    folder = Path(__file__).parent
    config = yaml.safe_load((folder / "config.yml").read_text())
    config.update(yaml.safe_load((folder / "prompts.yml").read_text()))
    model = os.environ.get("TOPIC_GUARD_MODEL") or os.environ.get("KAIPA_AI_FLASH_MODEL") or os.environ.get("KAIPA_AI_MODEL")
    api_key = os.environ.get("KAIPA_AI_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
    if not model or not api_key or not os.environ.get("TOPIC_GUARD_TOKEN"):
        raise RuntimeError("topic_guard_configuration_missing")
    # IORails resolves credentials via api_key_env_var, unlike SDK clients that
    # accept parameters.api_key. Never serialize the credential into config.
    os.environ["KAIPA_TOPIC_MODEL_API_KEY"] = api_key
    config["models"] = [{
        "type": "self_check_input", "engine": "openai", "model": model,
        "api_key_env_var": "KAIPA_TOPIC_MODEL_API_KEY",
        "parameters": {
            "base_url": os.environ.get("KAIPA_AI_BASE_URL", "https://ai.dootask.com/v1"),
            "timeout": TIMEOUT_SECONDS, "max_attempts": 1,
        },
    }]
    rails = IORails(RailsConfig.from_content(config=config))
    rails.rails_manager.task_manager.register_output_parser(parse_topic_verdict, "kaipa_topic_verdict")
    return rails, model


def create_app(rails=None, model=None, token=None):
    @asynccontextmanager
    async def lifespan(app):
        if app.state.rails is None:
            app.state.rails, app.state.model = build_rails()
        if not app.state.token:
            raise RuntimeError("topic_guard_token_missing")
        await app.state.rails.start()
        try:
            yield
        finally:
            await app.state.rails.stop()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.rails = rails
    app.state.model = model
    app.state.token = token or os.environ.get("TOPIC_GUARD_TOKEN", "")
    app.state.capacity = asyncio.Semaphore(8)

    @app.get("/health")
    async def health():
        return {"ready": app.state.rails is not None, "policyVersion": POLICY_VERSION, "engine": "NeMo IORails"}

    @app.post("/check")
    async def check(request: Request, authorization: str = Header(default="")):
        if not app.state.token or not secrets.compare_digest(authorization, "Bearer " + app.state.token):
            raise HTTPException(401, "unauthorized")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY_BYTES:
                raise HTTPException(413, "payload_too_large")
        try:
            payload = TopicInput.model_validate_json(body)
        except ValueError:
            raise HTTPException(422, "invalid_request") from None
        started = time.monotonic()
        try:
            # Includes time waiting for capacity, so overload cannot hang a worker.
            async with asyncio.timeout(TIMEOUT_SECONDS):
                async with app.state.capacity:
                    result = await app.state.rails.check_async(
                        [{"role": "user", "content": json.dumps(payload.model_dump(), ensure_ascii=False)}],
                        rail_types=[RailType.INPUT],
                    )
            if result.content == INTERNAL_ERROR_MESSAGE or result.status not in {RailStatus.PASSED, RailStatus.BLOCKED}:
                raise ValueError("unexpected_rail_status")
        except Exception:
            # Do not expose provider errors, credentials or request content.
            raise HTTPException(503, "topic_check_unavailable") from None
        return {"allowed": result.status == RailStatus.PASSED, "policyVersion": POLICY_VERSION,
                "model": app.state.model, "durationMs": round((time.monotonic() - started) * 1000)}

    return app


app = create_app()
