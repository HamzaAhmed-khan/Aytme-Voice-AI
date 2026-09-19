import asyncio
import base64
import enum
import hashlib
import numpy as np
import logging
import json
import time
import uuid
import websockets
from typing import List, Optional, Dict, Any
from livekit import rtc
from livekit.protocol import room as proto_room
from app.core.hallucination_filter import HallucinationFilter
from app.core.language_utils import resolve_tts_voice, resolve_tts_speed

from app.core.config import settings
from app.core.s3 import s3_manager
import datetime
from .whisper_poller import WhisperPoller
from .sentence_buffer import SentenceBuffer
from .gpt4_translator import GPT4StreamTranslator
from .tts_streamer import OpenAITTSStreamer
# processing.py file 

_base_logger = logging.getLogger("media_processing")

class StructuredLogger:
    @staticmethod
    def _get_ts():
        import time
        return f"TS: {time.time():.3f}"

    def info(self, msg, *args, **kwargs):
        _base_logger.info(f"[{self._get_ts()}] {msg}", *args, **kwargs)

    def warning(self, msg, *args, **kwargs):
        _base_logger.warning(f"[{self._get_ts()}] {msg}", *args, **kwargs)

    def error(self, msg, *args, **kwargs):
        _base_logger.error(f"[{self._get_ts()}] {msg}", *args, **kwargs)

    def debug(self, msg, *args, **kwargs):
        _base_logger.debug(f"[{self._get_ts()}] {msg}", *args, **kwargs)

logger = StructuredLogger()

# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Context & State Machine — Zero-leakage request/response tracking
# ─────────────────────────────────────────────────────────────────────────────

class RequestType(enum.Enum):
    PREWARM = "prewarm"
    TRANSLATION = "translation"
    TEXT_INPUT = "text_input"

class ResponseState(enum.Enum):
    PENDING = "pending"
    STREAMING = "streaming"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"

class RequestContext:
    """Tags every OpenAI response with its purpose (prewarm vs translation).
    Prewarm responses are silently discarded; only translation responses produce output."""
    def __init__(self):
        self._contexts: Dict[str, RequestType] = {}
    
    def register(self, response_id: str, req_type: RequestType):
        self._contexts[response_id] = req_type
        logger.info(f"[PIPELINE] Request Type: {req_type.value} | Response ID: {response_id[:12]}")
    
    def get_type(self, response_id: str) -> RequestType:
        return self._contexts.get(response_id, RequestType.TRANSLATION)
    
    def is_translation(self, response_id: str) -> bool:
        return self.get_type(response_id) == RequestType.TRANSLATION
    
    def cleanup(self, response_id: str):
        self._contexts.pop(response_id, None)

class ResponseStateMachine:
    """Ensures only COMPLETED responses produce output via buffered streaming assembly.
    Delta chunks are accumulated; final text is assembled only on response.*.done."""
    def __init__(self):
        self._states: Dict[str, ResponseState] = {}
        self._buffers: Dict[str, str] = {}  # response_id -> accumulated text
    
    def on_created(self, response_id: str):
        self._states[response_id] = ResponseState.PENDING
        self._buffers[response_id] = ""
    
    def on_streaming(self, response_id: str, delta: str):
        self._states[response_id] = ResponseState.STREAMING
        self._buffers[response_id] = self._buffers.get(response_id, "") + delta
    
    def on_completed(self, response_id: str, final_text: str = None) -> str:
        """Returns the final assembled text. Uses explicit final_text if provided,
        otherwise returns the accumulated buffer."""
        self._states[response_id] = ResponseState.COMPLETED
        if final_text:
            return final_text
        return self._buffers.get(response_id, "")
    
    def on_cancelled(self, response_id: str):
        self._states[response_id] = ResponseState.CANCELLED
    
    def on_failed(self, response_id: str):
        self._states[response_id] = ResponseState.FAILED
    
    def is_completed(self, response_id: str) -> bool:
        return self._states.get(response_id) == ResponseState.COMPLETED
    
    def get_buffer(self, response_id: str) -> str:
        return self._buffers.get(response_id, "")
    
    def cleanup(self, response_id: str):
        self._states.pop(response_id, None)
        self._buffers.pop(response_id, None)


class JitterBuffer:
    """Section 4.3: Algorithmic RTP Reassembly and Jitter Smoothing."""
    def __init__(self, window_size: int = 20):
        self.packets = {}
        self.next_expected = None
        self.window_size = window_size

    def add(self, seq: int, payload: bytes):
        self.packets[seq] = payload
        if self.next_expected is None:
            self.next_expected = seq

    def get_ordered(self) -> List[bytes]:
        ordered = []
        while self.next_expected is not None and self.next_expected in self.packets:
            ordered.append(self.packets.pop(self.next_expected))
            self.next_expected += 1
        
        if len(self.packets) > self.window_size:
            min_seq = min(self.packets.keys())
            self.packets.pop(min_seq)
            
        return ordered

class UsageCounter:
    """Track active speech in 10s increments."""
    def __init__(self, room_id: str, redis_url: str, org_id: Optional[str] = None):
        self.room_id = room_id
        self.org_id = org_id
        self.redis_url = redis_url
        self.active_speech_ms = 0
        self.last_reported_increment = 0 # In 10s units

    async def add_speech_duration(self, duration_ms: int):
        self.active_speech_ms += duration_ms
        current_increment = self.active_speech_ms // 10000
        
        if current_increment > self.last_reported_increment:
            new_increments = current_increment - self.last_reported_increment
            self.last_reported_increment = current_increment
            await self.emit_usage(new_increments * 10)

    async def _get_redis(self):
        if not hasattr(self, '_redis') or self._redis is None:
            from redis.asyncio import from_url
            self._redis = from_url(self.redis_url)
        return self._redis

    async def emit_usage(self, seconds: int):
        try:
            redis = await self._get_redis()
            data = {
                "room_id": self.room_id,
                "event_type": "usage",
                "seconds_processed": str(seconds)
            }
            if self.org_id:
                data["org_id"] = self.org_id
            
            await redis.xadd("usage:events", data)
            logger.info(f"Emitted usage: {seconds}s for room {self.room_id} (org: {self.org_id})")
        except Exception as e:
            logger.error(f"Failed to emit usage: {e}")

