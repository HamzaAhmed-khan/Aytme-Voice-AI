"""
realtime_translate.py
─────────────────────────────────────────────────────────
Backend WebSocket relay: client ↔ OpenAI Realtime API

Each client WebSocket connection maps 1:1 to one OpenAI Realtime session.
The relay:
  • Holds the API key server-side (never exposed to browser)
  • Builds a per-session accent-locked system prompt
  • Re-injects the system prompt on every reconnect (fixes the fallback bug)
  • Logs the active system prompt on every turn in DEBUG mode
  • Fails loudly on voice swap or accent loss — never silently degrades
  • Auto-reconnects to OpenAI with exponential backoff

Audio format contract:
  Client → relay → OpenAI :  raw PCM16 at 24 000 Hz, mono, little-endian
  OpenAI → relay → client :  raw PCM16 at 24 000 Hz, mono, little-endian

Caption contract:
  OpenAI → relay → client :  JSON text frames  { "type": "caption_delta", "text": "..." }
                             { "type": "turn_done" }
                             { "type": "speech_started" }
                             { "type": "error", "message": "..." }
"""

import asyncio
import base64
import json
import logging
from typing import Optional

import aiohttp
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core import security as _security

router = APIRouter()
logger = logging.getLogger(__name__)

# ── OpenAI Realtime endpoint ──────────────────────────────────────────────────
_OPENAI_REALTIME_URL = (
    "wss://api.openai.com/v1/realtime"
    "?model=gpt-realtime"
)

# ── Language config — single source of truth (mirrors languageConfig.js) ────────
#
# Voice is PER-LANGUAGE from the 8 gpt-realtime voices: alloy ash ballad coral echo sage shimmer verse
# Assignment is based on each language's phonetic character, tonal structure, and cultural cadence.
# To change a voice: edit this file only — the relay enforces it on every session start and reconnect.
# Speed is per-language: tonal/complex-script languages get 0.92-0.95 for clarity.
# Region is used in the system prompt to anchor the model to a specific locale.
#
# Voice rationale by group:
#   alloy   — neutral, balanced, formal         : English, German, Dutch, Afrikaans
#   ash     — crisp, precise, tonal-safe        : Chinese (Simplified/Traditional), Thai (5-tone), Vietnamese (6-tone), Hebrew
#   ballad  — melodic, warm, flowing            : Spanish, Portuguese, Italian, Romanian, Ukrainian, Bengali, Nepali,
#                                                 Swedish, Danish, Norwegian (all carry pitch-accent melody)
#   coral   — warm, friendly, conversational    : Indonesian, Malay, Tagalog (Filipino), Turkish
#   echo    — deep, authoritative resonance     : Arabic, Russian
#   sage    — calm, measured, deliberate        : Japanese, Korean, Czech, Slovak, Polish, Finnish, Hungarian, Bulgarian
#   shimmer — bright, energetic, upbeat         : Hindi, Punjabi, Swahili
#   verse   — versatile, expressive, adaptive   : Yoruba (3-tone), Igbo (tonal), Hausa (tonal), Amharic, Zulu,
#                                                 French, Greek, Gujarati, Marathi, Persian (Farsi), Urdu, Tamil, Telugu, Sinhala
#
# To add a language: add one entry here AND in languageConfig.js.
# If a language is missing, _build_system_prompt() raises loudly — never drifts silently.
_LANGUAGE_CONFIG: dict[str, dict] = {
    # ── alloy: neutral, formal, balanced — Germanic/neutral NA ───────────────
    "English":               {"accent": "neutral North American English",              "region": "USA",           "voice": "alloy",   "speed": 1.0  },
    "German":                {"accent": "standard Hochdeutsch German",                 "region": "Hannover",      "voice": "alloy",   "speed": 1.0  },
    "Dutch":                 {"accent": "standard Dutch",                              "region": "Randstad",      "voice": "alloy",   "speed": 1.0  },
    "Afrikaans":             {"accent": "South African Afrikaans",                     "region": "Cape Town",     "voice": "alloy",   "speed": 1.0  },

    # ── ash: crisp precision — preserves tonal distinctions in high-tone-count languages ──
    "Chinese (Simplified)":  {"accent": "Beijing Mandarin",                            "region": "Beijing",       "voice": "ash",     "speed": 0.95 },
    "Chinese (Traditional)": {"accent": "Taipei Mandarin",                             "region": "Taipei",        "voice": "ash",     "speed": 0.95 },
    "Thai":                  {"accent": "Bangkok Thai",                                "region": "Bangkok",       "voice": "ash",     "speed": 0.95 },
    "Vietnamese":            {"accent": "northern Vietnamese",                         "region": "Hanoi",         "voice": "ash",     "speed": 0.95 },
    "Hebrew":                {"accent": "Tel Aviv Hebrew",                             "region": "Tel Aviv",      "voice": "ash",     "speed": 0.95 },

    # ── ballad: melodic, warm, flowing — Romance + Nordic pitch-accent + South Asian melodic ──
    "Spanish":               {"accent": "Latin American Spanish",                      "region": "Mexico City",   "voice": "ballad",  "speed": 1.0  },
    "Portuguese":            {"accent": "Brazilian Portuguese",                        "region": "São Paulo",     "voice": "ballad",  "speed": 1.0  },
    "Italian":               {"accent": "standard Italian",                            "region": "Rome",          "voice": "ballad",  "speed": 1.0  },
    "Romanian":              {"accent": "Bucharest Romanian",                          "region": "Bucharest",     "voice": "ballad",  "speed": 0.95 },
    "Ukrainian":             {"accent": "Kyiv Ukrainian",                              "region": "Kyiv",          "voice": "ballad",  "speed": 0.95 },
    "Swedish":               {"accent": "Stockholm Swedish",                           "region": "Stockholm",     "voice": "ballad",  "speed": 1.0  },
    "Danish":                {"accent": "Copenhagen Danish",                           "region": "Copenhagen",    "voice": "ballad",  "speed": 1.0  },
    "Norwegian":             {"accent": "Oslo Norwegian Bokmål",                       "region": "Oslo",          "voice": "ballad",  "speed": 1.0  },
    "Bengali":               {"accent": "native Bengali",                              "region": "Kolkata",       "voice": "ballad",  "speed": 0.95 },
    "Nepali":                {"accent": "Kathmandu Nepali",                            "region": "Kathmandu",     "voice": "ballad",  "speed": 0.95 },

    # ── coral: warm, friendly, conversational — Southeast Asian + Turkish ────
    "Indonesian":            {"accent": "Jakarta Bahasa Indonesia",                    "region": "Jakarta",       "voice": "coral",   "speed": 1.0  },
    "Malay":                 {"accent": "Kuala Lumpur Bahasa Melayu",                  "region": "Kuala Lumpur",  "voice": "coral",   "speed": 1.0  },
    "Tagalog (Filipino)":    {"accent": "Manila Tagalog",                              "region": "Manila",        "voice": "coral",   "speed": 1.0  },
    "Turkish":               {"accent": "Istanbul Turkish",                            "region": "Istanbul",      "voice": "coral",   "speed": 1.0  },

    # ── echo: deep, authoritative resonance — formal Semitic + Slavic gravitas ──
    "Arabic":                {"accent": "Modern Standard Arabic, Levantine inflection","region": "Levant",        "voice": "echo",    "speed": 0.95 },
    "Russian":               {"accent": "Moscow Russian",                              "region": "Moscow",        "voice": "echo",    "speed": 0.95 },

    # ── sage: calm, measured, deliberate — polite East Asian + precise Slavic/Finno-Ugric ──
    "Japanese":              {"accent": "Tokyo Japanese",                              "region": "Tokyo",         "voice": "sage",    "speed": 0.95 },
    "Korean":                {"accent": "Seoul Korean",                                "region": "Seoul",         "voice": "sage",    "speed": 0.95 },
    "Czech":                 {"accent": "Prague Czech",                                "region": "Prague",        "voice": "sage",    "speed": 0.95 },
    "Slovak":                {"accent": "Bratislava Slovak",                           "region": "Bratislava",    "voice": "sage",    "speed": 0.95 },
    "Polish":                {"accent": "Warsaw Polish",                               "region": "Warsaw",        "voice": "sage",    "speed": 0.95 },
    "Finnish":               {"accent": "Helsinki Finnish",                            "region": "Helsinki",      "voice": "sage",    "speed": 0.95 },
    "Hungarian":             {"accent": "Budapest Hungarian",                          "region": "Budapest",      "voice": "sage",    "speed": 0.95 },
    "Bulgarian":             {"accent": "Sofia Bulgarian",                             "region": "Sofia",         "voice": "sage",    "speed": 0.95 },

    # ── shimmer: bright, energetic, upbeat — lyrical Indic + East African melody ──
    "Hindi":                 {"accent": "native Hindi",                                "region": "Delhi",         "voice": "shimmer", "speed": 0.95 },
    "Punjabi":               {"accent": "Amritsar Punjabi",                            "region": "Amritsar",      "voice": "shimmer", "speed": 0.95 },
    "Swahili":               {"accent": "coastal Swahili",                             "region": "Mombasa",       "voice": "shimmer", "speed": 0.95 },

    # ── verse: versatile, expressive, tonal-adaptive — tonal African, poetic Indic/Semitic, Mediterranean ──
    "Yoruba":                {"accent": "native Yoruba",                               "region": "Lagos",         "voice": "verse",   "speed": 0.92 },
    "Igbo":                  {"accent": "southeastern Nigerian Igbo",                  "region": "Enugu",         "voice": "verse",   "speed": 0.95 },
    "Hausa":                 {"accent": "northern Nigerian Hausa",                     "region": "Kano",          "voice": "verse",   "speed": 0.95 },
    "Amharic":               {"accent": "native Amharic",                              "region": "Addis Ababa",   "voice": "verse",   "speed": 0.95 },
    "Zulu":                  {"accent": "native Zulu",                                 "region": "KwaZulu-Natal", "voice": "verse",   "speed": 0.95 },
    "French":                {"accent": "Parisian French",                             "region": "Paris",         "voice": "verse",   "speed": 1.0  },
    "Greek":                 {"accent": "Athens Greek",                                "region": "Athens",        "voice": "verse",   "speed": 0.95 },
    "Gujarati":              {"accent": "Ahmedabad Gujarati",                          "region": "Ahmedabad",     "voice": "verse",   "speed": 0.95 },
    "Marathi":               {"accent": "Mumbai Marathi",                              "region": "Mumbai",        "voice": "verse",   "speed": 0.95 },
    "Persian (Farsi)":       {"accent": "Tehran Farsi",                                "region": "Tehran",        "voice": "verse",   "speed": 0.95 },
    "Urdu":                  {"accent": "native Urdu",                                 "region": "Lahore",        "voice": "verse",   "speed": 0.95 },
    "Tamil":                 {"accent": "Chennai Tamil",                               "region": "Chennai",       "voice": "verse",   "speed": 0.95 },
    "Telugu":                {"accent": "Hyderabad Telugu",                            "region": "Hyderabad",     "voice": "verse",   "speed": 0.95 },
    "Sinhala":               {"accent": "Colombo Sinhala",                             "region": "Colombo",       "voice": "verse",   "speed": 0.95 },
}

