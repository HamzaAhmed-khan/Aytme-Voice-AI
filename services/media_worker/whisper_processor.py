import io
import wave
import aiohttp
import asyncio
import numpy as np
import logging
from typing import Optional

logger = logging.getLogger(__name__)

from services.media_worker.language_iso_mapper import get_iso_code
from services.media_worker.hallucination_filter import HallucinationFilter

_hf = HallucinationFilter()  # singleton — avoid per-call object construction

# ─── Tonal language detection for Yoruba-aware thresholds ───
_TONAL_LANGUAGES = {'yo', 'yoruba', 'ig', 'igbo', 'ha', 'hausa', 'am', 'amharic', 'zu', 'zulu'}

def _is_tonal(lang_code: str) -> bool:
    return (lang_code or '').lower().strip() in _TONAL_LANGUAGES

def _get_whisper_prompt(lang_code: str) -> Optional[str]:
    """Return a Whisper prompt hint for tonal/complex languages to improve STT accuracy."""
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
    if code in ('am', 'amharic'):
        return "This is Amharic speech. Amharic uses the Ge'ez script."
    if code in ('zu', 'zulu'):
        return "This is Zulu speech. Zulu is a Bantu language with click consonants."
    return None


class WhisperProcessor:
    """
    Event-driven: only calls Whisper when VAD confirms speech segment.
    No polling loop. No sliding window. No deduplication needed.

    Tonal language support: Lower RMS threshold, longer timeout,
    and shorter min duration for Yoruba and similar languages.
    """

    # ─── Standard thresholds ───
    MIN_DURATION_MS = 200   # catch shorter phrases (was 300ms)
    MAX_DURATION_MS = 6000  # aligned with VAD force-split (was 15s)
    RMS_THRESHOLD   = 300   # RMS energy gate
    WHISPER_TIMEOUT = 4.0   # seconds

    # ─── Tonal language thresholds (Yoruba, Igbo, etc.) ───
    TONAL_MIN_DURATION_MS = 120   # Yoruba words can be very short tonal syllables
    TONAL_RMS_THRESHOLD   = 150   # Lower threshold — tonal speech may have softer onsets
    TONAL_WHISPER_TIMEOUT = 6.0   # Longer timeout — tonal language STT takes more time

    def __init__(self, language: str, output_queue: asyncio.Queue, api_key: str):
        self.language = language
        self.output_queue = output_queue
        self.api_key = api_key
        self._is_tonal = _is_tonal(language)

        # Select thresholds based on language type
        if self._is_tonal:
            self._min_duration = self.TONAL_MIN_DURATION_MS
            self._rms_threshold = self.TONAL_RMS_THRESHOLD
            self._whisper_timeout = self.TONAL_WHISPER_TIMEOUT
            logger.info(f"[WHISPER] Tonal mode: min_dur={self._min_duration}ms, rms={self._rms_threshold}, timeout={self._whisper_timeout}s")
        else:
            self._min_duration = self.MIN_DURATION_MS
            self._rms_threshold = self.RMS_THRESHOLD
            self._whisper_timeout = self.WHISPER_TIMEOUT

        # Inner-module import to avoid circular dependency
        from services.media_worker.vad_processor import WebRTCVADProcessor
        self.vad_processor = WebRTCVADProcessor(
            aggressiveness=3, # Higher aggressiveness for real-time
            on_speech_segment=self._on_speech_segment,
            on_speech_start=None, # Fixed: on_speech_start was undefined
            language=language  # Pass language for tonal-aware VAD
        )
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        if not self._session:
            self._session = aiohttp.ClientSession()
        logger.info("[VITAL] WhisperProcessor started.")

    async def stop(self):
        if self._session:
            await self._session.close()
            self._session = None
        logger.info("[VITAL] WhisperProcessor stopped.")

    def feed_frame(self, pcm_16k_mono: bytes):
        """
        Feed 16kHz mono PCM bytes.
        Called from on_audio_frame (non-blocking).
        """
        self.vad_processor.feed(pcm_16k_mono)

    def update_language(self, language: str):
        """Update language and recalculate thresholds + VAD settings."""
        self.language = language
        self._is_tonal = _is_tonal(language)
        if self._is_tonal:
            self._min_duration = self.TONAL_MIN_DURATION_MS
            self._rms_threshold = self.TONAL_RMS_THRESHOLD
            self._whisper_timeout = self.TONAL_WHISPER_TIMEOUT
        else:
            self._min_duration = self.MIN_DURATION_MS
            self._rms_threshold = self.RMS_THRESHOLD
            self._whisper_timeout = self.WHISPER_TIMEOUT
        # Propagate to VAD
        self.vad_processor.update_language(language)
        logger.info(f"[WHISPER] Language updated to {language} (tonal={self._is_tonal})")

    async def _on_speech_segment(self, pcm: bytes, duration_ms: int):
        """Called by VAD when a speech segment completes."""

        if duration_ms < self._min_duration:
            logger.debug(f"[VAD] Skipping short segment: {duration_ms}ms (min={self._min_duration}ms)")
            return

        # RMS energy gate as secondary check
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
        rms = np.sqrt(np.mean(samples ** 2))
        if rms < self._rms_threshold:
            logger.debug(f"[VAD] Skipping low-energy segment: rms={rms:.0f} (threshold={self._rms_threshold})")
            return

        logger.info(f"[WHISPER] Speech segment detected: {duration_ms}ms, RMS={rms:.0f}, tonal={self._is_tonal}")
        
        # Encode as WAV for Whisper
        wav_bytes = self._pcm_to_wav(pcm)

        # Call Whisper
        text = await self._transcribe(wav_bytes)
        if text:
            logger.info(f"[WHISPER] ✓ Transcribed: '{text}'")
            discard, reason = _hf.should_discard_whisper(text, is_tonal=self._is_tonal)
            if discard:
                logger.debug(f"[WHISPER] Hallucination filter discarded: '{text}' [{reason}]")
                return

            await self.output_queue.put(text)
            logger.info(f"[WHISPER] → Added to queue. Queue size: {self.output_queue.qsize()}")
        else:
            logger.warning(f"[WHISPER] ✗ Transcription returned empty/None")

    def _pcm_to_wav(self, pcm: bytes) -> io.BytesIO:
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(pcm)
        buf.seek(0)
        return buf

    async def _transcribe(self, wav_buf: io.BytesIO) -> Optional[str]:
        try:
            if not self._session:
                self._session = aiohttp.ClientSession()
            
            session = self._session
            form = aiohttp.FormData()
            form.add_field(
                'file', wav_buf,
                filename='speech.wav',
                content_type='audio/wav'
            )
            form.add_field('model', 'whisper-1')
            if self.language:
                # 🟢 FIX #3a: Use proper ISO 639-1 code mapping instead of [:2] hack (CRITICAL BUG)
                # OLD CODE: self.language[:2].lower() failed for Chinese (ch->zh), Portuguese (po->pt), etc.
                iso_code = get_iso_code(self.language)
                form.add_field('language', iso_code)
                logger.debug(f"[WHISPER] Using ISO language code: {iso_code} (from {self.language})")

            # 🟢 Yoruba/tonal: Add Whisper prompt hint for better STT accuracy
            whisper_prompt = _get_whisper_prompt(self.language)
            if whisper_prompt:
                form.add_field('prompt', whisper_prompt)
                logger.debug(f"[WHISPER] Added tonal language prompt for {self.language}")

            form.add_field('response_format', 'text')

            async with session.post(
                'https://api.openai.com/v1/audio/transcriptions',
                headers={'Authorization': f'Bearer {self.api_key}'},
                data=form,
                timeout=aiohttp.ClientTimeout(total=self._whisper_timeout)
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error(f"Whisper error {resp.status}: {body}")
                    return None
                text = (await resp.text()).strip()
                return text if text else None

        except asyncio.TimeoutError:
            logger.warning(f"Whisper transcription timed out ({self._whisper_timeout}s)")
            return None
        except Exception as e:
            logger.error(f"Whisper error: {e}")
            return None
