import wave
import struct
import math
import logging

logger = logging.getLogger("vad")

class SimpleVAD:
    """
    A pure-python energy-based Voice Activity Detector.
    Fulfills 4.3 Audio Processing Pipeline requirements as a robust fallback.
    """
    def __init__(self, threshold: float = 300.0, sample_rate: int = 16000):
        self.threshold = threshold
        self.sample_rate = sample_rate

    def is_speech(self, audio_frame: bytes) -> bool:
        # Assuming 16-bit PCM audio
        count = int(len(audio_frame) / 2)
        format = "%dh" % count
        shorts = struct.unpack(format, audio_frame)

        # Calculate Root Mean Square (RMS) as a measure of energy
        sum_squares = 0.0
        for sample in shorts:
            n = sample / 32768.0
            sum_squares += n * n

        rms = math.sqrt(sum_squares / count) * 1000
        return rms > self.threshold

    def process_stream(self, audio_data: bytes, chunk_size_ms: int = 30):
        """Chunks audio data and yields segments that likely contain speech."""
        bytes_per_sample = 2
        chunk_size = int(self.sample_rate * (chunk_size_ms / 1000.0) * bytes_per_sample)
        
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            if self.is_speech(chunk):
                yield chunk

vad_service = SimpleVAD()
