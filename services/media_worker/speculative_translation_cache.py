"""
speculative_translation_cache.py
─────────────────────────────────────────────
Fires GPT-4 translations speculatively during speech, before the user
finishes talking.

How it works:
  1. WhisperPoller emits NEW words every 500 ms while the user speaks.
  2. PollerToSpecCache (in processing.py) accumulates those words into a
     growing transcript and calls submit_partial() for each version:
       "hello" → "hello my" → "hello my name" → "hello my name is Syed"
  3. Each submit_partial() fires a background GPT-4 translation and
     immediately CANCELS the previous in-flight one (it is stale).
  4. When WhisperProcessor emits the final authoritative transcript (after
     mic release), WhisperToTTS calls get_or_translate():
       Cache HIT  → translation is already waiting. TTS starts < 100 ms.
       Cache MISS → single fresh GPT-4 call (~200-400 ms). Rare, because
                    the final transcript usually matches the last partial.
"""

import asyncio
import logging
from typing import Awaitable, Callable, Dict, Optional

logger = logging.getLogger("speculative_translation")


class SpeculativeTranslationCache:
    MAX_CACHE_SIZE = 200  # Oldest entry evicted on overflow

    def __init__(self):
        self._cache: Dict[str, str] = {}
        self._in_flight: Optional[asyncio.Task] = None
        self._pending_key: Optional[str] = None

    # ── Public API ────────────────────────────────────────────────────────────

    def get_cached(self, transcript: str) -> Optional[str]:
        """Instant synchronous lookup. Returns None on miss."""
        return self._cache.get(transcript.strip())

    async def submit_partial(
        self,
        transcript: str,
        translate_fn: Callable[[str], Awaitable[str]],
    ) -> None:
        """
        Fire a background translation for this partial transcript.
        Cancels any previous in-flight translation — it is for a shorter,
        now-stale transcript.
        No-op when the result is already cached.
        """
        key = transcript.strip()
        if not key or key in self._cache:
            return

        # Cancel the previous in-flight task — a newer transcript supersedes it.
        if self._in_flight and not self._in_flight.done():
            self._in_flight.cancel()

        self._pending_key = key
        self._in_flight = asyncio.create_task(
            self._translate_and_store(key, translate_fn)
        )

    async def get_or_translate(
        self,
        transcript: str,
        translate_fn: Callable[[str], Awaitable[str]],
    ) -> str:
        """
        Return cached translation or wait for one.
        Called when speech ends and we need the result for TTS.
        """
        key = transcript.strip()
        if not key:
            return ""

        # Fast path — already done.
        if key in self._cache:
            logger.info(f"[SPECULATIVE] Cache HIT ✓ '{key[:60]}'")
            return self._cache[key]

        # The latest in-flight task is for exactly this transcript — wait for it.
        # IMPORTANT: detach the task from the cache slot BEFORE awaiting. This
        # prevents a concurrent PollerToSpecCache.submit_partial() call (for the
        # first word of the next utterance) from cancelling the task we are about
        # to rely on. Once detached, submit_partial sees _in_flight=None and starts
        # a fresh task rather than cancelling ours.
        if (
            self._pending_key == key
            and self._in_flight
            and not self._in_flight.done()
        ):
            logger.info(f"[SPECULATIVE] Awaiting in-flight for '{key[:60]}'")
            task = self._in_flight
            self._in_flight = None   # detach — submit_partial can't cancel this now
            self._pending_key = None
            try:
                await task
                if key in self._cache:
                    return self._cache[key]
            except (asyncio.CancelledError, Exception):
                pass

        # Cache miss — translate now.
        logger.info(f"[SPECULATIVE] Cache MISS — translating now: '{key[:60]}'")
        result = await translate_fn(key)
        if result:
            if len(self._cache) >= self.MAX_CACHE_SIZE:
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[key] = result
        return result or ""

    def reset_utterance(self) -> None:
        """
        Cancel the current in-flight task and reset pending state.
        Call this when WhisperProcessor commits a final transcript so that
        stale speculative tasks do not keep running unnecessarily.
        """
        if self._in_flight and not self._in_flight.done():
            self._in_flight.cancel()
        self._in_flight = None
        self._pending_key = None

    def clear(self) -> None:
        """Flush cache and cancel in-flight tasks. Call on language change."""
        self.reset_utterance()
        self._cache.clear()
        logger.info("[SPECULATIVE] Cache cleared")

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _translate_and_store(
        self,
        key: str,
        translate_fn: Callable[[str], Awaitable[str]],
    ) -> None:
        try:
            result = await translate_fn(key)
            if result:
                if len(self._cache) >= self.MAX_CACHE_SIZE:
                    oldest = next(iter(self._cache))
                    del self._cache[oldest]
                self._cache[key] = result
                logger.info(f"[SPECULATIVE] Stored: '{key[:40]}' → '{result[:40]}'")
        except asyncio.CancelledError:
            logger.debug(f"[SPECULATIVE] Cancelled (stale transcript): '{key[:40]}'")
        except Exception as e:
            logger.debug(f"[SPECULATIVE] Background translate error: {e}")
