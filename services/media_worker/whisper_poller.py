import asyncio
import io
import logging
import time
import wave
from collections import deque
from typing import List, Optional

import aiohttp
import numpy as np

logger = logging.getLogger("whisper_poller")

# 🟢 FIX #3: Import language ISO mapper for proper Whisper language codes
from services.media_worker.language_iso_mapper import get_iso_code

# ─── Tonal language helpers ───
_TONAL_LANGUAGES = {'yo', 'yoruba', 'ig', 'igbo', 'ha', 'hausa', 'am', 'amharic', 'zu', 'zulu'}

def _is_tonal(lang_code: str) -> bool:
    return (lang_code or '').lower().strip() in _TONAL_LANGUAGES

def _get_whisper_prompt(lang_code: str):
    """Return a Whisper prompt hint for tonal languages to improve STT accuracy."""
    code = (lang_code or '').lower().strip()
    if code in ('yo', 'yoruba'):
        return (
            "This is Yoruba speech. Yoruba is a tonal West African language "
            "with diacritical marks (ọ, ẹ, ṣ). Common words include: "
            "bawo ni, ẹ kú, ọjọ́, ṣé, àbí, kò, mo, se, wa, lọ, pẹ̀lú."
        )
    if code in ('ig', 'igbo'):
        return "This is Igbo speech. Igbo is a tonal West African language."
    if code in ('ha', 'hausa'):
        return "This is Hausa speech. Hausa is a Chadic language spoken in West Africa."
    return None