# Derived flat map kept for backward compatibility (logging, test imports)
LANGUAGE_ACCENT_MAP: dict[str, str] = {
    lang: f"{cfg['accent']} accent from {cfg['region']}"
    for lang, cfg in _LANGUAGE_CONFIG.items()
}


# ── Yoruba-specific prompt blocks ────────────────────────────────────────────
# Activated ONLY when source or target is Yoruba. Does not affect any other language.

_YORUBA_REMINDER = (
    "REMINDER: This session is Yoruba. Maintain authentic Lagos native accent, "
    "three-tone system (high ´, mid, low `), correct \"gb\" pronunciation, and natural "
    "syllable-timed rhythm. Do NOT drift to a neutral AI voice under any circumstances."
)

_YORUBA_SPEAKING_GUIDE = """
CRITICAL YORUBA SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:

1. TONES ARE MANDATORY
Yoruba is a tonal language with THREE tones: high (´), mid (unmarked), and low (`).
Tones change word meaning entirely. Examples:
  - "ọkọ" (mid-mid) = husband   |   "ọkọ̀" (mid-low) = vehicle   |   "ọ̀kọ̀" (low-low) = spear
You MUST pronounce every tone correctly. Never flatten tones into a neutral pitch.

2. PRONUNCIATION RULES
  - "gb" is a single voiced labial-velar plosive — NOT "g" followed by "b"
  - "ọ" sounds like "aw" in "law" (open-mid back rounded vowel)
  - "ẹ" sounds like "eh" in "bed" (open-mid front unrounded vowel)
  - "ṣ" sounds like "sh" in "shoe"
  - Roll or tap the "r" lightly — never the American English rhotic "r"
  - Nasalize vowels in syllables ending with "n" (an, ẹn, in, ọn, un) correctly

3. RHYTHM & FLOW
  - Yoruba is syllable-timed — give each syllable roughly equal duration
  - Use a melodic, sing-song delivery — never monotone or robotic
  - Pause naturally between phrases; never cut off mid-word

4. NATURAL VOCABULARY (Lagos register)
  - Use everyday words a Lagos native uses, not archaic or literary forms
  - Common English loanwords like "moto" (car), "fónu" (phone) are natural — use them
  - Do NOT over-formalize — sound like a real Lagos speaker, not a textbook recording

5. CULTURAL TONE
  - Yoruba speech is warm, expressive, and rhythmic
  - Use natural fillers where contextually appropriate: "ẹ jọ̀wọ́", "ṣé", "abí"
  - Mirror the emotional energy of the speaker

6. ABSOLUTE BANS
  - NEVER speak Yoruba with an English or American accent
  - NEVER flatten the three-tone system into one pitch level
  - NEVER pronounce "gb" as two separate sounds
  - NEVER use robotic, news-anchor, or generic AI delivery
  - NEVER drift to neutral AI voice — stay locked as a Lagos native speaker"""

_YORUBA_INPUT_GUIDE = """
WHEN LISTENING TO YORUBA INPUT:
- The speaker uses natural conversational Yoruba, often with Nigerian English code-switching
- Numbers, time references, and technology terms may be spoken in English mid-sentence — this is normal
- Tones distinguish words — do not misinterpret a tonal shift as a different word; use conversational context
- Understand common Lagos slang and shortened forms (e.g. "ṣé o" for "isn't it?", "jẹ̀ jẹ̀" for "slowly")
- When a phrase is ambiguous, choose the interpretation that fits the conversational context
- Translate everything as accurately as possible — never refuse or hesitate due to tonal ambiguity"""

# Rich vocabulary context injected into the transcription model — forces recognition of
# Yoruba-specific diacritics and tonal marks, eliminating guesswork on common words.
_YORUBA_TRANSCRIPTION_PROMPT = (
    "The speaker is using conversational Yoruba with a Lagos accent. "
    "Common words and phrases: ẹ káàárọ̀, ẹ káàsan, ẹ kúùrọ̀lẹ́, ẹ ṣé, jọ̀wọ́, báwo ni, "
    "ó dára, ọkọ, ilé, omi, oúnjẹ, mo fẹ́, mo ń lọ, ṣé, abí, ẹ̀yin, ìdílé, ọmọ, "
    "àgbàdo, eran, ẹja, isu, ọjọ́, ọsẹ̀, oṣù, ọdún, owó, iṣẹ́, ilé-ìwé, "
    "gbogbo, nkan, tabi, ati, síbẹ̀, ṣugbọn, nítorí, ìgbà, bẹ́ẹ̀ ni, bẹ́ẹ̀ kọ. "
    "Yoruba has three lexical tones: high (´), mid (unmarked), low (`). "
    "Transcribe all diacritical marks accurately: ọ, ẹ, ṣ, ń, and all tone marks."
)


# ── Universal anti-conversational enforcement block ──────────────────────────
# Prepended to EVERY language's system prompt.
# Prevents the model from acting as a conversational assistant.
_ANTI_CONVERSATIONAL_BLOCK = (
    "CRITICAL — YOU ARE NOT AN AI ASSISTANT. YOU ARE A PURE TRANSLATION ENGINE.\n\n"
    "You are a microphone with a translation filter. You repeat what is said in another language. "
    "You do nothing else.\n\n"
    "NON-NEGOTIABLE RULES:\n"
    "1. TRANSLATE ONLY — output the exact translation of what the user says. Nothing else.\n"
    "2. NEVER greet the user, introduce yourself, say you are ready, or acknowledge input.\n"
    "3. NEVER add commentary, reactions, filler phrases, or your own sentences.\n"
    "4. NEVER respond as if you are being addressed or spoken TO.\n"
    "5. If the user asks a QUESTION, translate the question — NEVER answer it.\n"
    "   Wrong: user says 'How are you?' → you reply 'I am fine'\n"
    "   Right: user says 'How are you?' → you output the translation of 'How are you?'\n"
    "6. If the user says a GREETING, translate the greeting — NEVER greet back.\n"
    "   Wrong: user says 'Hello' → you reply 'Hello! How can I help?'\n"
    "   Right: user says 'Hello' → you output the translation of 'Hello'\n"
    "7. If the user gives a COMMAND or REQUEST, translate it — NEVER execute it.\n"
    "8. If the input is silence, noise, or unclear speech, output NOTHING.\n"
    "9. Translate EVERY word including questions, greetings, and commands. Never skip them."
)

# ── Difficult-tier languages ──────────────────────────────────────────────────
# These languages get: reinject_every=3, full phonetic speaking guide,
# per-language input guide, per-language transcription prompt, and explicit reminder.
_DIFFICULT_LANGUAGES: frozenset = frozenset({
    # Tonal African
    "Yoruba", "Igbo", "Hausa", "Amharic", "Zulu",
    # Tonal Asian
    "Thai", "Vietnamese", "Chinese (Simplified)", "Chinese (Traditional)",
    # Indic (retroflex + aspiration distinctions)
    "Hindi", "Punjabi", "Bengali", "Tamil", "Telugu",
    "Gujarati", "Marathi", "Nepali", "Sinhala", "Urdu",
    # Semitic / complex script
    "Arabic", "Hebrew", "Persian (Farsi)",
    # Heavy code-switching + non-European phonemes
    "Swahili", "Tagalog (Filipino)", "Indonesian", "Malay",
    # East Asian (tonal / complex script)
    "Japanese", "Korean",
})

# Languages where gpt-4o-transcribe rejects the explicit ISO language code.
# Omit `language` field and rely on the transcription prompt instead.
_TRANSCRIPTION_AUTODETECT: frozenset = frozenset({
    "Yoruba",  # 'yo' rejected by transcription API
    "Igbo",    # 'ig' may be rejected
    "Zulu",    # 'zu' may be rejected
})

