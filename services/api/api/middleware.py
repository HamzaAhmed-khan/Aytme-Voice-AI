from fastapi.responses import JSONResponse
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import get_redis
from app.core.security import decode_token
import logging
from jose import JWTError
from app.core.config import settings

logger = logging.getLogger("rate_limit")

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    🔐 Per-User Rate Limiting Middleware
    
    Prevents both:
    1. Single user DoS attacks (100 req/min per user)
    2. IP-based attacks (500 req/min per IP if not authenticated)
    
    Authenticated users get a stricter limit to ensure quality of service.
    """
    
    def __init__(self, app, user_limit: int = 100, user_window: int = 60, 
                 ip_limit: int = 500, ip_window: int = 60):
        super().__init__(app)
        self.user_limit = user_limit
        self.user_window = user_window
        self.ip_limit = ip_limit
        self.ip_window = ip_window

    def _get_user_id_from_token(self, token: str) -> str:
        """Extract user ID from JWT token"""
        try:
            payload = decode_token(token)
            return str(payload.get("sub"))
        except (JWTError, Exception):
            return None

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for specific paths
        skip_paths = ["/metrics", "/health", f"{settings.API_V1_STR}/auth/", "/openapi.json", "/docs"]
        if any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)

        # Rate limiting is best-effort — if Redis is down or full, let requests through
        limit = self.ip_limit
        request_count = 0
        try:
            redis = await get_redis()
            current_time = int(time.time())
            
            # Try to get user ID from JWT token
            user_id = None
            auth_header = request.headers.get("Authorization", "")
            
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]  # Remove "Bearer " prefix
                user_id = self._get_user_id_from_token(token)
            
            # 🔐 Per-User Rate Limiting (Stricter for authenticated users)
            if user_id:
                key = f"rate_limit:user:{user_id}:{request.url.path}"
                limit = self.user_limit
                window = self.user_window
                
                # Clean up old requests outside window
                window_start = current_time - window
                await redis.zremrangebyscore(key, 0, window_start)
                request_count = await redis.zcard(key)
                
                if request_count >= limit:
                    logger.warning(
                        f"🔴 Rate limit exceeded for user: {user_id} on {request.url.path} "
                        f"({request_count}/{limit} requests in {window}s)"
                    )
                    return JSONResponse(
                        status_code=429,
                        content={"detail": f"Too many requests. Limited to {limit} requests per {window} seconds."}
                    )
                
                await redis.zadd(key, {str(current_time): current_time})
                await redis.expire(key, window)
                
            else:
                # 🔐 IP-Based Rate Limiting (Fallback for unauthenticated)
                client_ip = request.client.host if request.client else "unknown"
                key = f"rate_limit:ip:{client_ip}"
                limit = self.ip_limit
                window = self.ip_window
                
                # Clean up old requests outside window
                window_start = current_time - window
                await redis.zremrangebyscore(key, 0, window_start)
                request_count = await redis.zcard(key)
                
                if request_count >= limit:
                    logger.warning(
                        f"🔴 Rate limit exceeded for IP: {client_ip} "
                        f"({request_count}/{limit} requests in {window}s)"
                    )
                    return JSONResponse(
                        status_code=429,
                        content={"detail": f"Too many requests. Limited to {limit} requests per {window} seconds."}
                    )
                
                await redis.zadd(key, {str(current_time): current_time})
                await redis.expire(key, window)
        except Exception as e:
            # Redis is unavailable (OutOfMemoryError, connection error, etc.)
            # Let the request through — rate limiting is non-critical
            logger.warning(f"⚠️ Rate limiting skipped (Redis error): {type(e).__name__}: {e}")
        
        # Add rate limit info to response headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - request_count - 1))
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)
        
        return response
