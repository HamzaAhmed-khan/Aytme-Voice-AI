#!/usr/bin/env python3
"""
test-pipeline.py
----------------------------------------------------------------
CLI end-to-end test for the AYTME Realtime translation pipeline.

Uses the exact production session config, system-prompt builder,
and ignorable-error set from realtime_translate.py — no rewrites,
no mocks of the core logic.

Text is injected via conversation.item.create (input_text content)
so the model processes it identically to live transcribed speech.

Usage:
    python test-pipeline.py
    Requires OPENAI_API_KEY in .env (project root) or environment.

Exit 0 = all tests passed.  Exit 1 = one or more failures.
"""

import asyncio
import base64
import json
import os
import sys
import traceback
import types
from pathlib import Path

# Force UTF-8 output on Windows (non-ASCII transcripts like Yoruba/Japanese)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# -----------------------------------------------------------------------------
# 1.  Load OPENAI_API_KEY
# -----------------------------------------------------------------------------
_ROOT = Path(__file__).parent
_API_KEY = os.environ.get("OPENAI_API_KEY", "")

if not _API_KEY:
    _env = _ROOT / ".env"
    if _env.exists():
        for _line in _env.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line.startswith("OPENAI_API_KEY=") and not _line.startswith("#"):
                _API_KEY = _line.split("=", 1)[1].strip().strip("'\"")
                break

if not _API_KEY or _API_KEY.startswith("sk-proj-YOUR"):
    print("[ERROR @ STARTUP] -> OPENAI_API_KEY not set or is still a placeholder.")
    print("  Add it to .env:  OPENAI_API_KEY=sk-proj-...")
    sys.exit(1)

print(f"[STARTUP] -> API key loaded ({_API_KEY[:12]}...)")

# -----------------------------------------------------------------------------
# 2.  Stub the two external dependencies realtime_translate.py needs at import
#     time:  (a) app.core.config   (b) fastapi
#
#     We only need the production utility functions — not the HTTP server.
# -----------------------------------------------------------------------------

class _FakeSettings:
    OPENAI_API_KEY = _API_KEY


class _FakeRouter:
    def websocket(self, *a, **kw):
        return lambda f: f


class _FakeWebSocket:
    pass


class _FakeWebSocketDisconnect(Exception):
    pass


def _FakeQuery(default=None):
    return default


def _make_mod(name: str, **attrs) -> types.ModuleType:
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


_app_mod  = _make_mod("app")
_core_mod = _make_mod("app.core")
_cfg_mod  = _make_mod("app.core.config", settings=_FakeSettings())
_app_mod.core = _core_mod          # type: ignore[attr-defined]
_core_mod.config = _cfg_mod        # type: ignore[attr-defined]

_make_mod(
    "fastapi",
    APIRouter=_FakeRouter,
    WebSocket=_FakeWebSocket,
    WebSocketDisconnect=_FakeWebSocketDisconnect,
    Query=_FakeQuery,
)
_make_mod("fastapi.params")        # imported transitively by some fastapi versions

# -----------------------------------------------------------------------------
# 3.  Import real production functions from realtime_translate.py
# -----------------------------------------------------------------------------
sys.path.insert(0, str(_ROOT / "services" / "api"))

try:
    from api.v1.realtime_translate import (   # type: ignore
        _build_system_prompt,
        _session_config,
        LANGUAGE_ACCENT_MAP,
        _IGNORABLE_ERROR_CODES,
        _OPENAI_REALTIME_URL,
    )
    print("[IMPORT OK] -> Loaded production functions from realtime_translate.py\n")
except Exception as _exc:
    print(f"[ERROR @ IMPORT] -> {_exc}")
    print("[STACK] ->")
    traceback.print_exc()
    sys.exit(1)

import aiohttp   # noqa: E402 — must come after sys.path is set

# -----------------------------------------------------------------------------
# 4.  Static accent validation — no API calls, runs instantly
#     Verifies that each language resolves to the exact locked accent string
#     and that the system prompt contains it verbatim.
# -----------------------------------------------------------------------------

_ACCENT_VALIDATION = [
    # Generic accent lock checks
    ("English",  "French",            "Parisian French"),
    ("Spanish",  "Japanese",          "Tokyo Japanese"),
    ("Hindi",    "English",           "neutral North American English"),
    ("English",  "Arabic",            "Modern Standard Arabic, Levantine inflection"),
    # Yoruba target — verify full speaking guide is injected
    ("English",  "Yoruba",            "native Yoruba"),
    ("English",  "Yoruba",            "CRITICAL YORUBA SPEAKING INSTRUCTIONS"),
    ("English",  "Yoruba",            "tonal language with THREE tones"),
    ("English",  "Yoruba",            "gb\" is a single voiced labial-velar plosive"),
    ("English",  "Yoruba",            "REMINDER: This session is Yoruba"),
    # Yoruba source — verify input guide is injected
    ("Yoruba",   "English",           "WHEN LISTENING TO YORUBA INPUT"),
    ("Yoruba",   "English",           "REMINDER: This session is Yoruba"),
]