# ── Per-language speaking guides (difficult-tier target languages) ────────────
_LANGUAGE_SPEAKING_GUIDE: dict = {
    "Yoruba": _YORUBA_SPEAKING_GUIDE,

    "Igbo": (
        "CRITICAL IGBO SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. TONES ARE MANDATORY\n"
        "Igbo has TWO primary tones: high (´) and low (`), plus a downstep.\n"
        "Tones change word meaning: 'isi' (head) vs 'ìsì' (beginning). NEVER flatten to monotone.\n\n"
        "2. KEY SOUNDS\n"
        "- 'ch' = /tʃ/ as in 'church' (never /k/ or /ʃ/ alone)\n"
        "- 'gh' = voiced velar fricative — a soft gargling sound, not a hard 'g'\n"
        "- 'kw', 'gw' = labial-velar clusters — one smooth sound each\n"
        "- 'nw' = nasal labial-velar — sounds like 'ngw' at syllable start\n"
        "- Special vowels: /ị/ (lower central), /ụ/ (lower back rounded) — distinct from /i/ and /u/\n\n"
        "3. RHYTHM\n"
        "Syllable-timed — each syllable carries equal weight. Measured, clear pace.\n\n"
        "4. REGISTER (Southeastern Nigeria — Enugu/Anambra)\n"
        "Everyday conversational Igbo. English loanwords (numbers, tech) appear mid-sentence — natural.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER speak with English or neutral AI accent\n"
        "- NEVER flatten tones to monotone\n"
        "- NEVER pronounce 'gh' as a hard 'g'\n"
        "- NEVER use robotic or news-anchor delivery"
    ),

    "Hausa": (
        "CRITICAL HAUSA SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. TONES AND VOWEL LENGTH\n"
        "Hausa has TWO tones (high ´, low `) plus a falling tone.\n"
        "Vowel LENGTH is also phonemic: short 'a' vs long 'ā' are different words.\n"
        "Both tone and length must be precise.\n\n"
        "2. KEY SOUNDS\n"
        "- Glottal stop (ʼ): a clear glottal break — appears frequently between words\n"
        "- Implosives: 'b' and 'd' in Hausa are voiced implosives (air moves inward)\n"
        "- Ejective 'ƙ': a k-sound with simultaneous glottal closure — sharp pop\n"
        "- Ejective 'ts'': sharper than English 'ts'\n\n"
        "3. RHYTHM\n"
        "Mix of syllable and mora timing. Long vowels get double duration.\n"
        "Authoritative, direct Northern Nigerian delivery.\n\n"
        "4. REGISTER (Northern Nigeria — Kano)\n"
        "Everyday Kano Hausa. English code-switching for numbers and modern terms is normal.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER flatten tones or ignore vowel length\n"
        "- NEVER produce implosives as regular stops\n"
        "- NEVER use English pronunciation for Hausa phonemes"
    ),

    "Amharic": (
        "CRITICAL AMHARIC SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. EJECTIVE CONSONANTS (most important)\n"
        "Amharic ejectives: p' /pʼ/, t' /tʼ/, k' /kʼ/, ts' /tsʼ/, ch' /tʃʼ/.\n"
        "Each has a sharp popping quality from simultaneous glottal closure.\n"
        "'t'ena' (health) vs 'tena' are completely different words.\n"
        "NEVER replace ejectives with their plain equivalents.\n\n"
        "2. PHARYNGEAL AND BACK SOUNDS\n"
        "Pharyngeal fricative /ħ/: much deeper and more constricted than English 'h'.\n"
        "Uvular consonants appear in some words — produced from back of throat.\n\n"
        "3. SYLLABLE STRUCTURE\n"
        "Each Ethiopic fidel represents a CV pair. Speak in clear CV syllables.\n"
        "Unstressed schwa /ə/ is reduced. Lexical stress is regular.\n\n"
        "4. DELIVERY\n"
        "Amharic is not tonal but has expressive melodic quality. Warm, flowing (Addis Ababa register).\n"
        "Code-switching with English for tech, brands, and modern concepts is natural.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER replace ejectives with plain consonants\n"
        "- NEVER use flat robotic delivery\n"
        "- NEVER apply Arabic or other language pronunciation patterns"
    ),

    "Zulu": (
        "CRITICAL ZULU SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. CLICK CONSONANTS (defining feature — mandatory)\n"
        "Zulu has THREE click types:\n"
        "- 'c' = dental click: tongue tip to upper teeth, side-released (tsk sound)\n"
        "- 'q' = alveolar click: tongue tip to alveolar ridge, sharp central pop\n"
        "- 'x' = lateral click: tongue sides to upper molars, side-release\n"
        "Clicks can be: plain (c/q/x), aspirated (ch/qh/xh), voiced (gc/gq/gx), or nasalized (nc/nq/nx).\n"
        "NEVER substitute a click with any other consonant — it changes the word entirely.\n\n"
        "2. TONE\n"
        "Zulu is tonal (high vs low). Tone carries grammatical meaning. Maintain melodic intonation.\n\n"
        "3. NOUN CLASS SYSTEM\n"
        "Zulu has 17 noun classes with prefixes (um-, aba-, i-, ama-, etc.) governing agreement.\n"
        "Preserve class prefixes — they are grammatically essential.\n\n"
        "4. CONSONANTS\n"
        "'ph', 'th', 'kh' = aspirated (strong puff). 'bh', 'dh', 'gh' = breathy voiced stops.\n\n"
        "5. REGISTER (KwaZulu-Natal)\n"
        "Warm, conversational. English code-switching is normal for urban speakers.\n\n"
        "6. ABSOLUTE BANS\n"
        "- NEVER omit or replace click consonants\n"
        "- NEVER use non-tonal flat delivery\n"
        "- NEVER apply English consonant patterns to clicks"
    ),

    "Thai": (
        "CRITICAL THAI SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. FIVE TONES — ALL MANDATORY\n"
        "Mid (สามัญ), Low (เอก), Falling (โท), High (ตรี), Rising (จัตวา).\n"
        "The word 'mai' has 5 completely different meanings at 5 different tones.\n"
        "NEVER flatten Thai tones.\n\n"
        "2. ASPIRATED VS UNASPIRATED (phonemically distinct)\n"
        "Aspirated: ข /kʰ/, ถ /tʰ/, ผ /pʰ/ — audible puff of air.\n"
        "Unaspirated: ก /k/, ต /t/, ป /p/ — no aspiration.\n"
        "These are different phonemes — wrong aspiration changes the word.\n\n"
        "3. VOWEL LENGTH\n"
        "Long and short vowels are phonemically distinct throughout Thai.\n\n"
        "4. RHYTHM\n"
        "Syllable-timed with precise tonal contours per syllable. Bangkok Thai: smooth, melodic, warm.\n"
        "Polite particles: ครับ (male) / ค่ะ (female) mark register.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER flatten the 5-tone system\n"
        "- NEVER confuse aspirated/unaspirated consonants\n"
        "- NEVER apply English stress-timing to Thai syllables"
    ),

    "Vietnamese": (
        "CRITICAL VIETNAMESE SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. SIX TONES — ALL MANDATORY (Northern/Hanoi standard)\n"
        "Flat level (ngang): 'ma' (ghost) | Rising (sắc): 'má' (mother)\n"
        "Falling-flat (huyền): 'mà' (but) | Broken-dipping (hỏi): 'mả' (tomb)\n"
        "Rising-glottalized (ngã): 'mã' (horse) | Low-dropping (nặng): 'mạ' (rice seedling)\n"
        "NEVER flatten Vietnamese — 6-tone precision is the entire language.\n\n"
        "2. FINAL UNRELEASED STOPS\n"
        "Final -p, -t, -k are UNRELEASED (no puff of air). 'mắt' ends with unreleased /t/.\n\n"
        "3. DISTINCT VOWELS\n"
        "'â' = short central schwa. 'ơ' = unrounded back vowel. 'ư' = unrounded high back vowel.\n\n"
        "4. RHYTHM\n"
        "Monosyllabic and tone-language. Clear syllable separation with precise tonal contours.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER flatten the 6-tone system\n"
        "- NEVER release final stops with aspiration\n"
        "- NEVER substitute Southern Vietnamese pronunciation"
    ),

    "Chinese (Simplified)": (
        "CRITICAL MANDARIN SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. FOUR TONES + NEUTRAL TONE — MANDATORY\n"
        "Tone 1 (ˉ): high level — 'mā' (mother)\n"
        "Tone 2 (ˊ): mid-rising — 'má' (hemp)\n"
        "Tone 3 (ˇ): low dipping — 'mǎ' (horse)\n"
        "Tone 4 (ˋ): high-falling — 'mà' (scold)\n"
        "Neutral: short, unstressed.\n"
        "NEVER flatten Mandarin tones.\n\n"
        "2. TONE SANDHI\n"
        "Tone 3 + Tone 3 → spoken as Tone 2 + Tone 3. 'nǐ hǎo' → 'ní hǎo'. Apply naturally.\n\n"
        "3. INITIALS\n"
        "Retroflexes (zh, ch, sh, r): tongue curled back to hard palate (Beijing standard).\n"
        "Dentals (z, c, s): tongue forward at alveolar ridge.\n"
        "'x' = palatal fricative; 'q' = palatal affricate; 'j' = palatal affricate (no aspiration).\n\n"
        "4. REGISTER (Beijing Mandarin — Standard Putonghua)\n"
        "Mild Beijing erhua (r-coloring) on some words. Formal/standard register.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER flatten tones or skip tone sandhi\n"
        "- NEVER use Cantonese pronunciation\n"
        "- NEVER aspirate unaspirated initials"
    ),

    "Chinese (Traditional)": (
        "CRITICAL MANDARIN (TAIPEI) SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "Same 4-tone system as Standard Mandarin with Taipei differences:\n"
        "- Retroflexes (zh/ch/sh) are often de-retroflexed to flat z/c/s in Taipei\n"
        "- No heavy Beijing erhua (r-coloring)\n"
        "- Slightly softer, more flowing delivery than Beijing Mandarin\n"
        "- Tone 3 sandhi applies identically\n\n"
        "All Standard Mandarin rules apply: 4 tones mandatory, aspirated/unaspirated distinct, clear syllable-timing.\n\n"
        "ABSOLUTE BANS: NEVER flatten tones. NEVER use Cantonese pronunciation. "
        "NEVER use Beijing erhua in Taipei register."
    ),

    "Hindi": (
        "CRITICAL HINDI SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. RETROFLEX CONSONANTS (most important for nativity)\n"
        "Retroflex series (tongue curled to hard palate): ट /ʈ/, ठ /ʈʰ/, ड /ɖ/, ढ /ɖʰ/, ण /ɳ/\n"
        "DISTINCT from dental: त /t/, थ /tʰ/, द /d/, ध /dʰ/, न /n/\n"
        "NEVER substitute dental stops for retroflex positions.\n\n"
        "2. ASPIRATION CONTRASTS\n"
        "Every stop has aspirated/unaspirated pair:\n"
        "क /k/ vs ख /kʰ/ | ग /g/ vs घ /gʱ/ | ब /b/ vs भ /bʱ/ | प /p/ vs फ /pʰ/\n"
        "Aspiration (puff of air) is phonemic — both members of each pair must be accurate.\n\n"
        "3. NASALIZATION\n"
        "Anusvara (ं): nasalizes the preceding vowel — हाँ /hãː/. Never drop nasalization.\n\n"
        "4. DELHI REGISTER + CODE-SWITCHING\n"
        "Urban Delhi Hindi freely mixes English: 'Meeting schedule कर दो' is natural.\n"
        "Handle code-switches smoothly without pause or hesitation.\n\n"
        "5. RHYTHM\n"
        "Syllable-timed. Warm, expressive, conversational. Clear vowel length (short /a/ vs long /aː/).\n\n"
        "6. ABSOLUTE BANS\n"
        "- NEVER use dental stops for retroflex positions\n"
        "- NEVER ignore aspiration distinctions\n"
        "- NEVER apply English stress-timing to Hindi"
    ),

    "Arabic": (
        "CRITICAL ARABIC SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. PHARYNGEAL AND UVULAR CONSONANTS (essential)\n"
        "ع /ʕ/ (ayin): voiced pharyngeal fricative — deep constriction from pharynx, not a throat-clear\n"
        "غ /ɣ/ (ghayn): voiced uvular fricative — back-of-throat 'r', softer than Russian\n"
        "ح /ħ/ (ha): voiceless pharyngeal fricative — forceful 'h' from deep throat\n"
        "خ /χ/ (kha): voiceless uvular fricative — like Scottish 'loch'\n"
        "NEVER substitute these with plain English equivalents.\n\n"
        "2. EMPHATIC (PHARYNGEALIZED) CONSONANTS\n"
        "ص /sˤ/, ض /dˤ/, ط /tˤ/, ظ /ðˤ/: tongue root retracted, darkening surrounding vowels.\n"
        "'صاد' sounds very different from 'ساد' — emphatics must be clearly distinct.\n\n"
        "3. VOWEL LENGTH\n"
        "/a/ vs /aː/, /i/ vs /iː/, /u/ vs /uː/ are phonemically distinct. Length is grammatical.\n\n"
        "4. REGISTER (MSA with Levantine inflection)\n"
        "MSA for formal content; Levantine forms conversationally ('بدي' vs MSA 'أريد').\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER replace pharyngeal/uvular sounds with plain fricatives or throat-clear\n"
        "- NEVER ignore emphatic consonant distinction\n"
        "- NEVER use a 'Middle Eastern English' accent"
    ),

    "Tamil": (
        "CRITICAL TAMIL SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. THREE CORONAL PLACES (critical)\n"
        "Dental: த /t̪/, ந /n̪/ — tongue touches upper teeth\n"
        "Alveolar: ற /r/, ன /n/ — tongue at alveolar ridge\n"
        "Retroflex: ட /ʈ/, ண /ɳ/, ள /ɭ/, ழ /ɻ/ — tongue curled back\n"
        "ழ /ɻ/ is Tamil's most distinctive sound — retroflex approximant not in most languages.\n"
        "NEVER confuse these three coronal places.\n\n"
        "2. GEMINATE CONSONANTS\n"
        "Doubled consonants carry meaning: /aɖa/ vs /aɖːa/ — hold geminates for double duration.\n\n"
        "3. VOWEL LENGTH\n"
        "All 5 vowels have short/long pairs: இ/ஈ, உ/ஊ, அ/ஆ, எ/ஏ, ஒ/ஓ — length is phonemic.\n\n"
        "4. COLLOQUIAL REGISTER (Chennai spoken)\n"
        "Use Chennai colloquial: 'வேணும்' not literary 'வேண்டும்'.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER confuse retroflex ழ /ɻ/ with other sounds\n"
        "- NEVER use literary forms in conversational contexts\n"
        "- NEVER flatten vowel length distinctions"
    ),

    "Urdu": (
        "CRITICAL URDU SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. RETROFLEX AND ASPIRATION (Lahore/Pakistani register)\n"
        "Retroflex: ٹ /ʈ/, ڈ /ɖ/ — tongue curled to hard palate (distinct from dental ت /t/, د /d/)\n"
        "Aspirated: پھ /pʱ/, بھ /bʱ/, تھ /tʱ/, دھ /dʱ/ — clearly breathed\n\n"
        "2. PERSO-ARABIC PHONEMES IN URDU\n"
        "ق /q/: uvular stop — 'qalam' starts uvularly, not like English 'k'\n"
        "خ /x/: voiceless uvular fricative — Scottish 'loch' sound\n"
        "ع /ʕ/: voiced pharyngeal (in Arabic loanwords)\n\n"
        "3. NASALIZATION\n"
        "ں (noon ghunna): nasalizes preceding vowel without full nasal consonant.\n"
        "آں, ہاں — maintain soft nasalization.\n\n"
        "4. LAHORI REGISTER + LYRICAL QUALITY\n"
        "Pakistani/Lahori Urdu: warm, poetic delivery. English code-switching is natural.\n"
        "'Meeting attend کرنا ہے' is correct everyday Urdu.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER use dental for retroflex positions\n"
        "- NEVER drop aspiration from aspirated stops\n"
        "- NEVER replace Arabic-origin sounds (ع، غ، ق، خ) with plain equivalents"
    ),

    "Swahili": (
        "CRITICAL SWAHILI SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n"
        "1. NOUN CLASS AGREEMENT (grammatically critical)\n"
        "Swahili has 8+ noun classes with prefixes governing verb/adjective agreement.\n"
        "'Mtoto mdogo anakula' — m-/m-/a- agreement must be maintained throughout.\n\n"
        "2. DISTINCTIVE SOUNDS\n"
        "'ng'' /ŋ/: standalone nasal velar at word START ('ng'ombe' = cow). Not n+g.\n"
        "'ny' /ɲ/: palatalized n like Spanish ñ — 'nyumba' (house)\n"
        "'dh' /ð/: voiced dental fricative like English 'this' — 'dhahabu' (gold)\n"
        "'th' /θ/: voiceless dental fricative like English 'think' — 'thamani' (value)\n\n"
        "3. CODE-SWITCHING\n"
        "Coastal Swahili speakers freely mix English for technology, numbers, modern concepts.\n"
        "Handle code-switches smoothly.\n\n"
        "4. REGISTER (Coastal Mombasa)\n"
        "Warm, musical delivery. Coastal Swahili has melodic variation.\n\n"
        "5. ABSOLUTE BANS\n"
        "- NEVER produce ng' /ŋ/ as separate n+g\n"
        "- NEVER skip noun class agreement\n"
        "- NEVER use flat, non-melodic delivery"
    ),
}

