import aiohttp
import asyncio
import logging
from typing import AsyncGenerator
from services.media_worker.pcm_audio_player import PCMAudioPlayer

logger = logging.getLogger(__name__)

# Yoruba detection for conditional preprocessing
_YORUBA_CODES = {'yo', 'yoruba'}

def _is_yoruba(lang_code: str) -> bool:
    return (lang_code or '').lower().strip() in _YORUBA_CODES


class TTSClient:
    """
    Persistent connection TTS client.
    Streams 24kHz PCM chunks directly into PCMAudioPlayer.

    Supports Yoruba accent preprocessing and conditional tts-1-hd model
    when target language is Yoruba.
    """

    def __init__(self, api_key: str, player: PCMAudioPlayer, language: str = None):
        self.api_key = api_key
        self.player = player
        self.language = language
        self._is_yoruba = _is_yoruba(language) if language else False
        self._tts_model = "tts-1-hd" if self._is_yoruba else "tts-1"
        self._session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=aiohttp.ClientTimeout(total=30.0, connect=2.0)
        )

    async def close(self):
        await self._session.close()

    async def speak(self, text: str, voice: str, speed: float = None, transcript_callback=None):
        """
        Request TTS and stream blocks. The first block will trigger transcript_callback
        so that transcript pops exactly when audio begins playing.
        """
        if not text.strip():
            return

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

        payload = {
            "model": self._tts_model,
            "input": actual_text,
            "voice": voice,
            "response_format": "pcm" # Returns raw 24kHz 16-bit mono PCM
        }
        if speed is not None:
            payload["speed"] = speed

        try:
            async with self._session.post(
                "https://api.openai.com/v1/audio/speech",
                json=payload
            ) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    logger.error(f"TTS Error {resp.status}: {err}")
                    return

                first_chunk = True
                async for chunk in resp.content.iter_chunked(4096):
                    if first_chunk:
                        # Push first chunk WITH the transcript callback
                        await self.player.push_with_transcript(chunk, transcript_callback)
                        first_chunk = False
                    else:
                        await self.player.push(chunk)

                # Push 50ms silence between phrases for natural pacing
                silence_bytes = bytes(int(24000 * 2 * 0.05))
                await self.player.push(silence_bytes)

        except Exception as e:
            logger.error(f"TTS streaming failed: {e}")