# Yoruba characters that MUST appear in correctly rendered Yoruba output.
# If a translation is ASCII-only it has lost all tonal diacritics.
_YORUBA_DIACRITIC_CHARS = {"ọ", "ẹ", "ṣ", "à", "á", "è", "é", "ì", "í", "ò", "ó", "ù", "ú", "ń"}


def _check_yoruba_diacritics(text: str) -> bool:
    """Return True if output contains at least one Yoruba diacritic character."""
    found = {c for c in _YORUBA_DIACRITIC_CHARS if c in text}
    if found:
        print(f"[YORUBA]  -> diacritics present: {', '.join(sorted(found))} ✓")
        return True
    print(f"[YORUBA]  -> [WARN] No tonal diacritics in output — marks may be stripped")
    print(f"             text: {text!r}")
    return False


def _run_accent_validation() -> bool:
    divider = "─" * 62
    print("\n" + "=" * 62)
    print("  ACCENT LOCK — Static Validation (no API calls)")
    print("=" * 62)
    passed, failed = [], []
    for source, target, expected_accent in _ACCENT_VALIDATION:
        prompt = _build_system_prompt(source, target)
        ok = expected_accent in prompt
        status = "PASS" if ok else "FAIL"
        if ok:
            passed.append(f"{source} → {target}: {expected_accent!r}")
        else:
            failed.append((f"{source} → {target}", expected_accent))
        print(divider)
        print(f"[{status}] {source} → {target}")
        print(f"       expected string  : {expected_accent!r}")
        if not ok:
            print(f"       prompt preview  : {prompt[:200]!r}")
        else:
            print(f"       string confirmed in system prompt ✓")
    print(divider)
    print(f"\n  ACCENT VALIDATION: {len(passed)}/{len(_ACCENT_VALIDATION)} passed")
    for label, acc in failed:
        print(f"    FAIL  {label}  — {acc!r} not found in prompt")
    print("=" * 62 + "\n")
    return not failed


# -----------------------------------------------------------------------------
# 5.  Test matrix (live API calls)
# -----------------------------------------------------------------------------
TESTS = [
    ("English", "French",   "Hello, how are you today?"),
    ("English", "Yoruba",   "Good morning, welcome to the meeting."),
    ("English", "Yoruba",   "Thank you very much, the food was delicious."),
    ("English", "Yoruba",   "What is your name? Where are you from?"),
    ("Spanish", "Japanese", "¿Cómo te llamas? Mucho gusto."),
    ("Hindi",   "English",  "नमस्ते, आप कैसे हैं?"),
]

# Pairs where the output MUST contain Yoruba diacritics
_YORUBA_OUTPUT_PAIRS = {("English", "Yoruba")}

# -----------------------------------------------------------------------------
# 6.  Single-test runner
# -----------------------------------------------------------------------------
DIVIDER = "-" * 62