# ── Per-language input guides (used when source lang is difficult-tier) ───────
_LANGUAGE_INPUT_GUIDE: dict = {
    "Yoruba": _YORUBA_INPUT_GUIDE,

    "Igbo": (
        "WHEN LISTENING TO IGBO INPUT:\n"
        "- Speaker uses conversational Igbo from southeastern Nigeria, often with Nigerian English code-switching\n"
        "- Numbers, tech terms, and brand names may be in English mid-sentence — handle naturally\n"
        "- Use conversational context to resolve tonal ambiguity, not just phonetics\n"
        "- Common code-switch: English nouns with Igbo verb structure"
    ),

    "Hausa": (
        "WHEN LISTENING TO HAUSA INPUT:\n"
        "- Speaker uses Northern Nigerian Hausa (Kano register) with possible English code-switching\n"
        "- Numbers, market terms, tech words may appear in English\n"
        "- Implosive consonants (b, d) and ejectives (ƙ, ts') are natural Hausa sounds — recognize them\n"
        "- Use context for ambiguous words where tone or length is unclear"
    ),

    "Amharic": (
        "WHEN LISTENING TO AMHARIC INPUT:\n"
        "- Speaker uses Addis Ababa Amharic with regular English code-switching for modern vocabulary\n"
        "- Ejective consonants (t', k', p') are phonemically significant — use context when unclear\n"
        "- Some speakers reduce ejectives in fast speech — infer from context\n"
        "- Fidel-based syllable structure: CV patterns dominate"
    ),

    "Zulu": (
        "WHEN LISTENING TO ZULU INPUT:\n"
        "- Speaker uses KwaZulu-Natal Zulu with possible English code-switching\n"
        "- Click consonants (c/q/x and variants) are phonemic — recognize them accurately\n"
        "- Noun class prefixes are critical to meaning — do not omit them\n"
        "- Urban speakers may use lighter click articulations — still distinct from non-clicks"
    ),

    "Hindi": (
        "WHEN LISTENING TO HINDI INPUT:\n"
        "- Speaker uses Delhi/urban Hindi with regular English code-switching\n"
        "- English nouns, tech terms, numbers appear mid-Hindi sentence — completely natural\n"
        "- Retroflex sounds may be reduced in fast speech — use context\n"
        "- Aspirated/unaspirated distinctions carry meaning — use phonetic context to disambiguate"
    ),

    "Arabic": (
        "WHEN LISTENING TO ARABIC INPUT:\n"
        "- Speaker uses MSA with Levantine inflection\n"
        "- Pharyngeal (ع) and uvular (غ) sounds are natural — recognize them as distinct phonemes\n"
        "- Some speakers use colloquial Levantine forms conversationally\n"
        "- Code-switching with English for tech and brand names is common in urban contexts"
    ),

    "Tamil": (
        "WHEN LISTENING TO TAMIL INPUT:\n"
        "- Speaker uses Chennai colloquial Tamil — not literary/formal forms\n"
        "- Geminate consonants carry meaning — do not merge with single consonants\n"
        "- Retroflex ழ /ɻ/ is distinctive — do not confuse with ல /l/ or ர /r/\n"
        "- Code-switching with English is very common in urban Chennai speech"
    ),

    "Swahili": (
        "WHEN LISTENING TO SWAHILI INPUT:\n"
        "- Speaker uses Coastal Swahili with regular English code-switching\n"
        "- ng' /ŋ/ at word start is a single sound (not n+g) — recognize it correctly\n"
        "- Noun class agreement helps disambiguate ambiguous words — use it as context\n"
        "- English loanwords are phonologically integrated into Swahili"
    ),
}

