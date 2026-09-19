"""
Language Utilities — Canonical code-to-name resolution and TTS preferences.

The frontend sends ISO 639-1 codes (e.g. 'ur', 'en') but the OpenAI Realtime
prompt and worker session config expect full language names ('Urdu', 'English').
This module bridges that gap and provides voice/speed defaults for TTS.
"""

import json
from app.core.config import settings

# Bidirectional mapping: code -> name and name -> name (passthrough)
_CODE_TO_NAME = {
    'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch', 'ru': 'Russian',
    'yo': 'Yoruba', 'sw': 'Swahili', 'ha': 'Hausa', 'am': 'Amharic',
    'zu': 'Zulu', 'ig': 'Igbo', 'af': 'Afrikaans',
    'ar': 'Arabic', 'ur': 'Urdu', 'hi': 'Hindi', 'bn': 'Bengali',
    'fa': 'Persian (Farsi)', 'tr': 'Turkish',
    'zh': 'Chinese (Simplified)', 'zh-tw': 'Chinese (Traditional)',
    'ja': 'Japanese', 'ko': 'Korean', 'th': 'Thai', 'vi': 'Vietnamese',
    'id': 'Indonesian', 'ms': 'Malay',
    'pl': 'Polish', 'uk': 'Ukrainian', 'cs': 'Czech', 'sk': 'Slovak',
    'hu': 'Hungarian', 'ro': 'Romanian', 'bg': 'Bulgarian', 'el': 'Greek',
    'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish',
    'he': 'Hebrew', 'ta': 'Tamil', 'te': 'Telugu', 'mr': 'Marathi',
    'pa': 'Punjabi', 'gu': 'Gujarati', 'si': 'Sinhala', 'ne': 'Nepali',
    'tl': 'Tagalog (Filipino)',
}

# Build reverse map: name (lowercase) -> canonical name
_NAME_TO_NAME = {v.lower(): v for v in _CODE_TO_NAME.values()}
# Also add the codes themselves for lookup
_NAME_TO_NAME.update({k.lower(): v for k, v in _CODE_TO_NAME.items()})

# Name -> ISO code (lowercase)
_NAME_TO_CODE = {v.lower(): k for k, v in _CODE_TO_NAME.items()}

# Default TTS voice and speed preferences (override via settings JSON maps)
_VOICE_BY_LANG = {
    "en": "alloy",
    "es": "nova",
    "fr": "shimmer",
    "de": "onyx",
    "it": "fable",
    "pt": "echo",
    "ar": "onyx",
    "hi": "shimmer",
    "ur": "shimmer",
    "ja": "nova",
    "ko": "alloy",
    "zh": "nova",
    "ru": "onyx",
    "tr": "fable",
    # African tonal languages — Yoruba uses "onyx" (deepest, closest to Nigerian male tone)
    "yo": "onyx",
    "ig": "nova",
    "ha": "nova",
    "sw": "nova",
    "am": "nova",
    "zu": "nova",
}

_SPEED_BY_LANG = {
    "ar": 0.88,
    "hi": 0.88,
    "ur": 0.88,
    "ja": 0.88,
    "ko": 0.9,
    "zh": 0.88,
    # African tonal languages — Yoruba uses 0.92 per accent spec
    "yo": 0.92,   # Yoruba: slightly slower for natural Yoruba English pacing
    "ig": 0.85,
    "ha": 0.87,
    "sw": 0.88,
    "am": 0.85,
    "zu": 0.87,
}

def _load_json_map(raw_value: str) -> dict:
    if not raw_value:
        return {}
    try:
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def resolve_language_name(value: str) -> str:
    """
    Resolve a language code or name to a canonical full language name.
    
    Examples:
        resolve_language_name('ur')      -> 'Urdu'
        resolve_language_name('en')      -> 'English'
        resolve_language_name('English') -> 'English'
        resolve_language_name('urdu')    -> 'Urdu'
        resolve_language_name('')        -> ''
    """
    if not value or not value.strip():
        return ''
    
    key = value.strip().lower()
    
    # Direct code lookup
    if key in _CODE_TO_NAME:
        return _CODE_TO_NAME[key]
    
    # Name lookup (case-insensitive)
    if key in _NAME_TO_NAME:
        return _NAME_TO_NAME[key]
    
    # If it looks like a full name already (capitalize and return)
    # This handles edge cases like "Persian (Farsi)" etc.
    return value.strip()


def resolve_language_code(value: str) -> str:
    """
    Resolve a language code or name to a canonical ISO 639-1 code.
    """
    if not value or not value.strip():
        return ""
    key = value.strip().lower()
    if key in _CODE_TO_NAME:
        return key
    if key in _NAME_TO_CODE:
        return _NAME_TO_CODE[key]
    return key[:2]


def resolve_tts_voice(value: str, default_voice: str = None) -> str:
    """
    Resolve a TTS voice based on language code/name with config overrides.
    """
    default = (default_voice or settings.TTS_DEFAULT_VOICE or "alloy").strip()
    custom_map = _load_json_map(settings.TTS_VOICE_MAP_JSON)
    code = resolve_language_code(value)
    return (
        custom_map.get(code)
        or custom_map.get(code.lower())
        or custom_map.get(str(value).strip().lower())
        or _VOICE_BY_LANG.get(code)
        or default
    )


def resolve_tts_speed(value: str, default_speed: float = None) -> float:
    """
    Resolve a TTS speed based on language code/name with config overrides.
    """
    base = settings.TTS_DEFAULT_SPEED if default_speed is None else default_speed
    try:
        base = float(base)
    except Exception:
        base = 0.9
    custom_map = _load_json_map(settings.TTS_SPEED_MAP_JSON)
    code = resolve_language_code(value)
    raw_speed = (
        custom_map.get(code)
        or custom_map.get(code.lower())
        or custom_map.get(str(value).strip().lower())
        or _SPEED_BY_LANG.get(code)
        or base
    )
    try:
        return float(raw_speed)
    except Exception:
        return base


# ─── TTS MODEL RESOLVER (Yoruba uses tts-1-hd for quality) ─────────────────

_YORUBA_CODES = {'yo', 'yoruba'}

def resolve_tts_model(source_lang: str = '', target_lang: str = '', default_model: str = 'tts-1') -> str:
    """
    Resolve which TTS model to use. Returns 'tts-1-hd' when Yoruba is involved
    anywhere in the pipeline, otherwise returns the default 'tts-1'.
    """
    src = resolve_language_code(source_lang).lower() if source_lang else ''
    tgt = resolve_language_code(target_lang).lower() if target_lang else ''
    if src in _YORUBA_CODES or tgt in _YORUBA_CODES:
        return 'tts-1-hd'
    # Also check raw names
    if (source_lang or '').lower().strip() in _YORUBA_CODES:
        return 'tts-1-hd'
    if (target_lang or '').lower().strip() in _YORUBA_CODES:
        return 'tts-1-hd'
    return default_model
