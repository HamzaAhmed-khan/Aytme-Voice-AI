import time
import logging

logger = logging.getLogger(__name__)

class EchoSuppressionGate:
    """
    In Talk Together mode (2 mics, 1 physical room), 
    when the bot speaks Spanish to Person B, Person A's microphone
    will physically hear the Spanish and try to translate it back to English.
    
    This gate predicts the bot's speaking window and aggressively mutes
    inbound microphone processing during that time.
    """
    
    # How much extra buffer to add AFTER the TTS theoretically finishes,
    # to account for physical room reverberation and late mic pickup.
    ROOM_REVERB_TAIL_MS = 300 

    def __init__(self):
        self._mute_until_time_ns = 0

    def apply_tts_lock(self, pcm_bytes: bytes, tts_sample_rate: int = 24000):
        """
        Calculates exact mathematical duration of the PCM playback
        and locks the mic gate until it completes + Reverb Tail.
        """
        # Calculate duration of this chunk
        samples = len(pcm_bytes) // 2  # 16-bit
        duration_s = samples / tts_sample_rate
        
        # Current monotonic time + duration + reverb
        mute_until = time.monotonic_ns() + int((duration_s + (self.ROOM_REVERB_TAIL_MS / 1000.0)) * 1e9)
        
        # If multiple locks hit overlapping, take the furthest one
        if mute_until > self._mute_until_time_ns:
            self._mute_until_time_ns = mute_until
            
        logger.debug(f"Acoustic mic lock extended by {duration_s*1000:.0f}ms")

    def is_mic_open(self) -> bool:
        """Returns True if the microphone should be processed."""
        return time.monotonic_ns() > self._mute_until_time_ns

    def force_open(self):
        """Called if TTS fails or gets barged-in."""
        self._mute_until_time_ns = 0
