from redis.asyncio import Redis, from_url # type: ignore
from typing import List, Optional, Union, Any
from app.core.config import settings # type: ignore
import logging

logger = logging.getLogger("redis_manager")

class RedisMock:
    """A simple in-memory mock for Redis for local development without Docker."""
    def __init__(self):
        self.data = {}
        self.streams = {}

    async def get(self, key): return self.data.get(key)
    async def set(self, key, value, **kwargs): self.data[key] = value; return True
    async def delete(self, *keys):
        count = 0
        for key in keys:
            if key in self.data:
                self.data.pop(key)
                count += 1
            if key in self.streams:
                self.streams.pop(key)
                count += 1
        return count
    
    async def keys(self, pattern="*"):
        import fnmatch
        all_keys = list(self.data.keys()) + list(self.streams.keys())
        return [k for k in all_keys if fnmatch.fnmatch(k, pattern)]
    
    async def incr(self, key): 
        val = int(self.data.get(key, 0)) + 1
        self.data[key] = str(val)
        return val
    async def expire(self, key, seconds): return True
    async def ping(self): return True
    async def exists(self, *keys):
        count = 0
        for key in keys:
            if key in self.data or key in self.streams:
                count += 1
        return count
    async def hset(self, name, key=None, value=None, mapping=None):
        if name not in self.data or not isinstance(self.data[name], dict):
            self.data[name] = {}
        if key is not None:
            self.data[name][key] = value
        if mapping:
            self.data[name].update(mapping)
        return 1
    async def hget(self, name, key): return self.data.get(name, {}).get(key)
    async def hgetall(self, name): return self.data.get(name, {})
    
    # Sorted Set Mocking (For Rate Limiting)
    async def zadd(self, key, mapping, **kwargs):
        if key not in self.data or not isinstance(self.data[key], list):
            self.data[key] = []
        added = 0
        for member, score in mapping.items():
            # Update score if member already exists (Redis semantics: no duplicates)
            for i, (m, _) in enumerate(self.data[key]):
                if m == member:
                    self.data[key][i] = (member, score)
                    break
            else:
                self.data[key].append((member, score))
                added += 1
        return added

    async def zremrangebyscore(self, key, min_score, max_score):
        if key not in self.data or not isinstance(self.data[key], list):
            return 0
        original_len = len(self.data[key])
        self.data[key] = [item for item in self.data[key] if not (min_score <= item[1] <= max_score)]
        return original_len - len(self.data[key])

    async def zcard(self, key):
        if key in self.data and isinstance(self.data[key], list):
            return len(self.data[key])
        return 0

    async def xadd(self, name, fields, **kwargs):
        if name not in self.streams: self.streams[name] = []
        self.streams[name].append(fields)
        return "1-0"
    async def xreadgroup(self, group, consumer, streams, **kwargs): return []
    async def xack(self, name, group, *ids): return True
    async def xgroup_create(self, *args, **kwargs): return True
    async def close(self): pass
    async def eval(self, *args, **kwargs): return 1

class RedisManager:
    def __init__(self, settings):
        self.url = settings.REDIS_URL
        self.redis: Optional[Union[Redis, RedisMock]] = None
        self._emulated = settings.EMULATE_STORAGE

    async def get_client(self) -> Redis:
        if self.redis is None:
            if self._emulated:
                logger.info("Initializing Redis Mock (EMULATE_STORAGE=true)")
                self.redis = RedisMock()
                return self.redis

            try:
                # Mask password for logging
                masked_url = self.url
                if "@" in self.url:
                    parts = self.url.split("@")
                    auth = parts[0].split("://")
                    if len(auth) > 1:
                        masked_url = f"{auth[0]}://****:****@{parts[1]}"
                
                logger.info(f"Attempting to connect to Production Redis at {masked_url} (Configured URL: {self.url[:15]}...)")
                client = from_url(self.url, decode_responses=True)
                await client.ping()
                self.redis = client
                logger.info("SUCCESS: Connected to Production Redis")
            except Exception as e:
                logger.warning(f"Production Redis connection failed: {e}. Falling back to In-Memory Mock.")
                self.redis = RedisMock()
        return self.redis

    async def close(self):
        client = self.redis
        if client is not None and isinstance(client, Redis):
            await client.close()
            self.redis = None
        elif client is not None and isinstance(client, RedisMock):
            self.redis = None

redis_manager = RedisManager(settings)

async def get_redis():
    return await redis_manager.get_client()
