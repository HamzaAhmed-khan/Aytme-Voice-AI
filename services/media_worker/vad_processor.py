import webrtcvad
import collections
import asyncio
import logging

logger = logging.getLogger(__name__)

# Languages where VAD needs to be less aggressive (tonal, pitch-based meaning)
_TONAL_LANGUAGES = {'yo', 'yoruba', 'ig', 'igbo', 'ha', 'hausa', 'am', 'amharic', 'zu', 'zulu'}


def _is_tonal(lang_code: str) -> bool:
    return (lang_code or '').lower().strip() in _TONAL_LANGUAGES


class WebRTCVADProcessor:
    """
    Processes 30ms audio frames through WebRTC VAD.
    Emits speech segments when speech ends.
    Much faster and more accurate than RMS thresholding.

    Tonal language support: When language is Yoruba/Igbo/etc, uses less
    aggressive filtering and longer tail silence to avoid cutting off
    tonal speech patterns.
    """

    VAD_FRAME_MS = 30          # 30ms frames (VAD requirement)
    SAMPLE_RATE  = 16000
    FRAME_SAMPLES = int(SAMPLE_RATE * VAD_FRAME_MS / 1000)  # 480
    FRAME_BYTES   = FRAME_SAMPLES * 2  # 16-bit

    # ─── DEFAULT THRESHOLDS (non-tonal languages) ───
    # Consecutive speech frames before we declare "speech started"
    SPEECH_START_FRAMES = 3   # 3 × 30ms = 90ms confirm
    # Consecutive silence frames before we declare "speech ended"
    SPEECH_END_FRAMES   = 8   # 8 × 30ms = 240ms tail (was 300ms — 60ms faster)
    # Max segment duration before force-split (prevents 15s+ segments)
    MAX_SEGMENT_FRAMES  = 200 # 200 × 30ms = 6 seconds

    # ─── TONAL LANGUAGE THRESHOLDS (Yoruba, Igbo, etc) ───
    TONAL_SPEECH_START_FRAMES = 2   # 2 × 30ms = 60ms (faster trigger — tonal speech starts abruptly)
    TONAL_SPEECH_END_FRAMES   = 15  # 15 × 30ms = 450ms (longer tail — pauses between tones are normal)
    TONAL_MAX_SEGMENT_FRAMES  = 250 # 250 × 30ms = 7.5 seconds (tonal phrases can be longer)

    def __init__(
        self,
        aggressiveness: int = 2,  # 0-3: higher = more aggressive silence filter
        on_speech_segment=None,    # async callback(pcm_bytes: bytes, duration_ms: int)
        on_speech_start=None,      # async callback() for barge-in
        language: str = None       # Language code for tonal-aware thresholds
    ):
        # Tonal languages need less aggressive VAD to avoid dropping valid speech
        self._is_tonal = _is_tonal(language) if language else False
        effective_aggressiveness = min(aggressiveness, 2) if self._is_tonal else aggressiveness

        self.vad = webrtcvad.Vad(effective_aggressiveness)
        self.on_speech_segment = on_speech_segment
        self.on_speech_start = on_speech_start

        self._frame_queue = collections.deque()
        self._speech_frames = []
        self._triggered = False
        self._voiced_frames = 0
        self._unvoiced_frames = 0

        # Select thresholds based on language type
        if self._is_tonal:
            self._start_threshold = self.TONAL_SPEECH_START_FRAMES
            self._end_threshold = self.TONAL_SPEECH_END_FRAMES
            self._max_segment = self.TONAL_MAX_SEGMENT_FRAMES
            logger.info(f"[VAD] Tonal language mode: start={self._start_threshold}, end={self._end_threshold}, aggressiveness={effective_aggressiveness}")
        else:
            self._start_threshold = self.SPEECH_START_FRAMES
            self._end_threshold = self.SPEECH_END_FRAMES
            self._max_segment = self.MAX_SEGMENT_FRAMES

        # Ring buffer of recent frames for pre-roll
        # (captures the first 90ms before VAD triggers to include the start of phonemes)
        # Tonal languages get a larger pre-roll to capture initial tones
        pre_roll_size = 15 if self._is_tonal else 10
        self._pre_roll = collections.deque(maxlen=pre_roll_size)

    def update_language(self, language: str):
        """Update language and recalculate tonal thresholds dynamically."""
        new_is_tonal = _is_tonal(language)
        if new_is_tonal != self._is_tonal:
            self._is_tonal = new_is_tonal
            if self._is_tonal:
                self._start_threshold = self.TONAL_SPEECH_START_FRAMES
                self._end_threshold = self.TONAL_SPEECH_END_FRAMES
                self._max_segment = self.TONAL_MAX_SEGMENT_FRAMES
                # Lower aggressiveness for tonal
                self.vad = webrtcvad.Vad(2)
                logger.info(f"[VAD] Switched to tonal mode for {language}")
            else:
                self._start_threshold = self.SPEECH_START_FRAMES
                self._end_threshold = self.SPEECH_END_FRAMES
                self._max_segment = self.MAX_SEGMENT_FRAMES
                self.vad = webrtcvad.Vad(3)
                logger.info(f"[VAD] Switched to standard mode for {language}")

    def feed(self, pcm_bytes: bytes):
        """
        Feed raw 16kHz mono 16-bit PCM bytes.
        Must be called with EXACTLY FRAME_BYTES bytes per call.
        If your frames are larger, slice them.
        """
        offset = 0
        while offset + self.FRAME_BYTES <= len(pcm_bytes):
            frame = pcm_bytes[offset:offset + self.FRAME_BYTES]
            self._process_frame(frame)
            offset += self.FRAME_BYTES

    def _process_frame(self, frame: bytes):
        try:
            is_speech = self.vad.is_speech(frame, self.SAMPLE_RATE)
        except Exception as e:
            logger.error(f"[VAD] Error: {e}")
            is_speech = False
            
        self._pre_roll.append(frame)

        if not self._triggered:
            if is_speech:
                self._voiced_frames += 1
                if self._voiced_frames >= self._start_threshold:
                    # Speech confirmed — include pre-roll to catch the start
                    self._triggered = True
                    self._speech_frames = list(self._pre_roll)
                    self._unvoiced_frames = 0
                    logger.info(f"[VAD] 🎤 Speech START detected (pre-roll={len(self._pre_roll)}, tonal={self._is_tonal})")
                    if self.on_speech_start:
                        asyncio.create_task(self.on_speech_start())
            else:
                self._voiced_frames = max(0, self._voiced_frames - 1)
        else:
            # We are in a speech segment
            self._speech_frames.append(frame)
            if is_speech:
                self._unvoiced_frames = 0
            else:
                self._unvoiced_frames += 1
            
            # Force-split long segments to keep pipeline flowing
            if len(self._speech_frames) >= self._max_segment:
                segment = b''.join(self._speech_frames)
                duration_ms = len(self._speech_frames) * self.VAD_FRAME_MS
                logger.info(f"[VAD] 🎤 Force-split at {duration_ms}ms (max segment reached)")
                if self.on_speech_segment:
                    asyncio.create_task(self.on_speech_segment(segment, duration_ms))
                self._speech_frames = []
                self._unvoiced_frames = 0
                # Stay triggered — speaker is still talking
            elif self._unvoiced_frames >= self._end_threshold:
                    # Speech ended — emit segment
                    segment = b''.join(self._speech_frames)
                    duration_ms = len(self._speech_frames) * self.VAD_FRAME_MS
                    logger.info(f"[VAD] 🎤 Speech END detected: {duration_ms}ms segment")
                    if self.on_speech_segment:
                        asyncio.create_task(self.on_speech_segment(segment, duration_ms))
                    
                    self._triggered = False
                    self._speech_frames = []
                    self._voiced_frames = 0
                    self._unvoiced_frames = 0