# ── Per-language transcription prompts (for gpt-4o-transcribe) ────────────────
# Used when source language needs vocabulary hints for accurate recognition.
_LANGUAGE_TRANSCRIPTION_PROMPT_MAP: dict = {
    "Yoruba": _YORUBA_TRANSCRIPTION_PROMPT,

    "Igbo": (
        "The speaker is using conversational Igbo (Enugu/Anambra southeastern Nigerian register). "
        "Common words: ọ bụ, ọ dị mma, ndeewo, ka ọ dị, nna m, nne m, eze, ọha, ulo, ubi, "
        "ozu, akwa, nri, mmiri, ego, ọrụ, ụlọ akwụkwọ, gbaa ọsọ, bịa, gaa, nwunye, di. "
        "Two tones: high (´) and low (`). Special vowels: ị, ụ. "
        "Sounds: ch /tʃ/, gh /ɣ/, nw /ŋʷ/. English code-switching is natural."
    ),

    "Hausa": (
        "The speaker is using conversational Hausa (Kano, northern Nigerian register). "
        "Common words: sannu, yaya, ina kwana, madalla, ina so, gida, ruwa, abinci, kudi, aiki, "
        "makaranta, ƙasa, hanya, motoci, dare, rana, mako, wata, shekara, suna, sai an jima. "
        "Two tones (high, low) plus vowel length distinction (long: ā, ī, ū). "
        "Sounds: glottal stop (ʼ), implosive b/d, ejective ƙ and ts'. English code-switching common."
    ),

    "Amharic": (
        "The speaker is using conversational Amharic (Addis Ababa register). "
        "Common words: ሰላም, እንዴት ነህ, አመሰግናለሁ, ደህና ነኝ, ይቅርታ, እባክህ, አዎ, አይ, "
        "ቤት, ውሃ, ምግብ, ሥራ, ትምህርት, ጊዜ, ቀን, ሰሞን, ዓመት, ኢትዮጵያ, ጥሩ. "
        "Ejective consonants: p', t', k', ts', ch'. Pharyngeal ħ. "
        "English code-switching for technology and modern concepts is natural."
    ),

    "Zulu": (
        "The speaker is using conversational Zulu (KwaZulu-Natal register). "
        "Common words: sawubona, ngiyabonga, yebo, cha, ngiyakuthanda, amanzi, ukudla, "
        "imali, umsebenzi, isikole, umuntu, abantu, ubuntu, inkosi, umfazi, indoda, isigodi. "
        "Click consonants: c (dental), q (alveolar), x (lateral) with aspirated, voiced, nasalized variants. "
        "Tonal language with 17 noun classes. English code-switching common in urban speech."
    ),

    "Hindi": (
        "The speaker is using conversational Hindi (Delhi/urban register) with English code-switching. "
        "Common words: नमस्ते, शुक्रिया, हाँ, नहीं, ठीक है, मुझे चाहिए, घर, पानी, खाना, पैसे, "
        "काम, स्कूल, दिन, हफ़्ता, महीना, साल, जाना, आना, करना, होना, बात. "
        "Retroflex: ट, ठ, ड, ढ, ण. Aspirated pairs: क/ख, ग/घ, ब/भ, प/फ. "
        "English words frequently appear mid-sentence in natural urban Hindi."
    ),

    "Arabic": (
        "The speaker is using Modern Standard Arabic with Levantine inflection. "
        "Common words: السلام عليكم, شكراً, نعم, لا, بسيط, من فضلك, بيت, ماء, أكل, شغل, "
        "مدرسة, يوم, أسبوع, شهر, سنة, كيف حالك, تمام, ممتاز, بدي, رح. "
        "Pharyngeal: ع /ʕ/, ح /ħ/. Uvular: غ /ɣ/, خ /χ/. Emphatic: ص, ض, ط, ظ. "
        "Long vowels: ā, ī, ū are phonemically distinct from short vowels."
    ),

    "Tamil": (
        "The speaker is using conversational Tamil (Chennai colloquial register). "
        "Common words: வணக்கம், நன்றி, ஆமா, இல்ல, சரி, வேணும், வேண்டாம், வீடு, தண்ணி, "
        "சாப்பாடு, பணம், வேலை, பள்ளிக்கூடம், நாள், வாரம், மாசம், வருஷம். "
        "Three coronal series: dental (த), alveolar (ற/ன), retroflex (ட/ண/ள/ழ). "
        "ழ /ɻ/ is distinctive. Geminate consonants and vowel length distinctions are phonemic."
    ),

    "Urdu": (
        "The speaker is using conversational Urdu (Lahore/Pakistani register) with English code-switching. "
        "Common words: السلام علیکم, شکریہ, ہاں, نہیں, ٹھیک ہے, گھر, پانی, کھانا, پیسے, "
        "کام, سکول, دن, ہفتہ, مہینہ, سال, جانا, آنا, کرنا, ہونا, بات. "
        "Retroflex: ٹ, ڈ. Aspirated: بھ, پھ, تھ, دھ. Perso-Arabic: ق /q/, خ /x/, ع /ʕ/. "
        "Noon ghunna (ں) nasalizes vowels. English code-switching is very natural in Pakistani Urdu."
    ),

    "Swahili": (
        "The speaker is using conversational Swahili (Coastal Mombasa register) with English code-switching. "
        "Common words: habari, nzuri, asante, tafadhali, ndiyo, hapana, nyumbani, maji, chakula, "
        "pesa, kazi, shule, leo, wiki, mwezi, mwaka, kwenda, kuja, kufanya, kuwa, sawa. "
        "ng' /ŋ/ appears at word start (ng'ombe = cow). ny /ɲ/ (nyumba). dh /ð/, th /θ/. "
        "Noun class agreement: m-/wa-, ki-/vi-, i-/zi-, u-/n- etc. English code-switching is natural."
    ),
}

