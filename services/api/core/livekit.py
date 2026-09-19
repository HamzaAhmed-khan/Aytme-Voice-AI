from typing import List, Optional
from datetime import datetime, timedelta, timezone
from livekit.api import AccessToken, VideoGrants, LiveKitAPI, WebhookReceiver
from app.core.config import settings
from contextlib import asynccontextmanager
import logging
import time

logger = logging.getLogger(__name__)

class LiveKitManager:
    def __init__(self):
        self.api_key = settings.LIVEKIT_API_KEY
        self.api_secret = settings.LIVEKIT_API_SECRET.get_secret_value() if hasattr(settings.LIVEKIT_API_SECRET, 'get_secret_value') else settings.LIVEKIT_API_SECRET
        self.url = settings.LIVEKIT_URL

    def get_token(self, room_name: str, identity: str, metadata: Optional[str] = None):
        """Generate JWT using official SDK for reliability."""
        try:
            grant = VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True
            )
            
            token = (
                AccessToken(self.api_key, self.api_secret)
                .with_identity(identity)
                .with_grants(grant)
            )
            if metadata:
                token.with_metadata(metadata)
                
            # Set expiry to 2 hours
            token.with_ttl(timedelta(hours=2))
            
            return token.to_jwt()
        except Exception as e:
            logger.error(f"❌ CRITICAL ERROR IN JWT GENERATION: {str(e)}", exc_info=True)
            # Fallback to the manual generation logic if SDK fails
            from jose import jwt
            payload = {
                "video": {
                    "roomJoin": True,
                    "room": room_name,
                    "canPublish": True,
                    "canSubscribe": True,
                    "canPublishData": True
                },
                "sub": identity,
                "iss": self.api_key,
                "nbf": int(time.time()),
                "exp": int(time.time()) + 3600 * 2
            }
            return jwt.encode(payload, self.api_secret, algorithm='HS256')

    @asynccontextmanager
    async def get_api(self):
        """Provide a managed LiveKitAPI instance."""
        lk = LiveKitAPI(
            url=self.url,
            api_key=self.api_key,
            api_secret=self.api_secret
        )
        try:
            yield lk
        finally:
            await lk.aclose()

    def receive_webhook(self, body: str, auth_header: str):
        receiver = WebhookReceiver(self.api_secret)
        return receiver.receive(body, auth_header)

livekit_manager = LiveKitManager()