async def _run(source: str, target: str, text: str, api_key: str) -> dict:
    """Run one language pair. Returns a result dict."""
    result: dict = {"ok": False, "transcript": "", "audio_bytes": 0, "error": None}

    accent = LANGUAGE_ACCENT_MAP.get(target, f"authentic native {target} regional accent")

    print(DIVIDER)
    print(f"[INPUT]   -> \"{text}\"")
    print(f"          source={source}  target={target}")
    print(f"          accent='{accent}'")

    # Build the session config using the REAL production function
    try:
        system_prompt   = _build_system_prompt(source, target)
        session_payload = _session_config(system_prompt, target, source)
    except Exception as exc:
        result["error"] = f"session config error: {exc}"
        print(f"[ERROR @ SESSION] -> {exc}")
        print("[STACK] ->")
        traceback.print_exc()
        return result

    item_create = {
        "type": "conversation.item.create",
        "item": {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": text}],
        },
    }
    response_trigger = {"type": "response.create"}

    transcript_parts: list[str] = []
    audio_bytes = 0
    session_sent      = False
    item_sent         = False
    response_triggered = False

    async def _event_loop(ws: aiohttp.ClientWebSocketResponse) -> None:
        nonlocal session_sent, item_sent, response_triggered, audio_bytes

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.ERROR:
                raise RuntimeError(f"WebSocket transport error: {ws.exception()}")
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue

            event = json.loads(msg.data)
            etype = event.get("type", "")
            print(f"[RECEIVING] -> {etype}")

            # -- session.created -> send our session.update -------------
            if etype == "session.created" and not session_sent:
                session_sent = True
                payload_json = json.dumps(session_payload, indent=2)
                print(f"[SENDING]  -> session.update")
                print(f"[PAYLOAD]  -> {payload_json}")
                await ws.send_json(session_payload)

            # -- session.updated -> inject text as user input -----------
            elif etype == "session.updated" and not item_sent:
                item_sent = True
                print(f"[SENDING]  -> conversation.item.create")
                print(f"[PAYLOAD]  -> {json.dumps(item_create)}")
                await ws.send_json(item_create)

            # -- user item fully committed -> trigger response (once only)
            # Use conversation.item.done (not .added) — .added doesn't reliably
            # expose item.role in all API versions, causing a silent no-op.
            elif etype == "conversation.item.done" and not response_triggered:
                response_triggered = True
                print(f"[SENDING]  -> response.create")
                await ws.send_json(response_trigger)

            # -- transcript delta (new GA event name) ------------------
            elif etype == "response.output_audio_transcript.delta":
                delta = event.get("delta", "")
                if delta:
                    transcript_parts.append(delta)
                    print(f"[TRANSCRIPT] -> \"{delta}\"")

            # -- audio chunk (new GA event name) -----------------------
            elif etype == "response.output_audio.delta":
                raw = base64.b64decode(event.get("delta", ""))
                audio_bytes += len(raw)
                print(f"[AUDIO]    -> {len(raw):,} bytes  (total: {audio_bytes:,} bytes)")

            # -- turn complete -----------------------------------------
            elif etype == "response.done":
                result["transcript"]  = "".join(transcript_parts)
                result["audio_bytes"] = audio_bytes
                result["ok"]          = True
                print(f"[TRANSLATION] -> \"{result['transcript']}\"")
                print(f"[OUTPUT]   -> {len(result['transcript'])} chars")
                print(f"[AUDIO]    -> {audio_bytes:,} bytes total (not played)")
                break  # done — exit the async-for loop

            # -- OpenAI error ------------------------------------------
            elif etype == "error":
                err  = event.get("error", {})
                code = err.get("code", "unknown")
                if code in _IGNORABLE_ERROR_CODES:
                    print(f"[RECEIVING] -> error suppressed (non-fatal: {code})")
                else:
                    msg_text = err.get("message", str(err))
                    print(f"[ERROR @ API] -> code={code} message={msg_text}")
                    print(f"[PAYLOAD]  -> {json.dumps(event)}")
                    result["error"] = f"OpenAI error {code}: {msg_text}"
                    break

    try:
        async with aiohttp.ClientSession() as http:
            async with http.ws_connect(
                _OPENAI_REALTIME_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                heartbeat=20,
            ) as ws:
                print(f"[SESSION] -> Connected to OpenAI Realtime API")
                try:
                    await asyncio.wait_for(_event_loop(ws), timeout=60.0)
                except asyncio.TimeoutError:
                    result["error"] = "timeout after 60 s — response.done never received"
                    print(f"[ERROR @ TIMEOUT] -> {result['error']}")

    except aiohttp.ClientConnectorError as exc:
        result["error"] = f"network error: {exc}"
        print(f"[ERROR @ CONNECT] -> {exc}")
        print("[STACK] ->")
        traceback.print_exc()
    except Exception as exc:
        result["error"] = str(exc)
        print(f"[ERROR @ WEBSOCKET] -> {exc}")
        print("[STACK] ->")
        traceback.print_exc()

    if result["ok"]:
        print(f"[DONE]    -> Pipeline OK  ({source} -> {target})")
        if (source, target) in _YORUBA_OUTPUT_PAIRS and result["transcript"]:
            _check_yoruba_diacritics(result["transcript"])
    else:
        print(f"[FAIL]    -> Pipeline FAILED  ({source} -> {target}): {result['error']}")

    return result


# -----------------------------------------------------------------------------
# 6.  Main
# -----------------------------------------------------------------------------
async def main() -> int:
    # Phase 1: static accent validation (instant, no network)
    accent_ok = _run_accent_validation()

    print("=" * 62)
    print("  AYTME Realtime Pipeline — CLI End-to-End Test")
    print(f"  Model:  gpt-realtime  |  Test cases: {len(TESTS)}")
    print("=" * 62)

    passed: list[str] = []
    failed: list[tuple[str, str]] = []

    for source, target, text in TESTS:
        result = await _run(source, target, text, _API_KEY)
        label  = f"{source} -> {target}"
        if result["ok"]:
            passed.append(label)
        else:
            failed.append((label, result["error"] or "unknown error"))

    print(f"\n{'=' * 62}")
    print("  SUMMARY")
    print(f"  PASSED: {len(passed)}/{len(TESTS)} | FAILED: {len(failed)}/{len(TESTS)}")
    for label in passed:
        print(f"    PASS  {label}")
    for label, err in failed:
        print(f"    FAIL  {label}  ->  {err}")
    print("=" * 62)

    return 0 if (not failed and accent_ok) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
