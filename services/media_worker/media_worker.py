import asyncio
import logging
from livekit import rtc
import json
import numpy as np
from scipy.signal import resample_poly

from app.core.config import settings
from services.media_worker.vad_processor import WebRTCVADProcessor
from services.media_worker.whisper_processor import WhisperProcessor
from services.media_worker.hallucination_filter import HallucinationFilter
from services.media_worker.gpt4_translator import GPT4StreamTranslator
from services.media_worker.pcm_audio_player import PCMAudioPlayer
from services.media_worker.tts_client import TTSClient
from services.media_worker.barge_in_controller import BargeInController
from services.media_worker.echo_suppression import EchoSuppressionGate
from services.media_worker.worker_heartbeat import WorkerHeartbeat
from services.media_worker.pipeline_monitor import PipelineMonitor
from app.core.language_utils import resolve_tts_voice, resolve_tts_speed

logger = logging.getLogger(__name__)

class PrecisionMediaWorker:
    """
    Zero-compromise orchestrator for a single translation pipeline.
    Links: LiveKit Track -> Resample -> VAD -> Whisper -> GPT-4 -> TTS -> LiveKit AudioSource
    """
    def __init__(self, room: rtc.Room, room_id: str, source_lang: str, target_lang: str):
        self.room = room
        self.room_id = room_id
        self.source_lang = source_lang
        self.target_lang = target_lang
        
        self.api_key = settings.OPENAI_API_KEY
        self.queues = {
            "whisper": asyncio.Queue(),
            "gpt": asyncio.Queue(),
        }
        
        self.monitor = PipelineMonitor()
        for name, q in self.queues.items():
            self.monitor.register_queue(name, q)

        self.heartbeat = WorkerHeartbeat(room_id, settings.REDIS_URL)
        self.echo_gate = EchoSuppressionGate()
        
        self.lk_source = rtc.AudioSource(24000, 1)
        self.player = PCMAudioPlayer(self.lk_source)
        self.tts = TTSClient(self.api_key, self.player, language=target_lang)
        
        self.barge_in = BargeInController(self.player, list(self.queues.values()), room)
        
        self.whisper = WhisperProcessor(source_lang, self.queues["whisper"], self.api_key)
        self.translator = GPT4StreamTranslator(self.api_key)
        
        self.whisper.vad_processor.on_speech_start = self.barge_in.trigger

        self._tasks = []
        self._running = False

    async def start(self):
        self._running = True
        
        out_track = rtc.LocalAudioTrack.create_audio_track("translated", self.lk_source)
        options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        await self.room.local_participant.publish_track(out_track, options)
        
        await self.heartbeat.start(self.room.local_participant.sid)
        await self.player.start()
        
        self._tasks = [
            asyncio.create_task(self._process_whisper_queue()),
            asyncio.create_task(self._process_gpt_queue())
        ]
        logger.info("Precision pipeline started.")

    async def stop(self):
        self._running = False
        for t in self._tasks:
            t.cancel()
        await self.heartbeat.stop()
        await self.player.stop()
        await self.tts.close()
        logger.info("Precision pipeline stopped.")

    def on_audio_frame(self, frame: rtc.AudioFrame):
        if not self._running:
            return
            
        if not self.echo_gate.is_mic_open():
            return

        # Decode LiveKit PCM frame (48kHz)
        samples_48k = np.frombuffer(frame.data.tobytes(), dtype=np.int16)
        
        # Stereo to mono if needed
        if frame.num_channels == 2:
            try:
                samples_48k = samples_48k.reshape(-1, 2).mean(axis=1).astype(np.int16)
            except ValueError:
                pass
            
        # Resample 48kHz -> 16kHz
        samples_16k = resample_poly(samples_48k.astype(np.float32), 1, 3).astype(np.int16)
        
        # VAD processor handles chunking exactly to 30ms internally
        self.whisper.feed_frame(samples_16k.tobytes())

    async def _process_whisper_queue(self):
        while self._running:
            try:
                text = await self.queues["whisper"].get()
                if not self.monitor.health_check():
                    self.queues["whisper"].task_done()
                    continue
                    
                translation = await self.translator.translate_sentence(text, self.source_lang, self.target_lang)
                if translation:
                    await self.queues["gpt"].put((text, translation))
                    
                self.queues["whisper"].task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Whisper queue error: {e}")

    async def _process_gpt_queue(self):
        while self._running:
            try:
                source_text, translation = await self.queues["gpt"].get()
                self.barge_in.reset()
                
                async def transcript_callback():
                    payload = {
                        "type": "transcript",
                        "text": source_text,
                        "translated_text": translation,
                        "language": self.target_lang,
                        "speaker": self.room.local_participant.identity or "You"
                    }
                    try:
                        msg = json.dumps(payload).encode('utf-8')
                        logger.info(f"[PUBLISH] Publishing transcript: {source_text[:50]}")
                        await self.room.local_participant.publish_data(msg, topic="transcript")
                        logger.info(f"[PUBLISH] ✓ Transcript published successfully")
                    except Exception as e:
                        logger.error(f"❌ Failed to publish transcript: {e}", exc_info=True)
                
                # Speak uses TTSClient -> PCMAudioPlayer
                voice = resolve_tts_voice(self.target_lang)
                speed = resolve_tts_speed(self.target_lang)
                await self.tts.speak(translation, voice=voice, speed=speed, transcript_callback=transcript_callback)
                self.queues["gpt"].task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"GPT queue error: {e}")