class WhisperPoller:
    """
    Manages a sliding window of audio and polls OpenAI Whisper (STT) 
    every 500ms to simulate a real-time streaming experience.
    """
    def __init__(self, api_key: str, primary_lang: str, poll_interval: float = 0.5, window_duration: float = 3.0):
        self.api_key = api_key
        self.primary_lang = primary_lang
        self.poll_interval = poll_interval
        self.window_duration = window_duration
        
        self.sample_rate = 48000
        self.target_rate = 16000 # Whisper optimized
        self.max_samples = int(self.sample_rate * self.window_duration)
        self.audio_buffer = deque(maxlen=self.max_samples)
        
        self._last_full_text = ""
        self.last_committed_offset = 0.0
        self.on_words = asyncio.Queue(maxsize=100)
        self.on_duration = None 
        self.on_started = None # 🟢 Signal when API call starts
        self.on_finished = None # 🟢 Signal when API call completes (pass/fail)
        self.is_active = False
        
        # 🟢 ENERGY GATE (Section 5) — lower for tonal languages
        self._is_tonal = _is_tonal(primary_lang)
        self.energy_threshold = 200 if self._is_tonal else 500

        self._poll_task = None
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        self.is_active = True
        # Establish TCP/TLS connection immediately with robust connector
        self._session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_key}"},
            connector=aiohttp.TCPConnector(
                limit=5,
                keepalive_timeout=30,
                enable_cleanup_closed=True,
                force_close=False # Keep connection alive between polls
            ),
            timeout=aiohttp.ClientTimeout(total=8.0, connect=2.0)
        )
        
        # Force TLS handshake before any real audio arrives
        await self._prewarm_connection()
        
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info(f"WhisperPoller started and pre-warmed (Lang: {self.primary_lang})")

    async def _prewarm_connection(self):
        """Send 100ms silent audio to established TCP+TLS connection."""
        try:
            silence = bytes(3200) # 16000 * 0.1s * 2 bytes
            wav_io = self._pcm_to_wav(silence)
            
            payload = aiohttp.FormData()
            payload.add_field("file", wav_io, filename="warmup.wav", content_type="audio/wav")
            payload.add_field("model", "whisper-1")
            payload.add_field("response_format", "text")
            
            async with self._session.post("https://api.openai.com/v1/audio/transcriptions", data=payload) as resp:
                await resp.text() # Discard
                logger.info(f"WhisperPoller session pre-warmed [{resp.status}]")
        except Exception as e:
            logger.warning(f"Whisper pre-warm failed (non-fatal): {e}")

    def _pcm_to_wav(self, pcm_bytes: bytes) -> io.BytesIO:
        """Helper to wrap pcm bytes in a WAV container."""
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self.target_rate)
            wav_file.writeframes(pcm_bytes)
        wav_io.seek(0)
        return wav_io

    async def stop(self):
        self.is_active = False
        if self._poll_task:
            self._poll_task.cancel()
        if self._session:
            await self._session.close()
        logger.info("WhisperPoller stopped.")

    def feed(self, pcm_chunk: bytes):
        """Append raw PCM to rolling buffer. Synchronous — no await needed."""
        data = np.frombuffer(pcm_chunk, dtype=np.int16)
        self.audio_buffer.extend(data)

    def update_language(self, lang_code: str):
        if not lang_code: return
        self.primary_lang = lang_code
        # Update tonal language detection and energy threshold
        self._is_tonal = _is_tonal(lang_code)
        self.energy_threshold = 200 if self._is_tonal else 500
        # Reset offset on language change to prevent cross-language deduplication issues
        self.clear_buffer()
        logger.info(f"[WHISPER] Context updated: {lang_code} (tonal={self._is_tonal}, energy_threshold={self.energy_threshold})")

    def clear_buffer(self):
        """Reset the internal audio buffer and offset tracker."""
        self.reset_utterance()
        logger.info("[DIAG][WHISPER] Buffer cleared")

    def reset_utterance(self):
        self.last_committed_offset = 0.0
        self._last_full_text = ""
        self.audio_buffer.clear()
        logger.info("[DIAG][WHISPER] Utterance reset (offset=0.0)")

    async def _poll_loop(self):
        while self.is_active:
            start_time = time.time()
            try:
                await self._poll()
            except Exception as e:
                logger.error(f"Whisper poll failed: {type(e).__name__} - {e}")
                await asyncio.sleep(0.1)
                continue
            
            elapsed = time.time() - start_time
            await asyncio.sleep(max(0, self.poll_interval - elapsed))

    async def _poll(self):
        if len(self.audio_buffer) < (self.sample_rate * 0.5):
            return

        # Build numpy array from deque without intermediate list copy
        audio_data = np.array(self.audio_buffer, dtype=np.int16)

        # Energy gate — skip silent frames
        rms = np.sqrt(np.mean(audio_data.astype(np.float32) ** 2))
        if rms < self.energy_threshold:
            return

        if self.on_started:
            try:
                result = self.on_started()
                if asyncio.iscoroutine(result):
                    asyncio.create_task(result)
            except Exception as e:
                logger.warning(f"on_started callback error: {e}")

        try:
            # 48k→16k is exactly 3:1: simple decimation is 20x faster than
            # scipy.signal.resample and perceptually identical for STT.
            # Box-average 3 samples before picking every 3rd removes aliasing.
            n = (len(audio_data) // 3) * 3
            resampled_audio = audio_data[:n].reshape(-1, 3).mean(axis=1).astype(np.int16)
            
            wav_io = self._pcm_to_wav(resampled_audio.tobytes())
    
            # Whisper Request
            payload = aiohttp.FormData()
            payload.add_field("file", wav_io, filename="audio.wav", content_type="audio/wav")
            payload.add_field("model", "whisper-1")
            payload.add_field("response_format", "verbose_json")
            payload.add_field("timestamp_granularities[]", "word")
            
            # 🟢 LANGUAGE LOCKING
            if self.primary_lang:
                # 🟢 FIX #3b: Use proper ISO 639-1 code mapping instead of [:2] hack (CRITICAL BUG)
                # OLD CODE: self.primary_lang[:2].lower() failed for Chinese, Portuguese, Dutch, etc.
                iso_code = get_iso_code(self.primary_lang)
                payload.add_field("language", iso_code)
                logger.debug(f"[WHISPER] Using ISO language code: {iso_code} (from {self.primary_lang})")

            # 🟢 Yoruba/tonal: Add Whisper prompt hint for better STT accuracy
            whisper_prompt = _get_whisper_prompt(self.primary_lang)
            if whisper_prompt:
                payload.add_field("prompt", whisper_prompt)
                logger.debug(f"[WHISPER] Added tonal language prompt for {self.primary_lang}")
    
            async with self._session.post("https://api.openai.com/v1/audio/transcriptions", data=payload) as resp:
                if resp.status != 200:
                    logger.error(f"OpenAI STT Error: {resp.status}")
                    return
                
                result = await resp.json()
                words = result.get("words", [])
                
                # 🟢 WORD-LEVEL DEDUPLICATION
                new_words = []
                max_offset = self.last_committed_offset
                new_text = ""
                delta = 0.0
                
                if not words:
                    # No words with timestamps — check if full text is new
                    text = result.get('text', '').strip()
                    if not text or text == self._last_full_text:
                        return  # duplicate — skip
                    self._last_full_text = text
                    new_text = text
                else:
                    # 1. Calculate threshold with 50ms tolerance
                    threshold = self.last_committed_offset - 0.05
                    
                    for word_info in words:
                        start = float(word_info.get("start", 0.0))
                        end = float(word_info.get("end", 0.0))
                        text = word_info.get("word", "").strip()
                        
                        if not text: continue
                        
                        # 2. Only commit words that start AFTER our last committed timestamp
                        if start > threshold:
                            new_words.append(text)
                            max_offset = max(max_offset, end)
                    
                    if not new_words:
                        return # no new words since last poll
                    delta = max_offset - self.last_committed_offset
                    self.last_committed_offset = max_offset
                    new_text = " ".join(new_words).strip()
                
                if new_text:
                    await self.on_words.put(new_text)
                    logger.info(f"[DIAG][WHISPER] Emitted to queue: '{new_text[:80]}'")
                    logger.info(f"[DIAG][WHISPER] Queue size: {self.on_words.qsize()}")
                    
                    if self.on_duration and delta > 0:
                        try:
                            result = self.on_duration(delta)
                            if asyncio.iscoroutine(result):
                                asyncio.create_task(result)
                        except Exception as e:
                            logger.warning(f"on_duration callback error: {e}")
        finally:
            if self.on_finished:
                try:
                    result = self.on_finished()
                    if asyncio.iscoroutine(result):
                        asyncio.create_task(result)
                except Exception as e:
                    logger.warning(f"on_finished callback error: {e}")
