import asyncio
import logging
import json
import numpy as np
from typing import Dict, List
from livekit import rtc
from scipy.signal import resample_poly

from app.core.config import settings
from services.media_worker.vad_processor import WebRTCVADProcessor
from services.media_worker.whisper_processor import WhisperProcessor
from services.media_worker.gpt4_translator import GPT4StreamTranslator
from services.media_worker.pcm_audio_player import PCMAudioPlayer
from services.media_worker.tts_client import TTSClient
from services.media_worker.barge_in_controller import BargeInController
from services.media_worker.broadcast_audio_router import BroadcastAudioRouter
from services.media_worker.pipeline_monitor import PipelineMonitor
from app.core.language_utils import resolve_tts_voice, resolve_tts_speed

logger = logging.getLogger("broadcast_worker")

class SingleLanguageBroadcastPipeline:
    def __init__(self, target_lang: str, audio_source: rtc.AudioSource, room: rtc.Room):
        self.target_lang = target_lang
        self.audio_source = audio_source
        self.api_key = settings.OPENAI_API_KEY
        self.room = room
        
        self.gpt_queue = asyncio.Queue()
        self.monitor = PipelineMonitor()
        self.monitor.register_queue(f"gpt_{target_lang}", self.gpt_queue)
        
        self.player = PCMAudioPlayer(self.audio_source)
        self.tts = TTSClient(self.api_key, self.player, language=target_lang)
        self.translator = GPT4StreamTranslator(self.api_key)
        
        self._task = None
        self._running = False
        
    async def start(self, source_lang: str):
        self._running = True
        await self.player.start()
        self._task = asyncio.create_task(self._process_loop(source_lang))
        logger.info(f"Broadcast SingleLanguagePipeline started for {self.target_lang}")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        await self.player.stop()
        await self.tts.close()

    async def feed_text(self, text: str):
        await self.gpt_queue.put(text)

    async def _process_loop(self, source_lang: str):
        while self._running:
            try:
                text = await self.gpt_queue.get()
                if not self.monitor.health_check():
                    self.gpt_queue.task_done()
                    continue
                    
                translation = await self.translator.translate_sentence(text, source_lang, self.target_lang)
                if translation:
                    async def transcript_callback():
                        payload = {
                            "type": "transcript",
                            "text": text,
                            "translated_text": translation,
                            "language": self.target_lang,
                            "speaker": self.room.local_participant.identity or "Interpreter"
                        }
                        try:
                            msg = json.dumps(payload).encode('utf-8')
                            await self.room.local_participant.publish_data(msg, topic="transcript")
                        except Exception as e:
                            pass
                            
                    voice = resolve_tts_voice(self.target_lang)
                    speed = resolve_tts_speed(self.target_lang)
                    await self.tts.speak(translation, voice=voice, speed=speed, transcript_callback=transcript_callback)
                    
                self.gpt_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Broadcast {self.target_lang} pipeline error: {e}")

class PrecisionBroadcastPipeline:
    def __init__(self, room: rtc.Room, room_id: str, source_lang: str):
        self.room = room
        self.room_id = room_id
        self.source_lang = source_lang
        self.api_key = settings.OPENAI_API_KEY
        
        self.router = BroadcastAudioRouter(room)
        
        self.whisper_queue = asyncio.Queue()
        self.monitor = PipelineMonitor()
        self.monitor.register_queue("whisper_broadcast", self.whisper_queue)
        
        self.whisper = WhisperProcessor(source_lang, self.whisper_queue, self.api_key)
        self.barge_in = BargeInController(None, [], room) # No single player to flush in broadcast mode
        self.whisper.vad_processor.on_speech_start = self.barge_in.trigger

        self.pipelines: Dict[str, SingleLanguageBroadcastPipeline] = {}
        self._tasks = []
        self._running = False

    async def start(self):
        self._running = True
        self._tasks.append(asyncio.create_task(self._transcription_fan_out_loop()))
        logger.info("Precision Broadcast Pipeline started.")

    async def stop(self):
        self._running = False
        for t in self._tasks:
            t.cancel()
        for p in self.pipelines.values():
            await p.stop()
        await self.router.cleanup()

    async def add_language(self, target_lang: str):
        if target_lang in self.pipelines or target_lang.lower() == self.source_lang.lower():
            return
            
        source = await self.router.get_or_create_track(target_lang)
        pipeline = SingleLanguageBroadcastPipeline(target_lang, source, self.room)
        self.pipelines[target_lang] = pipeline
        await pipeline.start(self.source_lang)

    def on_audio_frame(self, frame: rtc.AudioFrame):
        if not self._running: return
        samples_48k = np.frombuffer(frame.data.tobytes(), dtype=np.int16)
        if frame.num_channels == 2:
            samples_48k = samples_48k.reshape(-1, 2).mean(axis=1).astype(np.int16)
        samples_16k = resample_poly(samples_48k.astype(np.float32), 1, 3).astype(np.int16)
        self.whisper.feed_frame(samples_16k.tobytes())

    async def _transcription_fan_out_loop(self):
        while self._running:
            try:
                text = await self.whisper_queue.get()
                if not self.monitor.health_check():
                    self.whisper_queue.task_done()
                    continue
                    
                caption_payload = json.dumps({
                    "type": "caption",
                    "text": text,
                    "language": self.source_lang,
                    "speaker": self.room.local_participant.identity or "Speaker"
                })
                try:
                    await self.room.local_participant.publish_data(caption_payload.encode('utf-8'), topic="captions")
                except: pass
                
                for p in self.pipelines.values():
                    await p.feed_text(text)
                    
                self.whisper_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Fan out loop error: {e}")

class BroadcastWorker:
    def __init__(self, api_key: str, redis, worker_id: str):
        self.api_key = api_key
        self.redis = redis
        self.worker_id = worker_id
        self.active_rooms: Dict[str, PrecisionBroadcastPipeline] = {}

    async def handle_job(self, job_data: dict, room: rtc.Room):
        room_id = job_data["room_id"]
        source_lang = job_data.get("primary_lang", "English")
        
        pipeline = PrecisionBroadcastPipeline(room, room_id, source_lang)
        self.active_rooms[room_id] = pipeline
        await pipeline.start()
        
        initial_langs = job_data.get("available_langs", "").split(",")
        for lang in initial_langs:
            if lang.strip():
                await pipeline.add_language(lang.strip())

    async def handle_language_demand(self, room_id: str, new_lang: str):
        if pipeline := self.active_rooms.get(room_id):
            await pipeline.add_language(new_lang)
