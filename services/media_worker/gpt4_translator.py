import asyncio
import logging
import time
from openai import AsyncOpenAI
from services.media_worker.hallucination_filter import HallucinationFilter

_hf = HallucinationFilter()  # singleton — avoid per-call object construction

logger = logging.getLogger(__name__)

# Languages where GPT-4o-mini may produce lower quality translations
# These use full GPT-4o for accuracy (tonal languages, complex scripts, low-resource)
COMPLEX_LANGUAGES = {
    'yo', 'yoruba', 'ig', 'igbo', 'ha', 'hausa',  # West African tonal
    'sw', 'swahili', 'am', 'amharic',              # East African
    'ar', 'arabic', 'fa', 'persian', 'farsi',       # RTL + complex morphology
    'zh', 'chinese', 'ja', 'japanese',              # CJK logographic
    'ko', 'korean', 'th', 'thai', 'my', 'burmese',  # Complex scripts
    'ta', 'tamil', 'te', 'telugu', 'bn', 'bengali', # Indic scripts
}

def _select_model(source_lang: str, target_lang: str) -> str:
    """Select fastest model that maintains quality for the language pair."""
    src = (source_lang or '').lower()
    tgt = (target_lang or '').lower()
    if src in COMPLEX_LANGUAGES or tgt in COMPLEX_LANGUAGES:
        return 'gpt-4o'  # Full model for complex languages
    return 'gpt-4o-mini'  # 2-3x faster for common language pairs

LANG_NAMES = {
    "en": "English",   "ur": "Urdu",    "ar": "Arabic",
    "fr": "French",    "de": "German",  "es": "Spanish",
    "zh": "Chinese",   "hi": "Hindi",   "ru": "Russian",
    "pt": "Portuguese","ja": "Japanese","ko": "Korean",
    "tr": "Turkish",   "it": "Italian", "fa": "Persian",
    "nl": "Dutch",     "pl": "Polish",  "vi": "Vietnamese",
    "th": "Thai",      "id": "Indonesian",
    # Full name mappings (case-insensitive lookup handled below)
    "english": "English", "urdu": "Urdu", "arabic": "Arabic",
    "french": "French", "german": "German", "spanish": "Spanish",
    "chinese": "Chinese", "hindi": "Hindi", "russian": "Russian",
    "portuguese": "Portuguese", "japanese": "Japanese", "korean": "Korean",
    "turkish": "Turkish", "italian": "Italian", "persian": "Persian",
    "dutch": "Dutch", "polish": "Polish", "vietnamese": "Vietnamese",
    "thai": "Thai", "indonesian": "Indonesian"
}

def _resolve_lang_name(lang: str) -> str:
    if not lang:
        return "English"
    return LANG_NAMES.get(lang.lower(), lang.capitalize())

TRANSLATION_SYSTEM_PROMPT = """\
You are a silent real-time simultaneous interpreter embedded in live 
conferencing software. You will be given a short speech fragment.

SOURCE LANGUAGE: {source_name} ({source_code})
TARGET LANGUAGE: {target_name} ({target_code})

OUTPUT CONTRACT — read carefully:
1. Your entire response MUST be ONLY the {target_name} translation.
2. Output NOTHING else. No quotes. No punctuation added. No notes.
3. If the input is filler, noise, hesitation sounds (um, uh, hmm, 
   ah, silence markers) — output exactly the text: [SKIP]
4. If the input is already in {target_name} — output exactly: [SKIP]
5. If the input is fewer than 2 meaningful words — output: [SKIP]
6. Preserve proper nouns, names, numbers, and technical terms verbatim.
7. Match the exact register: formal stays formal, casual stays casual.
8. NEVER add any explanation of what you translated or why.
9. If you are uncertain about one word, make your best natural choice 
   and continue. Do not hedge or add parentheticals.
10. Complete incomplete sentences naturally in {target_name}.

You will be penalized for any output that is not a clean translation 
or the literal text [SKIP]. There is no third option."""

