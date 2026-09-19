import asyncio
import json
import logging
import os
import signal
import time
import uuid
from typing import Dict, Optional

from livekit import rtc
from redis.asyncio import Redis

from app.core.config import settings
from services.media_worker.broadcast_worker import BroadcastWorker
from services.media_worker.processing import MediaProcessor # Keep for legacy/regular mode if needed

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("media_worker")

class MediaWorker:
    def __init__(self):
        self.worker_id = f"worker-{socket.gethostname()}-{uuid.uuid4().hex[:8]}" if 'socket' in globals() else f"worker-{uuid.uuid4().hex[:8]}"
        self.redis: Optional[Redis] = None
        self.is_active = False
        self.broadcast_worker: Optional[BroadcastWorker] = None
        self.active_rooms = {} # room_id -> (Processor, LKRoom)

    async def start(self):
        self.is_active = True
        self.redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.broadcast_worker = BroadcastWorker(settings.OPENAI_API_KEY, self.redis, self.worker_id)
        
        # Signal Handlers (Linux/Docker only — Windows uses KeyboardInterrupt)
        try:
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(sig, lambda: asyncio.create_task(self.stop()))
        except NotImplementedError:
            logger.info("Signal handlers not supported on this OS (Windows) — using KeyboardInterrupt")

        logger.info(f"AYTME Media Worker started (ID: {self.worker_id})")
        await self._worker_loop()

    async def stop(self):
        self.is_active = False
        logger.info("Stopping worker...")
        if self.redis:
            await self.redis.close()

    async def _worker_loop(self):
        """Main job poller via Redis Streams."""
        last_job_id = "$"
        while self.is_active:
            try:
                # Polling for new jobs and language demands
                jobs = await self.redis.xread({"worker:jobs": last_job_id}, count=1, block=1000)
                if not jobs:
                    continue

                for stream_name, events in jobs:
                    for job_id, job_data in events:
                        last_job_id = job_id
                        await self._process_job(job_data)
                        
            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                await asyncio.sleep(1)

    async def _process_job(self, job_data: dict):
        job_type = job_data.get("type")
        room_id = job_data.get("room_id")
        
        if job_type == "language_demand":
            # 🟢 BROADCAST: Handle dynamic language demand
            if self.broadcast_worker:
                await self.broadcast_worker.handle_language_demand(room_id, job_data["new_lang"])
            return

        if job_type == "bot_start":
            mode = job_data.get("mode", "conversation")
            lk_room_name = job_data.get("livekit_room_id", room_id)
            
            logger.info(f"[BOT_START] Initiating bot for room {room_id} in {mode} mode")
            
            # Connect to LiveKit
            token = self._generate_bot_token(lk_room_name)
            room = rtc.Room()
            
            # 🟢 ECHO SUPPRESSION: Setup track subscription logic BEFORE connecting
            @room.on("track_subscribed")
            def on_track_subscribed(track: rtc.RemoteTrack, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
                if track.kind != rtc.TrackKind.KIND_AUDIO:
                    return
                
                # Logic: Sub only to Broadcaster (Mode 3)
                if mode == "broadcast":
                    # In broadcast mode, the broadcaster usually has a specific identity/role
                    # We can also pass broadcaster_sid in job_data
                    target_sid = job_data.get("broadcaster_sid")
                    if target_sid and participant.sid != target_sid:
                        logger.info(f"Broadcast: Ignoring audio from non-broadcaster {participant.identity}")
                        return
                
                # Push audio to appropriate pipeline
                if mode == "broadcast" and room_id in self.broadcast_worker.active_rooms:
                    pipeline = self.broadcast_worker.active_rooms[room_id]
                    track.on("frame_received", lambda frame: asyncio.create_task(pipeline.poller.feed(frame.buffer)))

            try:
                await room.connect(settings.LIVEKIT_URL, token)
                logger.info(f"Bot joined room {lk_room_name} (Mode: {mode})")
                
                if mode == "broadcast":
                    await self.broadcast_worker.handle_job(job_data, room)
                else:
                    # Conversation mode: MediaProcessor manages its own LiveKit connection
                    # Disconnect the pre-connected room — MediaProcessor will reconnect with its own identity
                    await room.disconnect()
                    
                    processor = MediaProcessor(
                        room_id=room_id,
                        mode=mode,
                        livekit_room_name=lk_room_name,
                        org_id=job_data.get("org_id")
                    )
                    processor.primary_lang = job_data.get("primary_lang", "English")
                    processor.secondary_lang = job_data.get("secondary_lang", "Spanish")
                    processor.is_active = True
                    
                    logger.info(f"[LANG-TRACE] MediaWorker → Processor: primary={processor.primary_lang}, secondary={processor.secondary_lang}, mode={mode}")
                    
                    self.active_rooms[room_id] = processor
                    
                    # connect_livekit handles bot identity, track publishing, heartbeat
                    await processor.connect_livekit()
                    # start_openai_stream initializes the translation pipeline
                    await processor.start_openai_stream()
                    
                    # Keep processor alive until room disconnects
                    while processor.is_active and processor.lk_room and processor.lk_room.isconnected():
                        await asyncio.sleep(2)
                    
            except Exception as e:
                logger.error(f"Failed to join room {lk_room_name}: {e}")

    def _generate_bot_token(self, room_name: str) -> str:
        # Use existing server-side token generation logic
        from app.core.livekit import livekit_manager
        return livekit_manager.get_token(room_name, f"bot-{self.worker_id}")

if __name__ == "__main__":
    import socket
    worker = MediaWorker()
    asyncio.run(worker.start())
