class HallucinationFilter:

    # Known Whisper hallucination strings (multilingual)
    WHISPER_HALLUCINATIONS = {
        "thank you for watching",
        "thanks for watching",
        "please subscribe",
        "subtitles by",
        "amara.org",
        "subscribed",
        "like and subscribe",
        "www.",
        "http",
        ".com",
        "♪",
        "♫",
        "[music]",
        "[applause]",
        "[laughter]",
        "subtitled by",
        "captioned by",
        "you",              # Whisper's most common 1-word hallucination
        "the",              # ditto
        ".",                # single punctuation
    }

    FILLER_PATTERNS = {
        "um", "uh", "hmm", "ah", "er", "uhh", "umm", "hm",
        "مم", "آه", "اممم",   # Arabic fillers
        "ام", "اوم",            # Urdu fillers
        # Yoruba/West African fillers (should NOT be discarded in tonal context)
        "ẹ̀hẹ̀n", "shebi", "àbí", "kò", "ehen", "ehn",
    }

    # Yoruba-specific: words that are valid even if very short
    YORUBA_VALID_SHORT = {
        "mo", "se", "wa", "lo", "ko", "ni", "ba", "fi", "je", "ri",
        "ṣe", "wá", "lọ", "kò", "ní", "bá", "fi", "jẹ", "rí",
        "ẹ", "ọ", "à", "è", "ò",  # single tonal vowels can be meaningful
    }

    def should_discard_whisper(self, text: str, is_tonal: bool = False) -> tuple[bool, str]:
        """
        Run on Whisper output BEFORE sending to GPT-4.

        Args:
            text: Transcribed text from Whisper
            is_tonal: If True, use relaxed thresholds for tonal languages (Yoruba, etc.)
        """
        clean = text.strip().lower()

        # Empty
        if not clean:
            return True, "empty"

        # Known hallucination string
        if clean in self.WHISPER_HALLUCINATIONS:
            return True, f"known_hallucination:{clean}"

        # Check if it's ONLY filler words
        # For tonal languages, don't discard fillers like "ehen" which carry meaning
        words = clean.split()
        if not is_tonal and all(w in self.FILLER_PATTERNS for w in words):
            return True, "filler_only"

        # Too short — but for tonal languages, even single characters can be valid
        min_len = 1 if is_tonal else 3
        if len(clean) < min_len:
            return True, "too_short"

        # For tonal languages, check if the short text is a valid word
        if is_tonal and len(clean) < 3:
            if clean in self.YORUBA_VALID_SHORT:
                return False, "ok_tonal_word"

        # Repetitive (Whisper loops a word)
        unique_words = set(words)
        if len(words) > 3 and len(unique_words) == 1:
            return True, "repetitive_hallucination"

        return False, "ok"

    def should_discard_translation(
        self, source: str, translation: str
    ) -> tuple[bool, str]:
        """Run on GPT-4 output BEFORE sending to TTS."""

        # [SKIP] signal from GPT-4
        if translation.strip() == "[SKIP]":
            return True, "skip_signal"

        # Empty
        if not translation.strip():
            return True, "empty"

        # Translation identical to source (wrong language)
        if translation.strip().lower() == source.strip().lower():
            return True, "identical_to_source"

        # Very high word overlap (> 60%) — likely not translated
        src_words = set(source.lower().split())
        trl_words = set(translation.lower().split())
        if len(src_words) > 3:
            overlap = len(src_words & trl_words) / len(src_words)
            if overlap > 0.6:
                return True, f"high_overlap:{overlap:.2f}"

        # Suspiciously long (hallucinated extra content)
        if len(translation.split()) > len(source.split()) * 5:
            return True, "suspiciously_long"

        # Contains meta-commentary
        meta = [
            "translation:", "translated:", "in english:", "in urdu:",
            "note:", "i translated", "here is", "the translation is",
            "please note", "(translation)", "[translation]"
        ]
        trl_lower = translation.lower()
        for m in meta:
            if m in trl_lower:
                return True, f"meta_commentary:{m}"

        return False, "ok"
