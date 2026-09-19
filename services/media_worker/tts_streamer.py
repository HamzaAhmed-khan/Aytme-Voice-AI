import asyncio
import logging
import aiohttp
from typing import Optional, List

logger = logging.getLogger("tts_streamer")

# Yoruba detection for conditional preprocessing
_YORUBA_CODES = {'yo', 'yoruba'}

def _is_yoruba(lang_code: str) -> bool:
    return (lang_code or '').lower().strip() in _YORUBA_CODES

class OpenAITTSStreamer:
    """
    Streams OpenAI TTS-1 output as raw PCM to LiveKit.
    Buffers tokens into phrases and supports cancellation for barge-in.
    """
    def __init__(self, api_key: str, voice: str = "alloy", speed: float = 0.9, track_name: str = "ai-voice", language: str = None):
        self.api_key = api_key
        self.voice = voice
        self.speed = speed
        self.track_name = track_name # 🟢 Support for named tracks in broadcast fan-out
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
        self.language = language  # Target language context for Yoruba preprocessing
        self._is_yoruba = _is_yoruba(language) if language else False
        self._tts_model = "tts-1-hd" if self._is_yoruba else "tts-1"
        
        self.is_active = False
        self._current_request_task: Optional[asyncio.Task] = None
        self.token_buffer: List[str] = []
        self.phrase_threshold = 15 # Flush after N tokens if no punctuation found
        
        # Consumer-producer pattern for phrases
        self.input_queue = asyncio.Queue(maxsize=100)
        self.pcm_queue = asyncio.Queue(maxsize=100)
        self._session: Optional[aiohttp.ClientSession] = None
        self._stream_loop_task: Optional[asyncio.Task] = None

    async def start(self):
        self.is_active = True
        self._session = aiohttp.ClientSession(headers=self.headers)
        self._stream_loop_task = asyncio.create_task(self._stream_loop())
        await self._prewarm_tts()
        logger.info(f"OpenAITTSStreamer started (Track: {self.track_name}, Voice: {self.voice})")

    async def _prewarm_tts(self):
        """Send a minimal utterance to OpenAI to establish TCP+TLS connection."""
        try:
            url = "https://api.openai.com/v1/audio/speech"
            payload = {
                "model": self._tts_model,
                "voice": self.voice,
                "input": ".", # Minimal input
                "response_format": "pcm",
                "speed": self.speed
            }
            async with self._session.post(url, json=payload, timeout=5) as resp:
                await resp.read() # Discard
                logger.info(f"TTS connection pre-warmed successfully [{resp.status}]")
        except Exception as e:
            logger.warning(f"TTS pre-warm failed (non-fatal): {e}")

    async def stop(self):
        self.is_active = False
        if self._stream_loop_task:
            self._stream_loop_task.cancel()
        await self.cancel()
        if self._session:
            await self._session.close()
        logger.info(f"OpenAITTSStreamer stopped ({self.track_name})")

    async def cancel(self):
        """Aborts the in-flight TTS request for barge-in or stop."""
        if self._current_request_task and not self._current_request_task.done():
            # logger.warning(f"Barge-in on {self.track_name}: Cancelling in-flight TTS.")
            self._current_request_task.cancel()
            try:
                await self._current_request_task
            except asyncio.CancelledError:
                pass
        
        # Clear out any pending PCM (audio dump)
        while not self.pcm_queue.empty():
            self.pcm_queue.get_nowait()
        
        while not self.input_queue.empty():
            self.input_queue.get_nowait()
        
        self.token_buffer = []

    async def feed_token(self, token: str, voice: Optional[str] = None, speed: Optional[float] = None):
        """Put the full phrase or token into the input queue."""
        if not token or not token.strip():
            return
        
        # In current cascade, token is usually already a full phrase from GPT-4
        if token == "END_OF_SEGMENT":
            return

        logger.info(f"[DIAG][TTS] Received in queue: '{token[:80]}'")
        await self.input_queue.put({
            "text": token,
            "voice": voice or self.voice,
            "speed": self.speed if speed is None else speed,
        })

    async def _stream_loop(self):
        """Continuously pulls phrases from input_queue and generates audio."""
        logger.info("[DIAG][TTS] Loop started")
        while self.is_active:
            try:
                item = await self.input_queue.get()
                if not item or not self.is_active: 
                    continue

                if isinstance(item, dict):
                    phrase = item.get("text")
                    voice = item.get("voice", self.voice)
                    speed = item.get("speed", self.speed)
                else:
                    phrase = item
                    voice = self.voice
                    speed = self.speed

                if not phrase:
                    continue
                
                # Start a new streaming request
                await self._stream_phrase(phrase, voice=voice, speed=speed)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[TTS] Error in stream loop: {e}")
                await asyncio.sleep(0.1)

    async def _stream_phrase(self, text: str, voice: Optional[str] = None, speed: Optional[float] = None):
        """Calls OpenAI TTS and feeds the shared pcm_queue."""
        # Yoruba accent preprocessing: modify text before TTS if target is Yoruba.
        # Intensity "high" enables all rules: th→d/t, H-drop, -ing drop,
        # contraction expansion, pacing pauses, emphasis, vowel elongation.
        actual_text = text
        if self._is_yoruba:
            try:
                from services.api.core.yoruba_accent_preprocess import yoruba_accent_preprocess
                result = yoruba_accent_preprocess(text, intensity="high", debug=True)
                actual_text = result["output"]
                logger.info(f"[TTS][YORUBA] Preprocessed ({result['intensity']}): "
                            f"'{text[:60]}' → '{actual_text[:60]}'")
            except Exception as e:
                logger.warning(f"[TTS] Yoruba preprocess failed (using original): {e}")
                actual_text = text

        # Log exact text hitting the TTS API for debugging.
        logger.info(f"[TTS] TTS API INPUT: '{actual_text[:100]}'")
        
        url = "https://api.openai.com/v1/audio/speech"
        payload = {
            "model": self._tts_model,
            "voice": voice or self.voice,
            "input": actual_text,
            "response_format": "pcm", # Raw 16-bit PCM @ 24kHz
            "speed": self.speed if speed is None else speed
        }

        try:
            if not self._session or self._session.closed:
                logger.warning("[VITAL] TTS Session closed. Re-opening...")
                self._session = aiohttp.ClientSession(headers=self.headers)

            async with self._session.post(url, json=payload, timeout=6) as resp:
                if resp.status != 200:
                    err_text = await resp.text()
                    logger.error(f"[VITAL] TTS API ERROR {resp.status}: {err_text}")
                    return

                total_bytes = 0
                # Smaller chunks = faster first-byte delivery to LiveKit
                async for chunk in resp.content.iter_chunked(2048):
                    if not self.is_active: break
                    total_bytes += len(chunk)
                    await self.pcm_queue.put(chunk)
                
                logger.info(f"[VITAL] TTS_AUDIO_READY: Generated {total_bytes} bytes for phrase.")
                        
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"[VITAL] TTS Streaming CRITICAL FAILURE: {e}")
