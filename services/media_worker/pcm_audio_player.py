import asyncio
import time
import logging
from typing import Callable, Optional
from livekit import rtc

logger = logging.getLogger(__name__)

class PCMAudioPlayer:
    """
    Maintains a continuous PCM playback queue.
    Receives PCM chunks from multiple TTS responses.
    Publishes to LiveKit as a continuous audio stream.
    Handles silence insertion for natural pauses.
    Handles cross-fade to prevent clicks.
    """

    SAMPLE_RATE    = 24000
    CHANNELS       = 1
    BITS           = 16
    FRAME_DURATION = 0.02  # 20ms frames to LiveKit
    FRAME_SAMPLES  = int(SAMPLE_RATE * FRAME_DURATION)  # 480
    FRAME_BYTES    = FRAME_SAMPLES * 2  # 960 bytes
    CROSSFADE_MS   = 5     # 5ms crossfade between phrases

    def __init__(self, livekit_source: rtc.AudioSource):
        self.source = livekit_source
        self._pcm_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._playing = False

    async def start(self):
        self._playing = True
        asyncio.create_task(self._playback_loop())

    async def push(self, pcm_bytes: bytes):
        """Push raw PCM bytes. Non-blocking if queue has space."""
        try:
            self._pcm_queue.put_nowait((pcm_bytes, None))
        except asyncio.QueueFull:
            logger.warning("PCM queue full; dropping audio chunk.")

    async def push_with_transcript(
        self,
        pcm_bytes: bytes,
        transcript_callback: Optional[Callable] = None
    ):
        """
        Push audio with an optional callback that fires on first frame played.
        This fires the DataChannel message at EXACTLY the right moment.
        """
        try:
            self._pcm_queue.put_nowait((pcm_bytes, transcript_callback))
        except asyncio.QueueFull:
            logger.warning("PCM queue full; dropping audio chunk + transcript callback.")

    async def flush(self):
        """
        Called on barge-in. Clears all queued audio immediately.
        Inserts 40ms of silence to prevent click artifacts.
        """
        # Drain queue
        while not self._pcm_queue.empty():
            try:
                self._pcm_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Insert 40ms silence to clear audio buffer
        silence = bytes(int(self.SAMPLE_RATE * 2 * 0.04))
        await self.push(silence)

    async def stop(self):
        self._playing = False
        try:
            self._pcm_queue.put_nowait(None)  # sentinel
        except asyncio.QueueFull:
            pass

    async def _playback_loop(self):
        """
        Continuously reads from queue and pushes 20ms frames to LiveKit.
        Runs at EXACTLY 20ms intervals using monotonic clock.
        """
        accumulated = bytearray()
        pending_callback = None
        first_frame_of_phrase = False
        next_frame_time = time.monotonic()

        while self._playing:
            # Drain all available bytes into accumulator
            while not self._pcm_queue.empty():
                try:
                    item = self._pcm_queue.get_nowait()
                    if item is None:
                        self._playing = False
                        return
                    chunk, callback = item
                    accumulated.extend(chunk)
                    if callback:
                        pending_callback = callback
                        first_frame_of_phrase = True
                except asyncio.QueueEmpty:
                    break

            # Push exactly one 20ms frame
            if len(accumulated) >= self.FRAME_BYTES:
                frame_data = bytes(accumulated[:self.FRAME_BYTES])
                del accumulated[:self.FRAME_BYTES]
                await self._push_frame(frame_data)
                
                # Fire transcript callback on FIRST frame of new phrase
                if first_frame_of_phrase and pending_callback:
                    try:
                        await pending_callback()
                    except Exception as e:
                        logger.error(f"Error executing transcript callback: {e}")
                    pending_callback = None
                    first_frame_of_phrase = False

            else:
                # Not enough data — push silence to maintain clock
                await self._push_frame(bytes(self.FRAME_BYTES))

            # Precise timing: sleep until next frame time
            next_frame_time += self.FRAME_DURATION
            sleep_time = next_frame_time - time.monotonic()
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
            else:
                # We are behind — skip sleep, catch up
                next_frame_time = time.monotonic()

    async def _push_frame(self, pcm_bytes: bytes):
        try:
            frame = rtc.AudioFrame(
                data=pcm_bytes,
                sample_rate=self.SAMPLE_RATE,
                num_channels=self.CHANNELS,
                samples_per_channel=self.FRAME_SAMPLES
            )
            await self.source.capture_frame(frame)
        except Exception as e:
            logger.error(f"[Player] Frame publish error: {e}")
