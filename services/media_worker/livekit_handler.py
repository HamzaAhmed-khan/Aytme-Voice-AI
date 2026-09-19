import logging
from livekit import rtc
import asyncio
from app.core.config import settings
# livekit_handler.py
logger = logging.getLogger("livekit_handler")

class LiveKitHandler:
    def __init__(self, room_name: str, token: str):
        self.room_name = room_name
        self.token = token
        self.room = rtc.Room()

    async def connect(self):
        try:
            await self.room.connect(settings.LIVEKIT_URL, self.token)
            logger.info(f"Connected to room: {self.room_name}")
            
            @self.room.on("track_subscribed")
            def on_track_subscribed(track: rtc.RemoteTrack, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
                if track.kind == rtc.TrackKind.KIND_AUDIO:
                    logger.info(f"Subscribed to audio track from {participant.identity}")
                    # Logic to stream audio to OpenAI Realtime/ASR pipeline goes here
                    
        except Exception as e:
            logger.error(f"Failed to connect to LiveKit: {e}")

    async def disconnect(self):
        await self.room.disconnect()
        logger.info(f"Disconnected from room: {self.room_name}")