class GPT4StreamTranslator:
    def __init__(self, api_key: str, source_lang: str = "en", target_lang: str = "es"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.on_tokens = asyncio.Queue()
        self.on_transcript = None # (source_text, translated_text)
        self.on_started = None
        self.on_finished = None

    async def start(self):
        """Initializes the translator and pre-warms the connection."""
        self._model = _select_model(self.source_lang, self.target_lang)
        await self._prewarm_gpt4()
        logger.info(f"GPT4StreamTranslator started (model={self._model})")

    async def _prewarm_gpt4(self):
        """Send a minimal completion request to force connection establishment."""
        try:
            await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self._model,
                    max_tokens=1,
                    temperature=0,
                    messages=[{"role": "user", "content": "hi"}]
                ),
                timeout=5.0
            )
            logger.info(f"GPT4 connection pre-warmed ({self._model})")
        except Exception as e:
            logger.warning(f"GPT4 pre-warm failed (non-fatal): {e}")

    def update_languages(self, source_lang: str, target_lang: str):
        """Update source/target languages for bidirectional swapping."""
        self.source_lang = source_lang
        self.target_lang = target_lang
        self._model = _select_model(source_lang, target_lang)
        logger.info(f"Translator updated: {source_lang} → {target_lang} (model={self._model})")

    async def raw_translate(
        self,
        text: str,
        source_lang: str = None,
        target_lang: str = None,
    ) -> str:
        """
        Translate text WITHOUT pushing tokens to the TTS pipeline.
        Used for speculative background translations from SpeculativeTranslationCache.
        Returns empty string on failure, [SKIP], or hallucination.
        Propagates asyncio.CancelledError so the cache can cancel stale tasks.
        """
        src = source_lang or self.source_lang
        tgt = target_lang or self.target_lang
        source_name = _resolve_lang_name(src)
        target_name = _resolve_lang_name(tgt)

        try:
            t0 = time.monotonic()
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self._model,
                    temperature=0,
                    max_tokens=300,
                    top_p=1,
                    frequency_penalty=0,
                    presence_penalty=0,
                    messages=[
                        {
                            "role": "system",
                            "content": TRANSLATION_SYSTEM_PROMPT.format(
                                source_name=source_name,
                                source_code=src,
                                target_name=target_name,
                                target_code=tgt,
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                ),
                timeout=5.0,
            )
            translation = response.choices[0].message.content.strip()
            latency_ms = int((time.monotonic() - t0) * 1000)
            logger.debug(
                f"[SPECULATIVE] raw_translate {latency_ms}ms: "
                f"'{text[:40]}' → '{translation[:40]}'"
            )

            if not translation or translation == "[SKIP]":
                return ""

            discard, _ = _hf.should_discard_translation(text, translation)
            if discard:
                return ""

            return translation

        except asyncio.CancelledError:
            raise  # Must propagate so the cache can cancel stale tasks.
        except Exception as e:
            logger.debug(f"[SPECULATIVE] raw_translate failed: {e}")
            return ""

    async def translate_sentence(self, sentence: str, source_lang: str = None, target_lang: str = None) -> str:
        """
        Translates one sentence. If source/target not provided, uses stored defaults.
        Pushes tokens to on_tokens queue for the pipeline, and returns final text.
        """
        src = source_lang or self.source_lang
        tgt = target_lang or self.target_lang
        source_name = _resolve_lang_name(src)
        target_name = _resolve_lang_name(tgt)

        if self.on_started:
            try:
                result = self.on_started()
                if asyncio.iscoroutine(result):
                    asyncio.create_task(result)
            except Exception as e:
                logger.warning(f"on_started callback error: {e}")

        try:
            t0 = time.monotonic()
            logger.info(f"[DIAG][GPT4] Received sentence: '{sentence[:80]}' (model={self._model})")
            self._last_source_text = sentence  # Store for pipeline persistence
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self._model,
                    temperature=0,
                    max_tokens=300,
                    top_p=1,
                    frequency_penalty=0,
                    presence_penalty=0,
                    messages=[
                        {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT.format(
                            source_name=source_name,
                            source_code=src,
                            target_name=target_name,
                            target_code=tgt
                        )},
                        {"role": "user", "content": sentence}
                    ]
                ),
                timeout=5.0  # Hard 5s timeout — skip phrase if too slow
            )
            
            translation = response.choices[0].message.content.strip()
            latency_ms = int((time.monotonic() - t0) * 1000)
            logger.info(f"[DIAG][GPT4] Translation complete in {latency_ms}ms: '{translation[:80]}'")

            # Hallucination filter
            discard, reason = _hf.should_discard_translation(sentence, translation)
            if discard:
                logger.info(f"[DIAG][GPT4] Hallucination detected [{reason}]: '{translation}'")
                await self.on_tokens.put("END_OF_SEGMENT")
                return ""

            if translation and translation != "[SKIP]":
                # Send to transcript DataChannel callback
                if self.on_transcript:
                    asyncio.create_task(self.on_transcript(
                        source_text=sentence,
                        translated_text=translation
                    ))

                # Push the full translation as a single token for the TTS pipeline
                logger.info(f"[DIAG][GPT4] Sending to TTS queue. Queue size: {self.on_tokens.qsize()}")
                await self.on_tokens.put(translation)
                await self.on_tokens.put("END_OF_SEGMENT")
            else:
                logger.info(f"[DIAG][GPT4] Skipped (empty or [SKIP]): '{translation}'")
                await self.on_tokens.put("END_OF_SEGMENT")
                
            return translation

        except Exception as e:
            logger.error(f"GPT-4 translation failed: {e}")
            await self.on_tokens.put("END_OF_SEGMENT")
            return ""
        finally:
            if self.on_finished:
                try:
                    result = self.on_finished()
                    if asyncio.iscoroutine(result):
                        asyncio.create_task(result)
                except Exception as e:
                    logger.warning(f"on_finished callback error: {e}")