class MediaProcessor:
    def __init__(self, room_id, mode="conversation", livekit_room_name=None, org_id=None):
        self.mode = mode
        self.available_langs = []
        # We ensure room_id is always a standardized string with dashes for Redis and API mapping
        self.room_id = str(room_id).strip().lower() # Standardized lowercase ID for Redis mapping consistency
        self.livekit_room_name = livekit_room_name or f"room_{self.room_id[:12]}"
        self.org_id = org_id
        self.audio_tracks = {} # lang -> track
        self.audio_sources = {} # lang -> source
        self.active_languages = set() # Set of languages currently requested by participants
        self.lk_room = rtc.Room()
        self.openai_ws = None
        self.start_time = None
        self.usage_counter = UsageCounter(room_id, settings.REDIS_URL, org_id=org_id)
        self.response_audio_buffer = bytearray()
        self.speech_start_timestamp = None
        
        self.primary_lang = None   # Set dynamically by bot_start job from room config
        self.secondary_lang = None  # Set dynamically by bot_start job from room config
        self.current_speech_intent = None # Manual override from UI intent
        self.ws_lock = asyncio.Lock()
        self.session_ready = asyncio.Event() # Gating flag for audio stream
        self.last_normalized_input = "" # For deduplication logic
        self.session_prewarmed = False # Only prewarm once per session
        self._redis = None # Persistent Redis client
        self.audio_sent_this_turn = False # track if we actually appended to buffer
        
        # Per-participant language tracking: {participant_identity: {"source": "lang", "target": "lang"}}
        self.participant_langs = {}
        
        self.openai_url = "wss://api.openai.com/v1/realtime?model=gpt-realtime"
        self.headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        }
        
        # Real-time state tracking
        self.current_ai_response_id = None
        self.current_ai_text = ""
        self.current_user_item_id = None
        self.current_user_text = ""
        self.state = "idle" # Track processor health: idle, connecting, connected, failed
        self.is_active = False  
        self.is_response_active = False # Safe cancellation state machine
        self.is_bot_speaking = False # Track if bot is currently outputting audio
        self.current_in_item_id = None
        self.current_in_text = ""
        self.current_out_item_id = None
        self.current_out_text = ""
        self.last_input_identity = "unknown" # Track who spoke last for response tagging
        self.current_mode = "A"
        self.tts_enabled = True
        
        # Bot session identity — unique per session to avoid DuplicateIdentity
        import uuid
        self.session_id = str(uuid.uuid4())
        self.bot_identity = f"bot_{self.room_id[:8]}_{uuid.uuid4().hex[:6]}"
        self._heartbeat_task = None
        self.processed_ids = set()
        self.is_processing = False
        
        self.last_ai_output_hash = ""  # Output-level dedup
        
        # --- NEW: Real-time Streaming Cascade Components ---
        self.poller: Optional[WhisperPoller] = None
        self.sentence_buffer: Optional[SentenceBuffer] = None
        self.translator: Optional[GPT4StreamTranslator] = None
        self.tts: Optional[OpenAITTSStreamer] = None
        
        # [HEAVY] Specialized Processors
        from services.media_worker.whisper_processor import WhisperProcessor
        from services.media_worker.audio_ring_buffer import ResamplingRingBuffer
        self.whisper_processor: Optional[WhisperProcessor] = None
        self.input_resampler: Optional[ResamplingRingBuffer] = None
        # Cache per-participant resamplers for frame_received callbacks
        self._frame_resamplers = {}
        self._cascade_tasks: List[asyncio.Task] = []
        
        # Status tracking for UI signaling
        self._stt_active = False
        self._translator_active = False
        self._is_speaking = False

        self._retry_count = 0  # Track retries per turn
        
        self.processing_lock = False
        self.active_response_id = None
        self.response_started_at = 0
        
        # Connection State Machine
        self.connection_state = "disconnected"
        self.audio_active = False
        self.reconnect_attempts = 0
        
        self.history_item_ids = []
        self.last_user_input_text = ""
        
        # S3 Archiving for User Raw Audio
        self.user_audio_buffers = {} # participant_identity -> bytearray

        # Hallucination Filter integration
        self.filter = HallucinationFilter()
        
        # Broadcast fan-out state
        self.active_pipelines = {} # lang -> {translator, tts, task}
        self.broadcaster_poller = None
        self._fanout_task = None

    def stop_audio_stream(self):
        """Immediately severs audio transmission and processing locks."""
        self.audio_active = False
        self.processing_lock = False

        # Latency Tracking (High Precision)
        self.last_audio_sent_at = 0.0
        self.transcript_received_at = 0.0
        self.ai_response_started_at = 0.0
        self.ai_response_completed_at = 0.0


    async def clear_previous_context(self):
        """Force complete statelessness by wiping historical items."""
        if not self.openai_ws: return
        items_to_delete = list(self.history_item_ids)
        self.history_item_ids.clear()
        
        for item_id in items_to_delete:
            try:
                await self.openai_ws.send(json.dumps({
                    "type": "conversation.item.delete",
                    "item_id": item_id
                }))
            except Exception as e:
                logger.debug(f"Failed to delete item {item_id}: {e}")

    async def cancel_previous_response(self):
        """Sever overlapping completion generations."""
        if self.openai_ws and self.active_response_id:
            try:
                await self.openai_ws.send(json.dumps({"type": "response.cancel"}))
            except Exception as e:
                logger.error(f"Failed to cancel response: {e}")

    async def _update_bot_status(self):
        """Consolidated status signal logic based on active pipeline stages."""
        if not self.lk_room or not self.lk_room.isconnected(): return
        
        status = "listening"
        if self._is_speaking:
            status = "speaking"
        elif self._stt_active or self._translator_active:
            status = "processing"
            
        await self.emit_bot_status(status)

    async def _set_stt_state(self, active: bool):
        self._stt_active = active
        await self._update_bot_status()

    async def _set_translator_state(self, active: bool):
        self._translator_active = active
        await self._update_bot_status()

    def normalize_text(self, text: str) -> str:
        """Normalize text for consistent deduplication logic (trim, lowercase, no punctuation)."""
        if not text: return ""
        import re
        text = text.strip().lower()
        return re.sub(r'[^\w\s]', '', text)

    async def get_or_publish_track(self, lang_code: str):
        """Ensure a track exists and is PUBLISHED before returning it."""
        lang_code = (lang_code or "unknown").lower()
        if lang_code in self.audio_tracks and self.audio_tracks[lang_code].sid:
            return self.audio_tracks[lang_code]
        
        logger.info(f"[VITAL] Initializing audio track for: {lang_code}")
        source = rtc.AudioSource(24000, 1)
        track = rtc.LocalAudioTrack.create_audio_track(f"translated_{lang_code}", source)
        
        self.audio_sources[lang_code] = source
        self.audio_tracks[lang_code] = track

        # Wait for Room Connection
        max_wait = 10.0
        elapsed = 0.0
        while not self.lk_room or not self.lk_room.isconnected():
            if elapsed >= max_wait:
                logger.error(f"[VITAL] Timeout waiting for room connection to publish {lang_code}")
                return track
            await asyncio.sleep(0.5)
            elapsed += 0.5

        # Publish
        options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        try:
            publication = await self.lk_room.local_participant.publish_track(track, options)
            await publication.set_metadata(json.dumps({"language": lang_code, "type": "translation"}))
            self.active_languages.add(lang_code)
            logger.info(f"[VITAL] TRACK PUBLISHED: translated_{lang_code} (SID: {publication.sid})")
        except Exception as e:
            logger.error(f"[VITAL] FAILED to publish track for {lang_code}: {e}")
        
        return track

    async def multilingual_dispatch(self, text: str, source_lang: str):
        """Translate text to all other active languages and generate TTS."""
        # If we have an explicit intent from the UI, use it as the source_lang
        actual_source = self.current_speech_intent or source_lang or self.primary_lang
        
        # Use target_lang as the primary guide.
        # [LATENCY-OPTIMIZATION] skip broadcasting to secondary_lang if it's already being handled by OpenAI Realtime session
        other_langs = [l for l in self.active_languages if l.lower() != (actual_source or "").lower() and l.lower() != (self.secondary_lang or "").lower()]
        
        if not other_langs:
            logger.debug(f"[DISPATCH] No additional languages to translate beyond real-time targets.")
            return

        for lang in other_langs:
            asyncio.create_task(self.generate_and_stream_tts(text, source_lang, lang))

    async def generate_and_stream_tts(self, text: str, source_lang: str, target_lang: str):
        """Helper to generate translation and audio for a specific language."""
        try:
            logger.info(f"Generating secondary translation: {source_lang} -> {target_lang}")
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            
            # 1. Translate
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": f"Translate to {target_lang}. Return ONLY the text."},
                    {"role": "user", "content": text}
                ]
            )
            translated = resp.choices[0].message.content.strip()
            
            # 2. Emit Caption for this target language
            await self.emit_caption(translated, is_ai=True, language=target_lang, original_text=text)

            # 3. TTS (TTS-1 is fast and produces 24kHz PCM if requested)
            tts_resp = await client.audio.speech.create(
                model="tts-1",
                voice="alloy",
                input=translated,
                response_format="pcm"
            )
            
            # 3. Stream to LiveKit
            source = self.audio_sources.get(target_lang.lower())
            if source:
                audio_data = await tts_resp.aread()
                import numpy as np
                samples = np.frombuffer(audio_data, dtype=np.int16)
                frame = rtc.AudioFrame(
                    data=samples.tobytes(), 
                    sample_rate=24000, 
                    num_channels=1, 
                    samples_per_channel=len(samples)
                )
                await source.capture_frame(frame)
                logger.debug(f"Streamed {len(samples)} samples to {target_lang} track")

        except Exception as e:
            logger.error(f"Multilingual dispatch failed for {target_lang}: {e}")

    async def _run_heartbeat(self):
        """Periodically refresh the bot:active:{room_id} key in Redis."""
        redis = await self.usage_counter._get_redis()
        heartbeat_key = f"bot:active:{self.room_id}"
        logger.info(f"Starting heartbeat for {heartbeat_key}")
        try:
            while self.lk_room and self.lk_room.isconnected():
                await redis.set(heartbeat_key, "active", ex=30)
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            logger.info(f"Heartbeat cancelled for {heartbeat_key}")
        except Exception as e:
            logger.error(f"Heartbeat error for {heartbeat_key}: {e}")
        finally:
            # Clean up on exit
            try:
                await redis.delete(heartbeat_key)
            except Exception: pass
            logger.info(f"Heartbeat stopped and cleaned up for {heartbeat_key}")

    async def connect_livekit(self):
        """Section 4.2: Real-time LiveKit Connection Logic."""
        # 0. LOG INFRASTRUCTURE IDENTITY FOR DEBUGGING
        from app.core.livekit import livekit_manager
        api_key_last_4 = str(livekit_manager.api_key)[-4:] if livekit_manager.api_key else "None"
        logger.info(f"Connecting to LiveKit: {livekit_manager.url} | API Key: ...{api_key_last_4} | Room: {self.livekit_room_name}")

        # Step 1: Evict any stale bot participants from the LiveKit room via server API.
        try:
            async with livekit_manager.get_api() as lkapi:
                response = await lkapi.room.list_participants(proto_room.ListParticipantsRequest(room=self.livekit_room_name))
                participants = response.participants if hasattr(response, 'participants') else list(response)
                eviction_tasks = []
                for p in participants:
                    if p.identity.startswith("bot_") and p.identity != self.bot_identity:
                        logger.warning(f"Queuing stale bot eviction: {p.identity}")
                        eviction_tasks.append(lkapi.room.remove_participant(
                            proto_room.RoomParticipantIdentity(
                                room=self.livekit_room_name, 
                                identity=p.identity
                            )
                        ))
                if eviction_tasks:
                    await asyncio.gather(*eviction_tasks)
        except Exception as evict_err:
            logger.warning(f"Could not evict stale bot (non-fatal): {evict_err}")


        # Step 2: Always start fresh
        if self.lk_room:
            try:
                await self.lk_room.disconnect()
            except Exception: pass
        self.lk_room = rtc.Room()
        
        # NOTE: Track publishing moved to publish_tracks_when_ready() (after room.connect)
        # Publishing before room.connect caused 10-20s timeout delays per language.

        self.start_time = asyncio.get_event_loop().time()
        bot_metadata = json.dumps({"role": "interpreter"})
        token = livekit_manager.get_token(
            self.livekit_room_name, 
            self.bot_identity, 
            metadata=bot_metadata
        )

        # Register listener BEFORE connect to avoid race condition
        @self.lk_room.on("track_subscribed")
        def on_track_subscribed(track: rtc.RemoteTrack, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            logger.warning(f"[🎤 TRACK_SUBSCRIBED] track.kind={track.kind}, participant={participant.identity}")
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                logger.info(f"[TRACK] Ignoring non-audio track")
                return
                
            identity = participant.identity
            if identity.startswith("bot_") or identity.startswith("agent_"):
                logger.info(f"[TRACK] Skipping bot audio: {identity}")
                return
            
            logger.warning(f"[🎤 TRACK] Processing audio from {identity}: {track.sid}")
            
            # Initialize per-participant language tracking
            if identity not in self.participant_langs:
                self.participant_langs[identity] = {
                    "source": self.primary_lang,
                    "target": self.secondary_lang or self.primary_lang
                }
                logger.info(f"[LANGS] Initialized languages for {identity}: source={self.participant_langs[identity]['source']}, target={self.participant_langs[identity]['target']}")
            
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.warning(f"[VITAL] Starting audio stream processing for user {identity}...")
                asyncio.create_task(self.process_audio_track(track, identity))

                # Fallback: some SDK versions emit 'frame_received' events on tracks
                # Register a lightweight handler to feed frames directly into the same
                # resampling + ring-buffer -> whisper path. Use asyncio.create_task
                # so the callback remains sync-friendly.
                try:
                    track.on("frame_received", lambda frame, id=identity: asyncio.create_task(self._on_frame_received(frame, id)))
                    logger.debug(f"[TRACK] Registered frame_received fallback for {identity}")
                except Exception as e:
                    logger.debug(f"[TRACK] Could not register frame_received fallback: {e}")

        @self.lk_room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            logger.info(f"New participant connected to LiveKit: {participant.identity}")

        @self.lk_room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            logger.info(f"Participant disconnected from LiveKit: {participant.identity}")
            # Clean up audio buffer but keep entry in langs for historical reasons
            if participant.identity in self.user_audio_buffers:
                del self.user_audio_buffers[participant.identity]
            
            # WIPE CASCADE BUFFER to prevent hallucinations from the last turn
            if self.poller:
                self.poller.clear_buffer()

        @self.lk_room.on("track_unsubscribed")
        def on_track_unsubscribed(track: rtc.RemoteTrack, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            logger.info(f"Unsubscribed from track {track.sid} from {participant.identity}")
            # Clear buffer on track unsubscribe to free memory for this turn
            if participant.identity in self.user_audio_buffers:
                # Optional: We could upload one last time if data remains
                del self.user_audio_buffers[participant.identity]

        @self.lk_room.on("track_muted")
        def on_track_muted(publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
            # The SDK might pass the participant as the publication object depending on version
            actual_participant = participant if hasattr(participant, 'identity') else getattr(publication, 'participant', None)
            if not actual_participant: return
            identity = actual_participant.identity
            if identity.startswith("bot_") or identity.startswith("agent_"): return
            if publication.kind == rtc.TrackKind.KIND_AUDIO:
                logger.warning(f"[VITAL] Microphone muted by {identity} (PTT Release). Committing Audio Buffer!")
                # Force commit ONLY — DO NOT send response.create here.
                # transcription.completed will be the SINGLE trigger for response.create,
                # preventing duplicate AI responses for the same speech turn.
                async def force_commit():
                    async with self.ws_lock:
                        if self.openai_ws:
                            try:
                                logger.info(f"[REALTIME] Forcing commit for {identity} (response.create deferred to transcription.completed)")
                                await self.openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                            except Exception as e:
                                logger.error(f"Failed to force commit: {e}")
                asyncio.create_task(force_commit())

        await self.lk_room.connect(settings.LIVEKIT_URL, token)
        logger.info(f"Bot joined LiveKit Room: {self.livekit_room_name} as {self.bot_identity}")

        # Publish Tracks ONLY AFTER OpenAI handshake succeeds to prevent silent bot issues
        async def publish_tracks_when_ready():
            try:
                await asyncio.wait_for(self.session_ready.wait(), timeout=30.0)
                logger.info("[VITAL] OpenAI Session ready! Publishing Primary and Secondary language tracks...")
                await self.get_or_publish_track(self.primary_lang)
                if self.secondary_lang:
                    await self.get_or_publish_track(self.secondary_lang)
            except asyncio.TimeoutError:
                logger.error("[FATAL] OpenAI Session never became ready. Tracks not published.")

        asyncio.create_task(publish_tracks_when_ready())

        # Check for any tracks that were already subscribed or present upon entry
        for participant in self.lk_room.remote_participants.values():
            identity = participant.identity
            logger.info(f"Bot sees existing participant: {identity}")
            if identity.startswith("bot_") or identity.startswith("agent_"): continue
            for track_pub in participant.track_publications.values():
                if track_pub.track and track_pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                    logger.info(f"Manually initiating processing for existing track: {track_pub.track.sid} from {identity}")
                    asyncio.create_task(self.process_audio_track(track_pub.track, identity))

        # [VITAL] Bot status is signalled ONLY from session.updated (after OpenAI handshake).
        # Do NOT emit here — emit_bot_status is called once in start_openai_stream → session.updated
        # to prevent duplicate 'active' signals that cause frontend double-transitions.
        logger.info(f"[SIGNAL] LiveKit connection established for {self.room_id} — awaiting OpenAI session handshake")

        # Start Redis heartbeat for API status synchronization
        self._heartbeat_task = asyncio.create_task(self._run_heartbeat())

        @self.lk_room.on("data_received")
        def on_data_received(data: rtc.DataPacket):
            try:
                payload = json.loads(data.data.decode("utf-8"))
                msg_type = payload.get("type")
                sender_id = data.participant.identity if data.participant else "unknown"
                
                if msg_type == "change_language":
                    new_lang = payload.get("language")
                    logger.info(f"Received language change request from {sender_id} to: {new_lang}")
                    self.secondary_lang = new_lang
                    self.primary_lang = payload.get("primary_lang", self.primary_lang)
                    if sender_id not in self.participant_langs:
                        self.participant_langs[sender_id] = {"source": self.primary_lang, "target": new_lang}
                    else:
                        self.participant_langs[sender_id]["target"] = new_lang
                    
                    # Refresh cascade for new language
                    logger.warning(f"[CASCADE] Refreshing pipeline for new language: {new_lang}")
                    asyncio.create_task(self.start_openai_stream())

                
                elif msg_type == "intent": # STAGE V2 PROTOCOL
                    lang = payload.get("value")
                    logger.warning(f"[INTENT] V2 Intent Received from {sender_id}: {lang}")
                    
                    self.current_speech_intent = lang
                    
                    # [BIDIRECTIONAL-LOGIC] Dynamically Swap Cascade Parameters
                    if self.poller and self.translator:
                        # Flush existing buffer to avoid mixing languages
                        if self.sentence_buffer:
                            asyncio.create_task(self.sentence_buffer.flush())

                        # Clear speculative translation cache — old translations
                        # are in the wrong language after a swap.
                        if hasattr(self, "_spec_cache") and self._spec_cache:
                            self._spec_cache.clear()

                        # CLEAN SLATE for the new language
                        self.poller.clear_buffer()

                        target_lang = (
                            self.secondary_lang
                            if lang.lower() == self.primary_lang.lower()
                            else self.primary_lang
                        )

                        self.poller.update_language(lang)
                        self.translator.update_languages(lang, target_lang)
                        logger.warning(f"[CASCADE-SWAP] STT={lang}, Translate={lang}->{target_lang}")

                    # Interrupt any active AI response for the new turn
                    if self.openai_ws and getattr(self, "is_response_active", False):
                        async def cancel_and_clear():
                            async with self.ws_lock:
                                if self.openai_ws and getattr(self, "is_response_active", False):
                                    logger.warning(f"[REALTIME] INTERRUPTING AI: New PTT turn from {sender_id}")
                                    await self.openai_ws.send(json.dumps({"type": "response.cancel"}))
                                    self.is_response_active = False
                        asyncio.create_task(cancel_and_clear())

                elif msg_type == "set_mode":
                    new_mode = payload.get("mode", self.current_mode)
                    new_tts = payload.get("tts_enabled", self.tts_enabled)
                    
                    if self.current_mode == new_mode and self.tts_enabled == new_tts:
                        return # BLOCK duplicate changes

                    logger.info(f"Received set_mode request: {payload}")

                    if self.processing_lock:
                        logger.warning("[SET_MODE] Skipping session update — active request in progress")
                        self.current_mode = new_mode
                        self.tts_enabled = new_tts
                        return

                    self.current_mode = new_mode
                    self.tts_enabled = new_tts
                    # Legacy update_openai_session removed — cascade manages its own config
                    logger.info(f"[SET_MODE] Mode={new_mode}, TTS={new_tts} — applied (cascade manages config)")
                
                elif msg_type == "text_input":
                    text = payload.get("text")
                    if text and self.openai_ws:
                        logger.info(f"Received text input: {text}")
                        # Create a chat item and request a response
                        async def send_text():
                            async with self.ws_lock:
                                if not self.openai_ws:
                                    logger.warning("OpenAI WebSocket is None, skipping text_input")
                                    return
                                # 1. Create the item
                                await self.openai_ws.send(json.dumps({
                                    "type": "conversation.item.create",
                                    "item": {
                                        "type": "message",
                                        "role": "user",
                                        "content": [{"type": "input_text", "text": text}]
                                    }
                                }))
                                # 2. Trigger response
                                await self.openai_ws.send(json.dumps({"type": "response.create"}))
                        
                        asyncio.create_task(send_text())

            except Exception as e:
                logger.error(f"Error handling data message: {e}")

    # Removed legacy update_openai_session — logic moved to cascade components.


    async def process_audio_track(self, track: rtc.RemoteTrack, identity: str):
        """Forward remote audio to WhisperPoller."""
        self.current_speaker_identity = identity
        logger.warning(f"[AUDIO] 🎤 process_audio_track START for {identity}")

        # 🟢 FIX #1: Removed blocking loop that waited for self.poller (CRITICAL BUG)
        # The talk_together pipeline uses self.whisper_processor (not self.poller)
        # Instead, we wait for whisper_processor to be initialized before feeding audio
        max_wait_attempts = 40  # 2 seconds max wait (0.05s × 40)
        wait_count = 0
        while not self.whisper_processor and wait_count < max_wait_attempts:
            await asyncio.sleep(0.05)
            wait_count += 1

        if not self.whisper_processor:
            logger.error(f"[AUDIO] ❌ WhisperProcessor never initialized after 2s, abandoning audio track for {identity}")
            return

        logger.warning(f"[AUDIO] ✓ WhisperProcessor ready after {wait_count * 50}ms")
        
        audio_stream = rtc.AudioStream(track)
        resampler = None
        current_sample_rate = 0
        frame_logs = 0
        total_bytes_fed = 0

        async for event in audio_stream:
            if not self.is_active or track.muted:
                logger.debug(f"[AUDIO] Skipping frame: is_active={self.is_active}, muted={track.muted}")
                continue

            frame = event.frame
            if resampler is None or current_sample_rate != frame.sample_rate:
                current_sample_rate = frame.sample_rate
                logger.info(f"[AUDIO] Detected sample rate: {current_sample_rate}Hz for {identity}")
                # Poller expects 48kHz for consistency, but we resample to 48kHz internally if needed
                # Actually Poller.feed expects 48kHz.
                resampler = rtc.AudioResampler(input_rate=current_sample_rate, output_rate=48000, num_channels=1)

            resampled_frames = resampler.push(frame)

            combined_data = bytearray()
            for r_frame in resampled_frames:
                combined_data.extend(r_frame.data)

            total_bytes_fed += len(combined_data)

            if self.whisper_processor and combined_data:
                # Downsample this frame only: 48k→16k via 3:1 box-filter decimation.
                # This feeds ONLY new audio each frame — fixes the previous bug where
                # read_last(total_seconds) re-fed the entire accumulated buffer to VAD
                # on every 10ms frame, causing duplicate speech-segment emissions.
                frame_48k = np.frombuffer(bytes(combined_data), dtype=np.int16)
                n = (len(frame_48k) // 3) * 3
                if n > 0:
                    frame_16k = frame_48k[:n].reshape(-1, 3).mean(axis=1).astype(np.int16)
                    self.whisper_processor.feed_frame(frame_16k.tobytes())

            # Feed 48 kHz audio to WhisperPoller for speculative mid-speech polling.
            # feed() is synchronous — call directly, no task creation needed.
            if self.poller:
                self.poller.feed(bytes(combined_data))

            frame_logs += 1
            if frame_logs % 100 == 0:
                logger.info(f"[AUDIO] Fed {frame_logs} frames ({total_bytes_fed} bytes) to Whisper for {identity}")
        
        logger.warning(f"[AUDIO] 🛑 Audio stream ended for {identity} (total frames: {frame_logs}, bytes: {total_bytes_fed})")

    async def _on_frame_received(self, frame, identity: str):
        """Fallback frame handler for track.on('frame_received').
        Resamples incoming frames to 48k, writes into the 16k ring buffer,
        and forwards to the WhisperProcessor. This mirrors the logic in
        process_audio_track so either path can trigger transcription.
        """
        try:
            if not self.is_active:
                return

            if not self.whisper_processor:
                logger.debug(f"[AUDIO_CB] WhisperProcessor not ready for {identity}")
                return

            # Determine input sample rate (fallback to 48000)
            sample_rate = getattr(frame, 'sample_rate', None) or getattr(frame, 'sampleRate', None) or 48000

            # Per-identity resampler cache
            resampler = self._frame_resamplers.get(identity)
            if resampler is None or getattr(resampler, 'input_rate', None) != sample_rate:
                try:
                    resampler = rtc.AudioResampler(input_rate=sample_rate, output_rate=48000, num_channels=1)
                    self._frame_resamplers[identity] = resampler
                    logger.debug(f"[AUDIO_CB] Created resampler for {identity} (in={sample_rate}Hz)")
                except Exception as e:
                    logger.error(f"[AUDIO_CB] Failed to create resampler: {e}")
                    return

            # Push frame(s) through the resampler
            try:
                resampled_frames = resampler.push(frame)
            except Exception as e:
                logger.error(f"[AUDIO_CB] Resampler push failed for {identity}: {e}")
                return

            combined = bytearray()
            for r_frame in resampled_frames:
                combined.extend(r_frame.data)

            # Direct per-frame 48k→16k decimation — same fix as process_audio_track.
            try:
                frame_48k = np.frombuffer(bytes(combined), dtype=np.int16)
                n = (len(frame_48k) // 3) * 3
                if n > 0:
                    frame_16k = frame_48k[:n].reshape(-1, 3).mean(axis=1).astype(np.int16)
                    self.whisper_processor.feed_frame(frame_16k.tobytes())
                    logger.debug(f"[AUDIO_CB] Fed {len(frame_16k)} 16k samples from {identity} to Whisper")
            except Exception as e:
                logger.error(f"[AUDIO_CB] Failed to feed whisper for {identity}: {e}")

        except Exception as e:
            logger.error(f"[AUDIO_CB] Unexpected error in frame_received handler for {identity}: {e}")


    async def start_openai_stream(self):
        """
        Initializes or refreshes the Streaming Pipeline.
        Links Poller -> Buffer -> Translator -> TTS in parallel loops.
        """
        if self.mode == "conversation":
            # Conversation mode uses the same cascade pipeline as talk_together
            logger.info(f"[PROCESSOR] Starting conversation pipeline for {self.room_id}")
            await self._start_talk_together_pipeline()
            return

        # Close existing cascade if refreshing
        if self._cascade_tasks:
            logger.warning("[CASCADE] Refreshing pipeline — stopping old tasks.")
            for t in self._cascade_tasks: t.cancel()
            
        if self.mode == "broadcast":
            return await self._start_broadcast_pipeline()
            
        # Default: Talk Together or standard AI mode
        logger.info(f"[CASCADE] Initializing Talk Together Pipeline for {self.room_id}")
        await self._start_talk_together_pipeline()

    async def _start_broadcast_pipeline(self):
        """Broadcast Mode: VAD input -> Multi-target fan-out."""
        from services.media_worker.whisper_processor import WhisperProcessor
        logger.info(f"[VITAL] Starting Broadcast VAD monitor for room {self.room_id}")
        
        self.whisper_out_queue = asyncio.Queue()
        self.whisper_processor = WhisperProcessor(
            language=self.primary_lang or "en",
            output_queue=self.whisper_out_queue,
            api_key=settings.OPENAI_API_KEY
        )
        
        await self.whisper_processor.start()
        self.sentence_buffer = SentenceBuffer(max_words=8, flush_timeout=1.0)
        await self.sentence_buffer.start()
        
        # VAD -> Buffer loop (Broadcast)
        async def WhisperToBuffer():
            while self.is_active:
                text = await self.whisper_out_queue.get()
                logger.info(f"[VITAL] BROADCAST_WHISPER: '{text[:80]}'")
                await self.sentence_buffer.process_text(text)
        
        self._cascade_tasks.append(asyncio.create_task(WhisperToBuffer()))
        self._fanout_task = asyncio.create_task(self._monitor_broadcast_demand())

    async def _monitor_broadcast_demand(self):
        """Watch Redis for language demand and spin up translation pipelines."""
        redis = await self.usage_counter._get_redis()
        demand_key = f"broadcast:demand:{self.room_id}"
        
        while self.is_active:
            try:
                # 1. Get demand from Redis
                demand = await redis.hgetall(demand_key)
                for lang, count in demand.items():
                    lang = lang.decode("utf-8") if isinstance(lang, bytes) else lang
                    if int(count) > 0 and lang not in self.active_pipelines:
                        logger.info(f"[BROADCAST] Spinning up translation pipeline for: {lang}")
                        await self._create_translation_pipeline(lang)
                
                # 2. Report stats
                stats = {
                    "active_listeners": sum(int(c) for c in demand.values()),
                    "pipelines": list(self.active_pipelines.keys())
                }
                await redis.set(f"broadcast:stats:{self.room_id}", json.dumps(stats), ex=60)
                
                # 3. Handle broadcaster speech -> Multi-dispatch
                while not self.sentence_buffer.on_sentences.empty():
                    sentence = await self.sentence_buffer.on_sentences.get()
                    # Emit original caption
                    asyncio.create_task(self.emit_caption(sentence, is_ai=False, language=self.primary_lang))
                    
                    # Dispatch to all active pipelines
                    for lang, pipe in self.active_pipelines.items():
                        # Track translation activity globally for status
                        asyncio.create_task(pipe["translator"].translate_sentence(sentence))
                
                await asyncio.sleep(2) # Poll demand every 2s
            except Exception as e:
                logger.error(f"[BROADCAST] Fan-out monitor error: {e}")
                await asyncio.sleep(5)

    async def _create_translation_pipeline(self, target_lang: str):
        """Create a dedicated Translator -> TTS -> LiveKit chain for a language."""
        translator = GPT4StreamTranslator(settings.OPENAI_API_KEY, self.primary_lang or "en", target_lang)
        tts = OpenAITTSStreamer(
            settings.OPENAI_API_KEY,
            voice=settings.TTS_DEFAULT_VOICE,
            speed=settings.TTS_DEFAULT_SPEED,
            language=target_lang,
        )
        
        # Use standard trackers for broadcast too
        translator.on_started = lambda: self._set_translator_state(True)
        translator.on_finished = lambda: self._set_translator_state(False)
        translator.on_transcript = self._send_transcript_to_datachannel
        
        # Parallel pre-warm for on-demand broadcast pipelines
        await asyncio.gather(translator.start(), tts.start(), return_exceptions=True)
        
        async def TranslatorToTTS():
            while self.is_active:
                phrase = await translator.on_tokens.get()
                if phrase == "END_OF_SEGMENT":
                    continue
                logger.info(f"[DIAG][GPT4] Pushing broadcast phrase to TTS: '{phrase[:80]}'")
                voice = resolve_tts_voice(target_lang)
                speed = resolve_tts_speed(target_lang)
                await tts.feed_token(phrase, voice=voice, speed=speed)

        async def TTSToLiveKit():
            while self.is_active:
                try:
                    # Detect start/end of speech burst
                    pcm_chunk = await asyncio.wait_for(tts.pcm_queue.get(), timeout=1.5 if self._is_speaking else None)
                    
                    if not self._is_speaking:
                        self._is_speaking = True
                        asyncio.create_task(self._update_bot_status())

                    source = await self.get_or_publish_track(target_lang)
                    samples = np.frombuffer(pcm_chunk, dtype=np.int16)
                    frame = rtc.AudioFrame(data=samples.tobytes(), sample_rate=24000, num_channels=1, samples_per_channel=len(samples))
                    if target_lang.lower() in self.audio_sources:
                        await self.audio_sources[target_lang.lower()].capture_frame(frame)
                except asyncio.TimeoutError:
                    if self._is_speaking:
                        self._is_speaking = False
                        asyncio.create_task(self._update_bot_status())

        self.active_pipelines[target_lang] = {
            "translator": translator,
            "tts": tts,
            "tasks": [asyncio.create_task(TranslatorToTTS()), asyncio.create_task(TTSToLiveKit())]
        }

    async def _start_talk_together_pipeline(self):
        """
        Talk Together Mode: VAD-driven real-time translation with speculative
        pre-translation.

        Pipeline:
          WhisperPoller (500 ms polls during speech)
            → PollerToSpecCache: accumulates words, fires background GPT-4
              translations, cancelling the previous in-flight one each time.
          WhisperProcessor (fires on speech end — authoritative transcript)
            → WhisperToTTS: looks up the speculative cache first.
              Cache HIT  → TTS starts immediately (<100 ms from mic release).
              Cache MISS → single fresh GPT-4 call (~200-400 ms). Rare.
          TTS PCM queue → TTSToLiveKit (unchanged).
        """
        from services.media_worker.whisper_processor import WhisperProcessor
        from services.media_worker.whisper_poller import WhisperPoller
        from services.media_worker.speculative_translation_cache import SpeculativeTranslationCache

        logger.warning(f"[LANG-TRACE] Pipeline init: primary={self.primary_lang}, secondary={self.secondary_lang}")

        effective_primary = self.primary_lang or "English"
        effective_secondary = self.secondary_lang or "Spanish"

        # 1. WhisperProcessor — VAD-driven, fires on speech END (authoritative).
        self.whisper_out_queue = asyncio.Queue()
        self.whisper_processor = WhisperProcessor(
            language=effective_primary,
            output_queue=self.whisper_out_queue,
            api_key=settings.OPENAI_API_KEY,
        )
        logger.warning(f"[LANG-TRACE] WhisperProcessor language={effective_primary}")

        # 2. WhisperPoller — rolling 500 ms window, fires DURING speech.
        self.poller = WhisperPoller(
            api_key=settings.OPENAI_API_KEY,
            primary_lang=effective_primary,
            poll_interval=0.5,
            window_duration=3.0,
        )

        # 3. Speculative translation cache.
        spec_cache = SpeculativeTranslationCache()
        self._spec_cache = spec_cache  # Keep ref for language-change clearing.

        # 4. Translator (raw_translate used by speculative cache; translate_sentence
        #    kept for broadcast compatibility and language-swap handler).
        self.translator = GPT4StreamTranslator(
            settings.OPENAI_API_KEY, effective_primary, effective_secondary
        )
        self.translator.on_started = lambda: self._set_translator_state(True)
        self.translator.on_finished = lambda: self._set_translator_state(False)
        self.translator.on_transcript = self._send_transcript_to_datachannel
        logger.warning(f"[LANG-TRACE] Translator: {effective_primary} → {effective_secondary}")

        # 5. TTS streamer.
        self.tts = OpenAITTSStreamer(
            settings.OPENAI_API_KEY,
            voice=settings.TTS_DEFAULT_VOICE,
            speed=settings.TTS_DEFAULT_SPEED,
            language=effective_secondary,
        )

        # 6. SentenceBuffer kept for language-swap handler compatibility only.
        self.sentence_buffer = SentenceBuffer(max_words=3, flush_timeout=0.5)

        # Pre-warm all components in parallel.
        logger.info("[VITAL] Pre-warming AI components...")
        await asyncio.gather(
            self.whisper_processor.start(),
            self.poller.start(),
            self.sentence_buffer.start(),
            self.translator.start(),
            self.tts.start(),
            return_exceptions=True,
        )

        self.connection_state = "connected"
        self.session_ready.set()
        asyncio.create_task(self._update_bot_status())

        # Shared list accumulates words from WhisperPoller into a running
        # transcript. Cleared by WhisperToTTS on each utterance commit.
        accumulated_words = []

        # ── Cascade coroutines ────────────────────────────────────────────────

        async def PollerToSpecCache():
            """
            Reads incremental NEW words from WhisperPoller every ~500 ms.
            Builds a growing running transcript and fires a speculative GPT-4
            translation for each version, cancelling the previous in-flight
            one (it is stale — superseded by the longer transcript).
            """
            logger.info("[SPECULATIVE] PollerToSpecCache started")
            while self.is_active:
                try:
                    new_words_text = await asyncio.wait_for(
                        self.poller.on_words.get(), timeout=1.5
                    )
                    accumulated_words.extend(new_words_text.strip().split())
                    full_transcript = " ".join(accumulated_words)

                    current_src = self.translator.source_lang
                    current_tgt = self.translator.target_lang

                    async def _speculative_fn(
                        t: str, src=current_src, tgt=current_tgt
                    ) -> str:
                        return await self.translator.raw_translate(t, src, tgt)

                    await spec_cache.submit_partial(full_transcript, _speculative_fn)
                    logger.debug(f"[SPECULATIVE] Submitted: '{full_transcript[:60]}'")

                except asyncio.TimeoutError:
                    pass  # No new words — keep waiting.
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"[SPECULATIVE] PollerToSpecCache error: {e}")

        async def WhisperToTTS():
            """
            Reads the authoritative final transcript from WhisperProcessor.
            Clears the accumulated word list (next utterance starts fresh).
            Checks the speculative cache:
              HIT  → translation already waiting, feed to TTS immediately.
              MISS → fire one GPT-4 call and await it (rare).
            Bypasses SentenceBuffer entirely — no buffering delay.
            """
            logger.info("[SPECULATIVE] WhisperToTTS started")
            while self.is_active:
                try:
                    text = await self.whisper_out_queue.get()
                    logger.info(f"[VITAL] WHISPER_FINAL: '{text[:80]}'")
                    logger.info(
                        f"[LANG-TRACE] STT ({self.whisper_processor.language}): '{text[:60]}'"
                    )

                    # Clear accumulated words so PollerToSpecCache starts fresh for
                    # the NEXT utterance. Do NOT call spec_cache.reset_utterance() yet —
                    # the in-flight speculative task may be translating exactly this text.
                    # Calling reset_utterance() here would cancel it, forcing a redundant
                    # fresh GPT-4 call and adding 200-500ms latency on every utterance.
                    accumulated_words.clear()

                    asyncio.create_task(self._emit_partial_caption(text))

                    current_src = self.translator.source_lang
                    current_tgt = self.translator.target_lang
                    caption_lang = (
                        self.current_speech_intent or current_src or self.primary_lang
                    )

                    asyncio.create_task(
                        self.emit_caption(text, is_ai=False, language=caption_lang)
                    )
                    logger.warning(
                        f"[LANG-TRACE] WhisperToTTS: '{text[:40]}' | {current_src} → {current_tgt}"
                    )

                    asyncio.create_task(self._set_translator_state(True))

                    async def _translate_fn(
                        t: str, src=current_src, tgt=current_tgt
                    ) -> str:
                        return await self.translator.raw_translate(t, src, tgt)

                    translation = await spec_cache.get_or_translate(text, _translate_fn)

                    # Reset utterance state NOW — after we have the translation.
                    # Any new speculative tasks spawned by PollerToSpecCache for the
                    # next utterance are safe to cancel at this point.
                    spec_cache.reset_utterance()

                    asyncio.create_task(self._set_translator_state(False))

                    if not translation:
                        logger.info(f"[SPECULATIVE] No translation for '{text[:60]}' — skip")
                        continue

                    logger.warning(
                        f"[LANG-TRACE] Translation → {current_tgt}: '{translation[:60]}'"
                    )

                    self.translator._last_source_text = text

                    voice = resolve_tts_voice(current_tgt)
                    speed = resolve_tts_speed(current_tgt)

                    asyncio.create_task(
                        self._send_transcript_to_datachannel(text, translation)
                    )
                    asyncio.create_task(
                        self.emit_caption(translation, is_ai=True, language=current_tgt)
                    )
                    asyncio.create_task(
                        self._persist_transcript_and_audio(
                            source_text=text,
                            translated_text=translation,
                            target_lang=current_tgt,
                        )
                    )

                    # Feed translation to TTS immediately.
                    await self.tts.feed_token(translation, voice=voice, speed=speed)
                    logger.info(f"[SPECULATIVE] Fed to TTS: '{translation[:60]}'")

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"[WhisperToTTS] Unhandled error — pipeline continues: {e}", exc_info=True)

        async def TTSToLiveKit():
            """Reads PCM from TTS queue and publishes via PCMAudioPlayer (20 ms frames)."""
            from services.media_worker.pcm_audio_player import PCMAudioPlayer
            player = None
            player_lang = None
            total_bytes_published = 0
            chunk_count = 0

            while self.is_active:
                try:
                    pcm_chunk = await asyncio.wait_for(
                        self.tts.pcm_queue.get(),
                        timeout=2.0 if self._is_speaking else None,
                    )

                    if not self._is_speaking:
                        self._is_speaking = True
                        asyncio.create_task(self._update_bot_status())
                        total_bytes_published = 0
                        chunk_count = 0
                        target_for_log = getattr(
                            self.translator, "target_lang", self.secondary_lang
                        )
                        logger.warning(
                            f"[LANG-TRACE] TTS→LiveKit: burst starting → '{target_for_log}'"
                        )

                    target_lang = getattr(
                        self.translator, "target_lang", self.secondary_lang
                    )

                    if player is None or player_lang != target_lang.lower():
                        await self.get_or_publish_track(target_lang)
                        source = self.audio_sources.get(target_lang.lower())
                        if not source:
                            logger.error(f"[TTS→LK] No AudioSource for {target_lang}")
                            continue
                        player = PCMAudioPlayer(source)
                        await player.start()
                        player_lang = target_lang.lower()
                        logger.info(f"[TTS→LK] PCMAudioPlayer started for '{target_lang}'")

                    await player.push(pcm_chunk)
                    total_bytes_published += len(pcm_chunk)
                    chunk_count += 1

                    if chunk_count % 10 == 1:
                        logger.info(
                            f"[TTS→LK] Streaming: {total_bytes_published}B "
                            f"({chunk_count} chunks) → {target_lang}"
                        )

                except asyncio.TimeoutError:
                    if self._is_speaking:
                        self._is_speaking = False
                        asyncio.create_task(self._update_bot_status())
                        if total_bytes_published > 0:
                            logger.info(
                                f"[TTS→LK] Burst complete: {total_bytes_published}B → {player_lang}"
                            )
                except Exception as e:
                    logger.error(f"[TTS→LK] Error: {e}")
                    await asyncio.sleep(0.1)

        self._cascade_tasks = [
            asyncio.create_task(PollerToSpecCache()),
            asyncio.create_task(WhisperToTTS()),
            asyncio.create_task(TTSToLiveKit()),
        ]
        logger.info(f"[VITAL] SPECULATIVE PIPELINE LAUNCHED (Room: {self.room_id})")

    async def _send_transcript_to_datachannel(self, source_text: str, translated_text: str):
        """Dispatches a combined transcript packet to the LiveKit DataChannel."""
        if not self.lk_room or not self.lk_room.local_participant:
            return

        try:
            # 🟢 FIX #2: Include source_lang and target_lang so frontend knows the direction
            current_source = getattr(self.translator, 'source_lang', self.primary_lang) if self.translator else self.primary_lang
            current_target = getattr(self.translator, 'target_lang', self.secondary_lang) if self.translator else self.secondary_lang
            
            logger.info(f"[DIAG][DC] Emitting transcript ({current_source}→{current_target}): '{source_text[:40]}' -> '{translated_text[:40]}'")
            payload = {
                "type": "transcript",
                "id": str(uuid.uuid4()),
                "text": source_text,
                "translated_text": translated_text,
                "source_lang": current_source or "unknown",
                "target_lang": current_target or "unknown",
                "speaker": "AI Interpreter",
                "is_ai": True,
                "timestamp": time.time()
            }
            await self.lk_room.local_participant.publish_data(json.dumps(payload).encode("utf-8"))
        except Exception as e:
            logger.error(f"[DIAG][DC] Failed to emit transcript: {e}")

    async def _emit_partial_caption(self, text: str):
        """Emit partial/live STT text to frontend for foggy caption display."""
        if not self.lk_room or not self.lk_room.local_participant or not text:
            return
        try:
            payload = {
                "type": "stt:partial",
                "text": text,
                "speaker": self.last_input_identity or "Speaker",
                "language": self.current_speech_intent or self.primary_lang or "unknown",
                "timestamp": time.time()
            }
            await self.lk_room.local_participant.publish_data(json.dumps(payload).encode("utf-8"))
        except Exception as e:
            logger.debug(f"[DC] Partial caption emit failed: {e}")

    async def _persist_transcript_and_audio(self, source_text: str, translated_text: str, target_lang: str):
        """Persist transcript + TTS audio artifact to PostgreSQL (non-blocking).
        Uses DATABASE_URL from env file — works universally across any deployment."""
        if not source_text or not translated_text:
            return

        try:
            from app.models.models import Transcript, TTSArtifact
            from openai import AsyncOpenAI
            import io

            # 1. Generate TTS MP3 for storage
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            voice = resolve_tts_voice(target_lang)
            speed = resolve_tts_speed(target_lang)
            tts_resp = await client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=translated_text,
                response_format="mp3",
                speed=speed
            )
            mp3_bytes = await tts_resp.aread()
            duration_ms = int(len(mp3_bytes) / 4000 * 1000)

            # 2. Use persistent engine — avoids 200-500ms connection pool spin-up per call
            async_session = _get_transcript_session_maker()

            async with async_session() as session:
                async with session.begin():
                    transcript = Transcript(
                        room_id=uuid.UUID(str(self.room_id)) if self.room_id else uuid.uuid4(),
                        speaker_identity=getattr(self, 'current_speaker_identity', 'unknown'),
                        is_ai=True,
                        source_lang=self.primary_lang or 'en',
                        target_lang=target_lang or self.secondary_lang or 'es',
                        text_raw=source_text,
                        text_translated=translated_text,
                        start_ms=int(time.time() * 1000),
                        end_ms=int(time.time() * 1000) + duration_ms,
                        is_final=True,
                        session_id=getattr(self, 'session_id', None),
                        tts_duration_ms=duration_ms,
                        sample_rate=24000
                    )
                    session.add(transcript)
                    await session.flush()

                    fingerprint = hashlib.sha256(
                        f"{translated_text}:{target_lang}:{voice}".encode()
                    ).hexdigest()

                    artifact = TTSArtifact(
                        fingerprint=fingerprint,
                        transcript_id=transcript.id,
                        room_id=uuid.UUID(str(self.room_id)) if self.room_id else None,
                        voice_id=voice,
                        language=target_lang or 'unknown',
                        audio_format="mp3",
                        audio_data=mp3_bytes,
                        sample_rate=24000,
                        duration_ms=duration_ms,
                        size_bytes=len(mp3_bytes)
                    )
                    session.add(artifact)

            logger.info(f"[DB] Persisted transcript + TTS artifact ({len(mp3_bytes)}B MP3) for room {self.room_id}")

        except Exception as e:
            # Non-fatal — persistence failure must never break the real-time pipeline
            logger.warning(f"[DB] Persistence failed (non-fatal): {e}")
        
    async def stop(self):
        """Cleanup all cascade components and stop tasks."""
        self.is_active = False
        if self.whisper_processor: await self.whisper_processor.stop()
        if self.sentence_buffer: await self.sentence_buffer.stop()
        if self.tts: await self.tts.stop()
        
        for task in self._cascade_tasks:
            task.cancel()
        
        if self._heartbeat_task: self._heartbeat_task.cancel()
        if self.lk_room: await self.lk_room.disconnect()
        self.connection_state = "disconnected"


    # Removed legacy handle_openai_event and associated turn-based logic.
    # Flow is now managed by the 4-stage streaming cascade.


    async def emit_caption(self, text: str, is_ai: bool = False, id: Optional[str] = None, original_text: Optional[str] = None, speaker_identity: Optional[str] = None, language: Optional[str] = None, **kwargs):
        """Standardized caption delivery with optimized Redis persistence."""
        if not self.lk_room or not self.lk_room.local_participant:
            return
        
        caption_id = id or str(uuid.uuid4())
        speaker_id = speaker_identity or getattr(self, "last_input_identity", "unknown")
        lang = language or (self.secondary_lang if is_ai else (self.current_speech_intent or self.primary_lang))
        speaker_name = "AI Voice" if is_ai else speaker_id

        try:
            # 1. Dispatch to Room DATA canal for UI display (V2 expects 'transcript')
            await self.lk_room.local_participant.publish_data(
                json.dumps({
                    "type": "transcript",
                    "id": caption_id,
                    "text": text,
                    "speaker": speaker_name,
                    "speaker_id": speaker_id,
                    "is_ai": is_ai,
                    "language": lang,
                    "is_final": kwargs.get('is_final', True),
                    "original_text": original_text,
                    "timestamp": asyncio.get_event_loop().time()
                }).encode("utf-8")
            )

            # 2. Persist to Redis via shared client
            if self._redis is None:
                from redis.asyncio import from_url
                self._redis = from_url(settings.REDIS_URL)

            event_data = {
                "room_id": str(self.room_id),
                "event_type": "transcript",
                "transcript_id": str(caption_id),
                "text": str(text),
                "text_original": str(original_text or ""),
                "is_ai": "true" if is_ai else "false",
                "speaker": str(speaker_name),
                "speaker_identity": str(speaker_id),
                "source_lang": str(lang or "unknown"),
                "target_lang": str((self.secondary_lang if not is_ai else self.primary_lang) or "unknown"),
                "session_id": str(self.session_id),
                "is_final": "true" if kwargs.get('is_final', True) else "false"
            }
            await self._redis.xadd("usage:events", event_data)
            
        except Exception as e:
            logger.error(f"Failed to emit caption: {e}")

    # Removed legacy handle_openai_event and its associated turn-based sub-logic.
    # The system now uses the parallel streaming cascade (Poller -> Buffer -> Translator -> TTS).


    async def upload_raw_user_audio(self, identity: str, audio_data: bytes):
        """Standardized S3 archiving for raw user speech input."""
        try:
            from io import BytesIO
            from pydub import AudioSegment
            
            def create_mp3():
                audio = AudioSegment(
                    data=audio_data,
                    sample_width=2,
                    frame_rate=24000,
                    channels=1
                )
                mp3_io = BytesIO()
                audio.export(mp3_io, format="mp3", bitrate="64k")
                mp3_io.seek(0)
                return mp3_io.read()

            mp3_bytes = await asyncio.to_thread(create_mp3)
            ts = int(asyncio.get_event_loop().time())
            key = f"archives/{self.room_id}/{identity}_{ts}.mp3"
            
            url = None
            try:
                url = await asyncio.to_thread(lambda: s3_manager.upload_fileobj(mp3_bytes, key))
            except Exception as s3_err:
                logger.error(f"[S3-ERROR] Raw audio archiving failed: {s3_err}")

            if url:
                logger.info(f"[ARCHIVE] Raw user audio saved: {url}")
                # Optional: Record in Redis usage events if needed
            
        except Exception as e:
            logger.error(f"Raw audio archiving failed for {identity}: {e}")

    async def emit_bot_status(self, state: str):
        """Proactively broadcast the bot's operational state to the room to force UI transitions."""
        if not self.lk_room or not self.lk_room.isconnected(): return
        try:
            payload = json.dumps({
                "type": "bot_status",
                "status": state,
                "bot_id": self.bot_identity,
                "timestamp": int(asyncio.get_event_loop().time())
            }).encode("utf-8")
            await self.lk_room.local_participant.publish_data(payload)
            logger.info(f"[SIGNAL] Broadcasted bot_status: {state}")
        except Exception as e:
            logger.warning(f"[SIGNAL] Failed to broadcast bot_status: {e}")

processor_manager = {} # Map room_id to processor

# ── Persistent DB engine for transcript persistence ───────────────────────────
# Created once at module level; creating a new engine per call adds 200-500ms
# of connection-pool spin-up overhead on every speech turn.
_transcript_engine = None
_transcript_session_maker = None

def _get_transcript_session_maker():
    global _transcript_engine, _transcript_session_maker
    if _transcript_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker as _sessionmaker
        _transcript_engine = create_async_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            pool_size=3,
            max_overflow=5,
        )
        _transcript_session_maker = _sessionmaker(
            _transcript_engine, class_=AsyncSession, expire_on_commit=False
        )
    return _transcript_session_maker
