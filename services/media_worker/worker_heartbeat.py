import asyncio
import logging
import json

# Try importing the standard redis client
try:
    from redis import asyncio as aioredis
except ImportError:
    import aioredis

logger = logging.getLogger(__name__)

class WorkerHeartbeat:
    """
    Maintains a TTL lock in Redis showing this worker is actively handling a room.
    If the worker crashes, the TTL expires, and the API can re-queue the room.
    """

    HEARTBEAT_INTERVAL_SEC = 5.0
    TTL_SEC = 15

    def __init__(self, room_id: str, redis_url: str):
        self.room_id = room_id
        # Depending on redis version, this might vary. We fallback safely.
        try:
            self.redis = aioredis.from_url(redis_url, decode_responses=True)
        except AttributeError:
            import redis.asyncio as redis_async
            self.redis = redis_async.from_url(redis_url, decode_responses=True)
            
        self._running = False
        self._task = None

    async def start(self, participant_sid: str):
        self._running = True
        # Set initial state
        state = {
            "status": "active",
            "participant_sid": participant_sid
        }
        await self.redis.set(f"room_worker:{self.room_id}", json.dumps(state), ex=self.TTL_SEC)
        
        self._task = asyncio.create_task(self._heartbeat_loop(state))
        logger.info(f"Worker heartbeat started for room {self.room_id}")

    async def _heartbeat_loop(self, state: dict):
        while self._running:
            await asyncio.sleep(self.HEARTBEAT_INTERVAL_SEC)
            try:
                await self.redis.set(f"room_worker:{self.room_id}", json.dumps(state), ex=self.TTL_SEC)
            except Exception as e:
                logger.error(f"Failed to update heartbeat: {e}")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        try:
            # Clean exit -> remove the key immediately
            await self.redis.delete(f"room_worker:{self.room_id}")
            # Close connection if supported
            if hasattr(self.redis, 'aclose'):
                await self.redis.aclose()
            elif hasattr(self.redis, 'close'):
                await self.redis.close()
        except Exception:
            pass