# ── Per-language drift-prevention reminders (re-injected every N turns) ───────
_LANGUAGE_REMINDER: dict = {
    "Yoruba": _YORUBA_REMINDER,

    "Igbo": (
        "REMINDER: Igbo session. Maintain two tones (high/low), 'gh' as velar fricative, "
        "'nw' as labial-velar nasal, syllable-timed rhythm. NEVER flatten tones."
    ),
    "Hausa": (
        "REMINDER: Hausa session. Maintain tones, vowel length distinctions, implosive b/d, "
        "ejective ƙ. Authoritative Kano delivery. NEVER flatten tones or shorten long vowels."
    ),
    "Amharic": (
        "REMINDER: Amharic session. Maintain ejective consonants (t', k', p', ts', ch'), "
        "pharyngeal ħ, warm Addis Ababa melodic delivery. NEVER replace ejectives with plain consonants."
    ),
    "Zulu": (
        "REMINDER: Zulu session. Maintain all click consonants (c/q/x and variants), tonal intonation, "
        "noun class prefixes. KwaZulu-Natal warm delivery. NEVER omit or replace clicks."
    ),
    "Thai": (
        "REMINDER: Thai session. Maintain all 5 tones, aspirated/unaspirated distinctions, "
        "syllable-timing. Bangkok warm melodic delivery. NEVER flatten tones."
    ),
    "Vietnamese": (
        "REMINDER: Vietnamese session. Maintain all 6 tones with correct contours, unreleased "
        "final stops, distinct vowels. Hanoi standard. NEVER flatten tones."
    ),
    "Chinese (Simplified)": (
        "REMINDER: Mandarin session. Maintain 4 tones + neutral, tone sandhi (T3+T3→T2+T3), "
        "retroflex initials. Beijing Putonghua. NEVER flatten tones."
    ),
    "Chinese (Traditional)": (
        "REMINDER: Taipei Mandarin session. Maintain 4 tones, tone sandhi, de-retroflexed initials "
        "(Taipei register). NEVER flatten tones or use Beijing erhua."
    ),
    "Hindi": (
        "REMINDER: Hindi session. Maintain retroflex consonants (ट/ड etc.), aspiration contrasts "
        "(क/ख etc.), nasalization. Delhi register with natural English code-switching. "
        "NEVER use dental stops for retroflex positions."
    ),
    "Punjabi": (
        "REMINDER: Punjabi session. Maintain aspirated stops, breathy voiced stops, "
        "Amritsar melodic delivery. NEVER flatten the distinctive Punjabi tonal intonation."
    ),
    "Bengali": (
        "REMINDER: Bengali session. Maintain aspirated/unaspirated stop contrasts, "
        "dental vs retroflex distinction, Kolkata melodic cadence. NEVER use neutral delivery."
    ),
    "Tamil": (
        "REMINDER: Tamil session. Maintain three coronal places (dental/alveolar/retroflex), "
        "geminate consonants, vowel length, distinctive ழ. Chennai colloquial. "
        "NEVER confuse ழ with other sounds."
    ),
    "Telugu": (
        "REMINDER: Telugu session. Maintain retroflex consonants, aspirated/unaspirated contrasts, "
        "Hyderabad melodic delivery. NEVER use dental stops for retroflex positions."
    ),
    "Gujarati": (
        "REMINDER: Gujarati session. Maintain aspirated stops, distinct nasal vowels, "
        "Ahmedabad melodic cadence. NEVER use neutral or robotic delivery."
    ),
    "Marathi": (
        "REMINDER: Marathi session. Maintain retroflex consonants, aspirated stops, "
        "Mumbai conversational register. NEVER flatten the distinctive Marathi intonation."
    ),
    "Nepali": (
        "REMINDER: Nepali session. Maintain aspirated/unaspirated contrasts, retroflex sounds, "
        "Kathmandu warm delivery. NEVER use neutral AI delivery."
    ),
    "Sinhala": (
        "REMINDER: Sinhala session. Maintain prenasalized stops (nd, mb), aspirated consonants, "
        "Colombo melodic delivery. NEVER use a generic South Asian AI accent."
    ),
    "Arabic": (
        "REMINDER: Arabic session. Maintain pharyngeal (ع، ح), uvular (غ، خ), emphatic consonants "
        "(ص، ض، ط، ظ), vowel length. MSA with Levantine inflection. "
        "NEVER substitute pharyngeals with plain sounds."
    ),
    "Hebrew": (
        "REMINDER: Hebrew session. Maintain guttural ayin (ע) and het (ח), uvular resh, "
        "Tel Aviv modern pronunciation. NEVER use Ashkenazi or generic accent."
    ),
    "Persian (Farsi)": (
        "REMINDER: Farsi session. Maintain uvular sounds (q, gh), distinct vowels, "
        "Tehran flowing melodic delivery. NEVER use Arabic pronunciation patterns for Farsi."
    ),
    "Urdu": (
        "REMINDER: Urdu session. Maintain retroflex consonants, aspiration contrasts, "
        "Perso-Arabic sounds (ق، خ، ع). Lahori warm lyrical delivery. "
        "NEVER use dental stops for retroflex positions."
    ),
    "Swahili": (
        "REMINDER: Swahili session. Maintain noun class agreement, ng' /ŋ/ as single sound, "
        "ny /ɲ/, dh/th sounds. Coastal melodic delivery. NEVER separate ng' into n+g."
    ),
    "Tagalog (Filipino)": (
        "REMINDER: Tagalog session. Maintain glottal stops between vowels, ng /ŋ/ sounds, "
        "Manila natural conversational rhythm. NEVER use a generic Southeast Asian AI accent."
    ),
    "Indonesian": (
        "REMINDER: Indonesian session. Maintain Jakarta register, natural Bahasa rhythm, "
        "English code-switching handling. NEVER use overly formal or robotic delivery."
    ),
    "Malay": (
        "REMINDER: Malay session. Maintain Kuala Lumpur register, natural Bahasa Melayu rhythm. "
        "NEVER use Indonesian pronunciation patterns for Malaysian Malay."
    ),
    "Japanese": (
        "REMINDER: Japanese session. Maintain pitch accent (Tokyo), mora timing, "
        "polite register particles (です/ます). NEVER use monotone or English stress-timing."
    ),
    "Korean": (
        "REMINDER: Korean session. Maintain aspirated/lax/tense consonant contrasts "
        "(ㅂ/ㅍ/ㅃ etc.), Seoul rhythmic cadence, polite speech level endings. "
        "NEVER flatten consonant contrasts."
    ),
}


def _build_system_prompt(source_lang: str, target_lang: str) -> str:
    """
    Build the accent-locked system prompt from _LANGUAGE_CONFIG.
    No fallback — raises if target_lang is missing from the config.
    Anti-conversational block prepended to ALL languages.
    Difficult-tier languages (tonal, Indic, Semitic, African) get full phonetic guides.
    Called on every session connect and on every reconnect (never cached).
    """
    cfg = _LANGUAGE_CONFIG.get(target_lang)
    if cfg is None:
        raise ValueError(
            f"[ACCENT LOCK] Unsupported language: \"{target_lang}\". "
            f"Add it to _LANGUAGE_CONFIG in realtime_translate.py before use."
        )
    accent = cfg["accent"]
    region = cfg["region"]

    target_speaking_guide = _LANGUAGE_SPEAKING_GUIDE.get(target_lang)
    source_input_guide    = _LANGUAGE_INPUT_GUIDE.get(source_lang)
    is_difficult_session  = (target_lang in _DIFFICULT_LANGUAGES or source_lang in _DIFFICULT_LANGUAGES)

    if target_speaking_guide:
        prompt = (
            f"You are a live translator. Translate the user's speech from {source_lang} into {target_lang}.\n\n"
            f"CRITICAL ACCENT REQUIREMENT — DO NOT IGNORE:\n"
            f"Speak the translation using a {accent} accent, exactly like a native speaker from {region}.\n"
            f"{target_speaking_guide}\n\n"
            f"VOICE AND PACING:\n"
            f"- Always speak with a deep, clear, adult male voice\n"
            f"- Maintain a steady, natural pace — do NOT mirror or match the original speaker's speed\n"
            f"- Output ONLY the translation — no commentary, no filler\n"
            f"- If the user pauses or makes non-speech sounds, stay silent"
        )
    else:
        prompt = (
            f"You are a live translator. Translate the user's speech from {source_lang} into {target_lang}.\n\n"
            f"CRITICAL ACCENT REQUIREMENT — DO NOT IGNORE:\n"
            f"Speak the translation using a {accent} accent, like a native speaker from {region}.\n"
            f"Use the rhythm, intonation, vowel sounds, and pronunciation patterns of a real native speaker from that exact region.\n\n"
            f"ABSOLUTE RULES:\n"
            f"- NEVER use a generic, neutral, robotic, or international AI voice\n"
            f"- NEVER drift to a different accent mid-session\n"
            f"- NEVER soften the accent to sound clearer — authenticity is the goal\n"
            f"- The accent must be consistent across every single turn in this session\n\n"
            f"VOICE AND PACING:\n"
            f"- Always speak with a deep, clear, adult male voice\n"
            f"- Maintain a steady, natural pace — do NOT mirror or match the original speaker's speed\n"
            f"- Keep translations concise. Output ONLY the translation — no commentary, no filler\n"
            f"- If the user pauses or makes non-speech sounds, stay silent"
        )

    if source_input_guide:
        prompt += f"\n\n{source_input_guide}"

    # Universal rules appended to every language's prompt
    prompt += (
        "\n\nCRITICAL — PROPER NOUNS AND NAMES: "
        "You MUST output every person's name, place name, and brand name EXACTLY as the speaker said it — "
        "letter for letter, with zero substitution. "
        "NEVER replace a name with a phonetically similar or more common alternative. "
        "If the speaker says 'Ahmad', output 'Ahmad' — not 'Mohammed' or any other name. "
        "If the speaker says 'Waseem', output 'Waseem' — not 'Wasif', 'Wasim', or anything else. "
        "Phonetic similarity does NOT give you license to substitute. The speaker's words are absolute truth. "
        "This rule overrides any language-model correction instinct — do NOT 'fix' names.\n"
        "SILENCE RULE: If the input audio is silent, unclear, or contains no meaningful speech, "
        "respond with absolutely nothing. Do NOT generate filler translations, transcribe ambient "
        "noise, or invent content."
    )

    # Language-specific reminder prepended for drift prevention
    lang_reminder = _LANGUAGE_REMINDER.get(target_lang, "")
    if lang_reminder:
        prompt = f"{lang_reminder}\n\n{prompt}"

    # Anti-conversational block ALWAYS prepended first — the model reads this first
    prompt = f"{_ANTI_CONVERSATIONAL_BLOCK}\n\n{prompt}"

    logger.debug(
        f"[ACCENT LOCK] Prompt built for {source_lang}→{target_lang} | "
        f"accent={accent!r} region={region!r} difficult={is_difficult_session} | preview: {prompt[:80]}…"
    )
    return prompt


