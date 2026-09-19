"""
Language ISO 639-1 Code Mapper
Converts full language names to proper ISO 639-1 codes for Whisper & OpenAI APIs.
"""

import logging

logger = logging.getLogger(__name__)

# Comprehensive mapping of language names to ISO 639-1 codes
LANGUAGE_TO_ISO_CODES = {
    # English variants
    "english": "en",
    "en": "en",
    
    # Mandarin Chinese (most common)
    "chinese": "zh",
    "mandarin": "zh",
    "zh": "zh",
    "simplified chinese": "zh",
    "traditional chinese": "zh",
    
    # Spanish variants
    "spanish": "es",
    "es": "es",
    "castilian": "es",
    
    # Portuguese variants
    "portuguese": "pt",
    "po": "pt",  # Handle incorrect [:2] result
    "pt": "pt",
    "portuguese (brazil)": "pt-br",
    "brazilian portuguese": "pt-br",
    
    # French
    "french": "fr",
    "fr": "fr",
    
    # German
    "german": "de",
    "de": "de",
    
    # Italian
    "italian": "it",
    "it": "it",
    
    # Japanese
    "japanese": "ja",
    "ja": "ja",
    
    # Korean
    "korean": "ko",
    "ko": "ko",
    
    # Urdu (common in Pakistan)
    "urdu": "ur",
    "ur": "ur",
    
    # Hindi
    "hindi": "hi",
    "hi": "hi",
    
    # Dutch
    "dutch": "nl",
    "du": "nl",  # Handle incorrect [:2] result (Dutch[:2] = "du")
    "nl": "nl",
    "flemish": "nl",
    
    # Polish
    "polish": "pl",
    "pl": "pl",
    
    # Russian
    "russian": "ru",
    "ru": "ru",
    
    # Turkish
    "turkish": "tr",
    "tr": "tr",
    
    # Arabic
    "arabic": "ar",
    "ar": "ar",
    
    # Greek
    "greek": "el",
    "el": "el",
    
    # Thai
    "thai": "th",
    "th": "th",
    
    # Vietnamese
    "vietnamese": "vi",
    "vi": "vi",
    
    # Indonesian
    "indonesian": "id",
    "id": "id",
    
    # Tagalog
    "tagalog": "tl",
    "tl": "tl",
    "filipino": "tl",
    
    # Swedish
    "swedish": "sv",
    "sv": "sv",
    
    # Danish
    "danish": "da",
    "da": "da",
    
    # Norwegian
    "norwegian": "no",
    "no": "no",
    
    # Finnish
    "finnish": "fi",
    "fi": "fi",
    
    # Hebrew
    "hebrew": "he",
    "he": "he",
    
    # Icelandic
    "icelandic": "is",
    "is": "is",
    
    # Czech
    "czech": "cs",
    "cs": "cs",
    
    # Slovak
    "slovak": "sk",
    "sk": "sk",
    
    # Hungarian
    "hungarian": "hu",
    "hu": "hu",
    
    # Romanian
    "romanian": "ro",
    "ro": "ro",
    
    # Bulgarian
    "bulgarian": "bg",
    "bg": "bg",
    
    # Serbian
    "serbian": "sr",
    "sr": "sr",
    
    # Croatian
    "croatian": "hr",
    "hr": "hr",
    
    # Slovenian
    "slovenian": "sl",
    "sl": "sl",
    
    # Albanian
    "albanian": "sq",
    "sq": "sq",
    
    # Afrikaans
    "afrikaans": "af",
    "af": "af",
    
    # Swahili
    "swahili": "sw",
    "sw": "sw",
    
    # Zulu
    "zulu": "zu",
    "zu": "zu",

    # Yoruba (West African tonal language)
    "yoruba": "yo",
    "yo": "yo",

    # Igbo
    "igbo": "ig",
    "ig": "ig",

    # Hausa
    "hausa": "ha",
    "ha": "ha",

    # Amharic
    "amharic": "am",
    "am": "am",
}


def get_iso_code(language: str) -> str:
    """
    Convert language name or code to ISO 639-1 code.
    
    Args:
        language: Language name (e.g., "English", "Chinese") or code (e.g., "en", "zh")
    
    Returns:
        ISO 639-1 code (e.g., "en", "zh", "pt")
    
    Examples:
        >>> get_iso_code("English")
        'en'
        >>> get_iso_code("chinese")
        'zh'
        >>> get_iso_code("Portuguese")
        'pt'
        >>> get_iso_code("en")
        'en'
    """
    if not language:
        logger.warning("Empty language provided, defaulting to 'en'")
        return "en"
    
    # Normalize: lowercase and strip whitespace
    normalized = language.lower().strip()
    
    # Direct lookup
    if normalized in LANGUAGE_TO_ISO_CODES:
        code = LANGUAGE_TO_ISO_CODES[normalized]
        logger.debug(f"Language '{language}' -> ISO '{code}'")
        return code
    
    # Fallback: use first 2 chars (for edge cases)
    fallback = normalized[:2].lower()
    if fallback in LANGUAGE_TO_ISO_CODES:
        code = LANGUAGE_TO_ISO_CODES[fallback]
        logger.debug(f"Language '{language}' (fallback) -> ISO '{code}'")
        return code
    
    # Last resort: return as-is (might be already ISO code)
    logger.warning(f"Unknown language '{language}', returning as-is. Full mapping: {LANGUAGE_TO_ISO_CODES.keys()}")
    return normalized[:2].lower()


def validate_language(language: str) -> bool:
    """
    Validate if a language is recognized.
    
    Args:
        language: Language name or code
    
    Returns:
        True if language is recognized, False otherwise
    """
    if not language:
        return False
    normalized = language.lower().strip()
    return normalized in LANGUAGE_TO_ISO_CODES or normalized[:2] in LANGUAGE_TO_ISO_CODES
