import asyncio
import logging
from typing import List
from services.media_worker.pcm_audio_player import PCMAudioPlayer
from livekit import rtc

logger = logging.getLogger(__name__)

class BargeInController:
    """
    Handles immediate interruption when the user speaks.
    Flushes the player, drops pending translation queues, 
    and signals the UI via DataChannel.
    """
    def __init__(
        self,
        player: PCMAudioPlayer,
        job_queues: List[asyncio.Queue],
        room: rtc.Room
    ):
        self.player = player
        self.job_queues = job_queues
        self.room = room
        self._barged_in = False
        
    async def trigger(self):
        """Called by VAD exactly when 90ms speech confirms."""
        if self._barged_in:
            return
            
        self._barged_in = True
        logger.info("Barge-in triggered!")

        # 1. Flush audio immediately
        await self.player.flush()

        # 2. Clear all pending Whisper/GPT queues
        for q in self.job_queues:
            while not q.empty():
                try:
                    q.get_nowait()
                    q.task_done()
                except asyncio.QueueEmpty:
                    break

        # 3. Inform clients via DataChannel to kill current bot animation
        try:
            msg = '{"type": "barge_in"}'.encode("utf-8")
            await self.room.local_participant.publish_data(
                data=msg, 
                topic="system"
            )
        except Exception as e:
            logger.error(f"Failed to publish barge_in: {e}")

    def reset(self):
        """Called after speech segment ends and translation begins."""
        self._barged_in = False