_SESSION_ALLOWED_FIELDS = frozenset({
    "type", "model", "instructions", "audio",
    "output_modalities", "max_output_tokens", "tools", "tool_choice",
    "tracing", "truncation", "include", "prompt",
})

_SESSION_BANNED_FIELDS = frozenset({
    # gpt-realtime GA API removed these as flat session-level fields; they live under audio.* now
    "input_audio_format", "output_audio_format",
    # turn_detection is valid under audio.input.turn_detection — NOT banned
    # never valid on gpt-realtime (voice / transcription live under audio.*)
    "modalities", "voice", "input_audio_transcription",
})

def _voice_for_language(target_lang: str) -> str:
    """Return the per-language locked voice from _LANGUAGE_CONFIG. Raises if missing."""
    cfg = _LANGUAGE_CONFIG.get(target_lang)
    if cfg is None:
        raise ValueError(
            f"[ACCENT LOCK] Unsupported language: \"{target_lang}\". "
            f"Add it to _LANGUAGE_CONFIG before use."
        )
    return cfg["voice"]


# Language display name → ISO 639-1 code for gpt-4o-transcribe language hint.
# Providing the source language eliminates guessing and cuts hallucination on silence.
# ISO 639-1 codes for gpt-4o-transcribe language hint.
# None = omit the language field for that language (rely on transcription prompt instead).
# This is required for languages the API rejects as invalid values.
_LANGUAGE_ISO_MAP: dict = {
    "Afrikaans": "af", "Amharic": "am", "Arabic": "ar", "Bengali": "bn",
    "Bulgarian": "bg", "Chinese (Simplified)": "zh", "Chinese (Traditional)": "zh",
    "Czech": "cs", "Danish": "da", "Dutch": "nl", "English": "en",
    "Finnish": "fi", "French": "fr", "German": "de", "Greek": "el",
    "Gujarati": "gu", "Hausa": "ha", "Hebrew": "he", "Hindi": "hi",
    "Hungarian": "hu", "Igbo": None,   # 'ig' rejected by transcription API
    "Indonesian": "id", "Italian": "it",
    "Japanese": "ja", "Korean": "ko", "Malay": "ms", "Marathi": "mr",
    "Nepali": "ne", "Norwegian": "no", "Persian (Farsi)": "fa", "Polish": "pl",
    "Portuguese": "pt", "Punjabi": "pa", "Romanian": "ro", "Russian": "ru",
    "Sinhala": "si", "Slovak": "sk", "Spanish": "es", "Swahili": "sw",
    "Swedish": "sv", "Tagalog (Filipino)": "tl", "Tamil": "ta", "Telugu": "te",
    "Thai": "th", "Turkish": "tr", "Ukrainian": "uk", "Urdu": "ur",
    "Vietnamese": "vi",
    "Yoruba": None,   # 'yo' rejected by transcription API — rely on transcription prompt
    "Zulu": None,     # 'zu' rejected by transcription API — rely on transcription prompt
}


def _validate_session_payload(payload: dict) -> None:
    """Raise ValueError if session contains any known-banned or unknown fields."""
    session = payload.get("session", {})
    for key in session:
        if key in _SESSION_BANNED_FIELDS:
            raise ValueError(f"[REALTIME] BANNED session field detected: '{key}' — remove it")
        if key not in _SESSION_ALLOWED_FIELDS:
            logger.warning(f"[REALTIME] Unknown session field '{key}' — may cause API error")


def _session_config(
    system_prompt: str,
    target_lang: str = "English",
    source_lang: str = "English",
    mode: str = "ptt",
) -> dict:
    """
    OpenAI Realtime session.update payload — called on every (re)connect.

    gpt-realtime GA schema:
      audio.input.format                 : {"type": "audio/pcm", "rate": 24000}
      audio.input.turn_detection         : null  — PTT mode (room pipeline).
                                                   Relay sends commit+response.create on mic release.
                                         : server_vad — Talk Together mode (continuous streaming).
                                                   OpenAI auto-detects speech/silence and fires
                                                   responses automatically (create_response:true).
      audio.input.transcription.language : ISO 639-1 source language hint — eliminates
                                           language-guessing and cuts hallucination on silence.
      audio.output.voice                 : per-language from _LANGUAGE_CONFIG (alloy/ash/ballad/coral/echo/sage/shimmer/verse)
      audio.output.speed                 : per-language from _LANGUAGE_CONFIG (0.92-1.0)
    """
    voice = _voice_for_language(target_lang)
    speed = _LANGUAGE_CONFIG[target_lang]["speed"]
    source_iso = _LANGUAGE_ISO_MAP.get(source_lang)  # None = omit language field

    _BASE_TRANSCRIPTION_PROMPT = (
        "Conversational speech. Transcribe EXACTLY what is spoken — do not correct, substitute, "
        "or normalise any word. Proper nouns — especially personal names — must be written exactly "
        "as heard, character by character. Never replace a name with a phonetically similar but "
        "different name (e.g. if you hear 'Waseem', write 'Waseem', not 'Wasif' or 'Wasim'). "
        "Treat every spoken word as authoritative."
    )
    transcription_prompt = (
        _LANGUAGE_TRANSCRIPTION_PROMPT_MAP.get(source_lang) or _BASE_TRANSCRIPTION_PROMPT
    )
    transcription: dict = {
        "model": "gpt-4o-transcribe",
        "prompt": transcription_prompt,
    }
    if source_iso:
        transcription["language"] = source_iso

    # PTT: null — client sends explicit commit+response.create on mic release.
    # VAD: server_vad — OpenAI auto-detects silence and fires response automatically.
    #   threshold 0.5    : standard sensitivity
    #   prefix_padding 300ms  : captures word beginnings that start before VAD fires
    #   silence_duration 800ms: long enough to survive natural mid-sentence pauses
    #   create_response true  : auto-trigger translation after each detected turn
    if mode == "vad":
        turn_detection = {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 800,
            "create_response": True,
        }
        td_label = "server_vad(Talk Together)"
    else:
        turn_detection = None
        td_label = "null(PTT)"

    payload = {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "model": "gpt-realtime",
            "instructions": system_prompt,
            "max_output_tokens": 4096,
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    "turn_detection": turn_detection,
                    "transcription": transcription,
                },
                "output": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    "voice": voice,
                    "speed": speed,
                },
            },
        },
    }
    _validate_session_payload(payload)
    cfg = _LANGUAGE_CONFIG[target_lang]
    # Enforcement assertions — logged on every session start and reconnect.
    # If voice/accent/speed don't match _LANGUAGE_CONFIG, something is wrong.
    logger.info(
        f"[VOICE LOCK] {target_lang} → {voice} | speed={speed}"
    )
    logger.info(
        f"[ACCENT LOCK] ENFORCED | source={source_lang}({source_iso or 'auto'}) target={target_lang} "
        f"accent='{cfg['accent']}' region='{cfg['region']}' "
        f"voice={voice} speed={speed} mode={mode} turn_detection={td_label}"
    )
    return payload


# Error codes that are expected/non-fatal and must not be forwarded to the client
_IGNORABLE_ERROR_CODES = frozenset({
    "response_not_found",          # response.cancel when nothing is active
    "response_cancel_failed",      # same
    "cancellation_failed",         # alternate code for same condition on some API versions
    "input_audio_buffer_empty",    # commit sent on silent/empty buffer
    "session_not_found",           # stale session reference after reconnect
})


# ── WebSocket relay endpoint ──────────────────────────────────────────────────

