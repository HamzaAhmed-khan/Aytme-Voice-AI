import numpy as np
import threading
from scipy.signal import resample_poly

class AudioRingBuffer:
    """
    Thread-safe fixed-size ring buffer for PCM audio.
    Accepts variable-size frames, outputs fixed-size windows.
    """

    def __init__(
        self,
        sample_rate: int = 48000,
        channels: int = 1,
        dtype=np.int16,
        max_seconds: float = 10.0
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.dtype = dtype
        self.max_samples = int(sample_rate * max_seconds)
        self._buffer = np.zeros(self.max_samples, dtype=dtype)
        self._write_pos = 0
        self._total_written = 0
        self._lock = threading.Lock()

    def write(self, pcm_bytes: bytes):
        """Write raw PCM bytes into ring buffer."""
        samples = np.frombuffer(pcm_bytes, dtype=self.dtype)
        with self._lock:
            n = len(samples)
            space = self.max_samples - self._write_pos
            if n <= space:
                self._buffer[self._write_pos:self._write_pos + n] = samples
                self._write_pos += n
            else:
                # Wrap around
                self._buffer[self._write_pos:] = samples[:space]
                remainder = n - space
                self._buffer[:remainder] = samples[space:]
                self._write_pos = remainder
            self._total_written += n

    def read_last(self, seconds: float) -> np.ndarray:
        """Read the last N seconds of audio as numpy array."""
        n_samples = int(self.sample_rate * seconds)
        with self._lock:
            if self._total_written < n_samples:
                # Not enough data yet
                n_samples = self._total_written
            start = (self._write_pos - n_samples) % self.max_samples
            if start + n_samples <= self.max_samples:
                return self._buffer[start:start + n_samples].copy()
            else:
                end_part = self._buffer[start:].copy()
                wrap_part = self._buffer[:n_samples - len(end_part)].copy()
                return np.concatenate([end_part, wrap_part])

    @property
    def total_seconds(self) -> float:
        return self._total_written / self.sample_rate


class ResamplingRingBuffer(AudioRingBuffer):
    """Stores audio already resampled to 16kHz mono."""

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        channels_in: int = 2,
        max_seconds: float = 10.0
    ):
        super().__init__(sample_rate=sample_rate, channels=channels, max_seconds=max_seconds)
        self.channels_in = channels_in

    def write(self, pcm_bytes: bytes):
        samples_48k = np.frombuffer(pcm_bytes, dtype=np.int16)

        # Stereo to mono if needed
        if self.channels_in == 2:
            samples_48k = samples_48k.reshape(-1, 2).mean(axis=1).astype(np.int16)

        # Resample 48kHz → 16kHz (ratio 1:3)
        samples_16k = resample_poly(samples_48k.astype(np.float32), 1, 3).astype(np.int16)

        super().write(samples_16k.tobytes())
