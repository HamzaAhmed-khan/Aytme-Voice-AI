import logging
import re
import numpy as np

logger = logging.getLogger(__name__)

class HallucinationFilter:
    def __init__(self):
        # [STRICT-ENGINE] Forbidden phrases for hallucination detection
        self.forbidden_phrases = [
            "how can i help", 
            "i can help", 
            "sure", 
            "of course", 
            "i'm an ai", 
            "i’m an ai",
            "is there anything",
            "what can i do for you"
        ]
        self.min_token_threshold = 2
        
    def is_valid_translation(self, input_text: str, output_text: str) -> bool:
        """
        Production-grade translation validation.
        Rejects echo hallucinations, excessive length, and AI filler.
        """
        if not output_text or not output_text.strip():
            return False

        in_clean = self._normalize_text(input_text)
        out_clean = self._normalize_text(output_text)

        # 1. Length Guard: Reject if output is significantly longer than input (often a hallucination)
        if len(input_text) > 0:
            # Urdu/Hindi/Chinese can be denser or more verbose, 4x is a safe max
            if len(output_text) > (len(input_text) * 4.0):
                logger.warning(f"[FILTER] Rejected: Length mismatch (In: {len(input_text)}, Out: {len(output_text)})")
                return False

        # 2. Blocked Phrases: Filter AI "politeness" hallucinations
        if any(phrase in out_clean for phrase in self.forbidden_phrases):
            logger.warning(f"[FILTER] Rejected: Forbidden phrase match in '{output_text}'")
            return False

        # 3. Echo Check: Reject if AI just repeats input
        if in_clean == out_clean and len(in_clean) > 3:
            logger.warning(f"[FILTER] Rejected: Echo hallucination '{output_text}'")
            return False

        # 4. Token Density: Reject single-word noise or very short gibberish
        tokens = out_clean.split()
        if len(tokens) < self.min_token_threshold:
            logger.debug(f"[FILTER] Rejected: Token count {len(tokens)} below threshold")
            return False

        return True

    def should_discard_whisper(self, text: str, is_tonal: bool = False) -> tuple:
        """
        Detect Whisper-specific hallucination patterns.
        
        Whisper often generates phantom phrases when there's silence, noise,
        or very short audio. Returns (should_discard: bool, reason: str).
        
        Args:
            text: Transcribed text from Whisper
            is_tonal: If True, use relaxed thresholds for tonal languages (Yoruba, etc.)
        """
        if not text or not text.strip():
            return (True, "empty")

        clean = text.strip().lower()

        # Too short to be meaningful speech
        # For tonal languages, even single characters can carry meaning
        min_len = 1 if is_tonal else 3
        if len(clean) < min_len:
            return (True, "too_short")

        # Common Whisper hallucination patterns (generated during silence/noise)
        hallucination_patterns = [
            "thank you for watching",
            "thanks for watching",
            "please subscribe",
            "like and subscribe",
            "see you next time",
            "goodbye",
            "bye bye",
            "thank you.",
            "thanks.",
            "you",
            "the end",
            "music",
            "applause",
            "laughter",
            "silence",
            "...",
            "subtitles by",
            "captions by",
            "translated by",
        ]

        for pattern in hallucination_patterns:
            if clean == pattern or clean == pattern.rstrip('.'):
                return (True, f"hallucination_match: {pattern}")

        # Detect repeated single words/phrases (e.g., "the the the the")
        words = clean.split()
        if len(words) >= 3:
            unique_words = set(words)
            if len(unique_words) == 1:
                return (True, f"repeated_word: {words[0]}")

        return (False, "ok")

    def is_audio_valid(self, pcm_data: bytes, threshold_rms: float = 800.0) -> bool:
        """Energy gate for raw audio frames."""
        if not pcm_data:
            return False
        samples = np.frombuffer(pcm_data, dtype=np.int16)
        if len(samples) == 0:
            return False
        rms = np.sqrt(np.mean(samples.astype(np.float32)**2))
        return rms > threshold_rms

    def _normalize_text(self, text: str) -> str:
        if not text: return ""
        text = text.strip().lower()
        return re.sub(r'[^\w\s]', '', text)
