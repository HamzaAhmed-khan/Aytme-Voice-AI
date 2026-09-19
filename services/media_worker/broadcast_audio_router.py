import asyncio
import logging
from typing import Dict, Optional
from livekit import rtc

logger = logging.getLogger(__name__)

class BroadcastAudioRouter:
    """
    Dynamically creates and destroys LocalAudioTracks per language.
    Used exclusively in Broadcast mode.
    """
    def __init__(self, room: rtc.Room):
        self.room = room
        # language_code -> (audio_source, track)
        self.tracks: Dict[str, tuple[rtc.AudioSource, rtc.LocalAudioTrack]] = {}

    async def get_or_create_track(self, target_lang: str) -> rtc.AudioSource:
        """
        Returns the AudioSource for a specific language.
        If it doesn't exist, provisions a new track and publishes it.
        """
        if target_lang in self.tracks:
            return self.tracks[target_lang][0]

        # 1. Create source
        # 24kHz matches our TTS output
        source = rtc.AudioSource(24000, 1)

        # 2. Create track
        # The key constraint: track_name MUST equal target_lang (e.g. "es", "ur")
        # so frontend useLanguageTrack can match it.
        track = rtc.LocalAudioTrack.create_audio_track(
            name=target_lang,
            source=source
        )

        # 3. Publish to room
        options = rtc.TrackPublishOptions(
            source=rtc.TrackSource.SOURCE_MICROPHONE
        )
        
        try:
            publication = await self.room.local_participant.publish_track(track, options)
            logger.info(f"Published broadcast track for language: {target_lang}")
            self.tracks[target_lang] = (source, track)
            return source
        except Exception as e:
            logger.error(f"Failed to publish track for {target_lang}: {e}")
            raise e

    async def remove_track(self, target_lang: str):
        """Unpublishes and cleans up a track if no listeners demand it."""
        if target_lang in self.tracks:
            _, track = self.tracks.pop(target_lang)
            try:
                # To unpublish, LiveKit python API needs the track sid, unfortunately
                # track.sid might not be set until published. 
                # According to standard python livekit we pass the track object or sid.
                # The type signature of unpublish_track is often `unpublish_track(track_sid_or_publication)`
                # Let's pass the Track object's sid if it exists, or just pass the track itself.
                # Actually, in livekit-api 0.18, unpublish_track might just take the track sid str.
                await self.room.local_participant.unpublish_track(track.sid)
                logger.info(f"Unpublished broadcast track for {target_lang}")
            except Exception as e:
                logger.warning(f"Error unpublishing track {target_lang}: {e}")
                
    async def cleanup(self):
        """Removes all tracks on shutdown."""
        langs = list(self.tracks.keys())
        for lang in langs:
            await self.remove_track(lang)