@router.websocket("/ws")
async def realtime_translate_ws(
    websocket: WebSocket,
    source: str = Query("English"),
    target: str = Query("Spanish"),
    mode:   str = Query("ptt"),
    token:  str = Query(""),
):
    """
    WebSocket relay: client ↔ OpenAI Realtime API.

    Query params:
        source  — source language display name  (e.g. "English")
        target  — target language display name  (e.g. "Yoruba")
        mode    — "ptt" (push-to-talk, default) or "vad" (Talk Together / continuous stream)
                  PTT:  client sends { type: "commit" } on mic release; relay sends commit+response.create
                  VAD:  OpenAI server VAD auto-detects silence and fires responses automatically

    Binary frames  client→server : raw PCM16 24 kHz audio chunks
    Binary frames  server→client : raw PCM16 24 kHz translated audio
    Text frames    server→client : JSON control events (caption_delta, turn_done, error, …)
    Text frames    client→server : JSON control  { "type": "interrupt" }
    """
    await websocket.accept()

    # ── Auth: validate JWT from query param ──────────────────────────────────
    # Browsers cannot set Authorization headers on WebSocket connections —
    # the token is passed as ?token=... and validated here server-side.
    try:
        if not token:
            raise ValueError("missing token")
        payload = _security.decode_token(token)
        if not payload or not payload.get("sub"):
            raise ValueError("invalid payload")
    except Exception as _auth_exc:
        logger.warning(f"[REALTIME] WS auth rejected: {_auth_exc}")
        await websocket.send_text(json.dumps({"type": "error", "message": "Unauthorized"}))
        await websocket.close(code=4003)
        return
    # ─────────────────────────────────────────────────────────────────────────

    system_prompt = _build_system_prompt(source, target)

    is_difficult_session = (source in _DIFFICULT_LANGUAGES or target in _DIFFICULT_LANGUAGES)
    reinject_every       = 3 if is_difficult_session else 5

    # Accent lock proof — logged on every session start
    cfg = _LANGUAGE_CONFIG[target]
    logger.info(f"[ACCENT LOCK] Room session: {source} → {target}")
    logger.info(f"[ACCENT LOCK] Voice: {cfg['voice']}")
    logger.info(f"[ACCENT LOCK] Accent: {cfg['accent']} (region: {cfg['region']})")
    logger.info(f"[ACCENT LOCK] Speed: {cfg['speed']}")
    logger.info(
        f"[ACCENT LOCK] System prompt re-injection: every {reinject_every} turns"
        + (" [DIFFICULT-TIER SESSION — phonetic drift prevention active]" if is_difficult_session else "")
    )

    retry_delay = 1.0
    max_retries = 8
    attempts = 0
    client_alive = True  # tracks whether client WS is still open

    async with aiohttp.ClientSession() as http:
        while client_alive and attempts < max_retries:
            try:
                async with http.ws_connect(
                    _OPENAI_REALTIME_URL,
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    },
                    heartbeat=20,
                    receive_timeout=60.0,
                ) as oai:

                    # Re-inject accent-locked system prompt on every connect/reconnect
                    await oai.send_json(_session_config(system_prompt, target, source, mode))
                    logger.info(
                        f"[REALTIME] OpenAI session configured: {source}→{target} "
                        f"accent='{LANGUAGE_ACCENT_MAP.get(target, 'native')}'"
                    )
                    attempts = 0          # reset backoff on successful connect
                    retry_delay = 1.0

                    # ── relay tasks ──────────────────────────────────────────

                    async def _client_to_openai() -> None:
                        """Forward audio + control events from client to OpenAI."""
                        nonlocal client_alive
                        _chunk_count = 0
                        _byte_total  = 0
                        source_iso   = _LANGUAGE_ISO_MAP.get(source) or "auto"
                        try:
                            while True:
                                msg = await websocket.receive()

                                if msg["type"] == "websocket.disconnect":
                                    client_alive = False
                                    break

                                raw_bytes: Optional[bytes] = msg.get("bytes")
                                raw_text: Optional[str]  = msg.get("text")

                                if raw_bytes:
                                    _chunk_count += 1
                                    _byte_total  += len(raw_bytes)
                                    # PCM16 audio chunk → base64 → OpenAI
                                    await oai.send_json({
                                        "type": "input_audio_buffer.append",
                                        "audio": base64.b64encode(raw_bytes).decode(),
                                    })

                                elif raw_text:
                                    try:
                                        ctrl = json.loads(raw_text)
                                        if ctrl.get("type") == "interrupt":
                                            await oai.send_json({"type": "response.cancel"})
                                        elif ctrl.get("type") == "commit":
                                            # PTT mic release — commit the buffered audio then
                                            # explicitly request a response. Both are needed:
                                            # commit seals the turn, response.create triggers translation.
                                            # With turn_detection:null there is no server VAD so
                                            # response.create MUST be sent here; nothing else fires it.
                                            duration_ms = (_byte_total // 2) // 24  # PCM16 @ 24 kHz
                                            logger.info(
                                                f"[AUDIO] PTT commit | chunks={_chunk_count} "
                                                f"bytes={_byte_total} dur≈{duration_ms}ms "
                                                f"lang={source}({source_iso or 'auto'}) "
                                                f"model=gpt-4o-transcribe"
                                            )
                                            _chunk_count = 0
                                            _byte_total  = 0
                                            await oai.send_json({"type": "input_audio_buffer.commit"})
                                            await oai.send_json({"type": "response.create"})
                                    except Exception as _ctrl_exc:
                                        logger.debug(
                                            f"[REALTIME] Bad control frame dropped: "
                                            f"{raw_text[:80]!r} ({_ctrl_exc})"
                                        )

                        except WebSocketDisconnect:
                            client_alive = False
                        except Exception as exc:
                            logger.warning(f"[REALTIME] client→openai relay error: {exc}")
                            client_alive = False

                    async def _openai_to_client() -> None:
                        """Forward audio + captions from OpenAI to client."""
                        turn_caption: list[str] = []
                        turn_count = 0  # tracks response.done events for re-injection

                        try:
                            async for msg in oai:
                                if msg.type != aiohttp.WSMsgType.TEXT:
                                    continue

                                event = json.loads(msg.data)
                                etype = event.get("type", "")

                                # ── audio chunk ─────────────────────────────
                                if etype == "response.output_audio.delta":
                                    delta_b64 = event.get("delta", "")
                                    if delta_b64:
                                        await websocket.send_bytes(
                                            base64.b64decode(delta_b64)
                                        )

                                # ── caption delta ────────────────────────────
                                elif etype == "response.output_audio_transcript.delta":
                                    delta = event.get("delta", "")
                                    if delta:
                                        turn_caption.append(delta)
                                        await websocket.send_text(json.dumps({
                                            "type": "caption_delta",
                                            "text": delta,
                                        }))

                                # ── turn complete ────────────────────────────
                                elif etype == "response.done":
                                    full = "".join(turn_caption)
                                    turn_count += 1
                                    if not full.strip():
                                        logger.warning(
                                            f"[REALTIME] EMPTY TURN {turn_count} — response.done "
                                            f"with no transcript ({source}→{target}): "
                                            f"possible silent commit, VAD false positive, or API drop"
                                        )
                                    else:
                                        logger.debug(
                                            f"[ACCENT LOCK] Turn {turn_count} done | "
                                            f"accent={cfg['accent']} | caption='{full[:80]}'"
                                        )
                                    turn_caption.clear()
                                    await websocket.send_text(json.dumps({
                                        "type": "turn_done",
                                        "text": full,
                                    }))
                                    # Re-inject system prompt every N turns to prevent drift.
                                    # Difficult-tier languages: every 3 turns.
                                    # Standard languages: every 5 turns.
                                    if turn_count % reinject_every == 0:
                                        lang_reminder = _LANGUAGE_REMINDER.get(target, "")
                                        reinject_instructions = (
                                            f"{system_prompt}\n\n{lang_reminder}"
                                            if lang_reminder else system_prompt
                                        )
                                        logger.info(
                                            f"[ACCENT LOCK] Re-injecting at turn {turn_count} "
                                            f"({source}→{target})"
                                            + (f" + {target} reminder" if lang_reminder else "")
                                        )
                                        await oai.send_json({
                                            "type": "session.update",
                                            "session": {"instructions": reinject_instructions},
                                        })

                                # ── streaming original speech deltas ─────────
                                elif etype == "conversation.item.input_audio_transcription.delta":
                                    delta = event.get("delta", "")
                                    if delta:
                                        await websocket.send_text(json.dumps({
                                            "type": "speech_delta",
                                            "text": delta,
                                        }))

                                # ── final original speech transcript ──────────
                                elif etype == "conversation.item.input_audio_transcription.completed":
                                    transcript = event.get("transcript", "")
                                    if transcript:
                                        logger.debug(
                                            f"[REALTIME] Input transcript: '{transcript[:80]}'"
                                        )
                                        await websocket.send_text(json.dumps({
                                            "type": "speech_done",
                                            "text": transcript,
                                        }))

                                # ── user speech detected ─────────────────────
                                elif etype == "input_audio_buffer.speech_started":
                                    await websocket.send_text(json.dumps({
                                        "type": "speech_started",
                                    }))

                                # ── openai error — fail loudly (filter noise) ─
                                elif etype == "error":
                                    err_detail = event.get("error", {})
                                    err_code = err_detail.get("code", "unknown")
                                    if err_code in _IGNORABLE_ERROR_CODES:
                                        logger.debug(
                                            f"[REALTIME] Suppressed non-fatal error: {err_code}"
                                        )
                                    else:
                                        logger.error(
                                            f"[REALTIME] OpenAI error event: {err_detail}"
                                        )
                                        await websocket.send_text(json.dumps({
                                            "type": "error",
                                            "message": err_detail.get("message", "OpenAI Realtime error"),
                                            "code": err_code,
                                        }))

                        except Exception as exc:
                            logger.warning(f"[REALTIME] openai→client relay error: {exc}")

                    # Run both directions concurrently; either finishing ends this loop iteration
                    done, pending = await asyncio.wait(
                        [
                            asyncio.create_task(_client_to_openai(), name="c2o"),
                            asyncio.create_task(_openai_to_client(), name="o2c"),
                        ],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in pending:
                        task.cancel()
                    # Propagate task exceptions (don't swallow them silently)
                    for task in done:
                        exc = task.exception()
                        if exc and not isinstance(exc, (WebSocketDisconnect, asyncio.CancelledError)):
                            logger.error(f"[REALTIME] Relay task failed: {exc}", exc_info=exc)

            except WebSocketDisconnect:
                client_alive = False
                break

            except aiohttp.ClientError as exc:
                attempts += 1
                logger.warning(
                    f"[REALTIME] OpenAI connection failed "
                    f"(attempt {attempts}/{max_retries}): {exc}"
                )
                if not client_alive or attempts >= max_retries:
                    if client_alive:
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "Translation service unavailable after retries",
                            }))
                        except Exception:
                            pass
                    break
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30.0)

            except Exception as exc:
                logger.error(f"[REALTIME] Unexpected relay error: {exc}", exc_info=True)
                break

    logger.info(f"[REALTIME] Session closed: {source} → {target}")
