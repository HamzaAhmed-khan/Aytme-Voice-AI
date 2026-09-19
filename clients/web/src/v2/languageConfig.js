/**
 * languageConfig.js — Hardcoded accent-lock + per-language voice system
 *
 * Single source of truth for every supported language (mirrors realtime_translate.py).
 * The AI never decides the accent or voice — this file does.
 * To change a voice: edit this file AND realtime_translate.py _LANGUAGE_CONFIG.
 *
 * Available voices (gpt-realtime only supports these 8):
 *   alloy   — neutral, balanced, formal
 *   ash     — crisp, precise (best for tonal languages: Thai, Vietnamese, Mandarin)
 *   ballad  — melodic, warm, flowing (Romance + Nordic + Bengali)
 *   coral   — warm, friendly, conversational (SEA + Turkish)
 *   echo    — deep, authoritative (Arabic, Russian)
 *   sage    — calm, measured, deliberate (Japanese, Korean, Slavic)
 *   shimmer — bright, energetic, upbeat (Hindi, Punjabi, Swahili)
 *   verse   — versatile, expressive, tonal-adaptive (tonal African, Indic, Mediterranean)
 *
 * Speed is per-language: tonal/complex-script languages get 0.92-0.95 for clarity.
 * If a language is missing from this map, getLanguageConfig() throws loudly.
 */

export const LANGUAGE_CONFIG = {
  // alloy: neutral, formal, balanced — Germanic / neutral NA
  "English":               { accent: "neutral North American English",                   voice: "alloy",   region: "USA",           speed: 1.0  },
  "German":                { accent: "standard Hochdeutsch German",                      voice: "alloy",   region: "Hannover",      speed: 1.0  },
  "Dutch":                 { accent: "standard Dutch",                                   voice: "alloy",   region: "Randstad",      speed: 1.0  },
  "Afrikaans":             { accent: "South African Afrikaans",                          voice: "alloy",   region: "Cape Town",     speed: 1.0  },

  // ash: crisp precision — preserves tonal distinctions in high-tone-count languages
  "Chinese (Simplified)":  { accent: "Beijing Mandarin",                                 voice: "ash",     region: "Beijing",       speed: 0.95 },
  "Chinese (Traditional)": { accent: "Taipei Mandarin",                                  voice: "ash",     region: "Taipei",        speed: 0.95 },
  "Thai":                  { accent: "Bangkok Thai",                                     voice: "ash",     region: "Bangkok",       speed: 0.95 },
  "Vietnamese":            { accent: "northern Vietnamese",                              voice: "ash",     region: "Hanoi",         speed: 0.95 },
  "Hebrew":                { accent: "Tel Aviv Hebrew",                                  voice: "ash",     region: "Tel Aviv",      speed: 0.95 },

  // ballad: melodic, warm, flowing — Romance + Nordic pitch-accent + South Asian melodic
  "Spanish":               { accent: "Latin American Spanish",                           voice: "ballad",  region: "Mexico City",   speed: 1.0  },
  "Portuguese":            { accent: "Brazilian Portuguese",                             voice: "ballad",  region: "São Paulo",     speed: 1.0  },
  "Italian":               { accent: "standard Italian",                                 voice: "ballad",  region: "Rome",          speed: 1.0  },
  "Romanian":              { accent: "Bucharest Romanian",                               voice: "ballad",  region: "Bucharest",     speed: 0.95 },
  "Ukrainian":             { accent: "Kyiv Ukrainian",                                   voice: "ballad",  region: "Kyiv",          speed: 0.95 },
  "Swedish":               { accent: "Stockholm Swedish",                                voice: "ballad",  region: "Stockholm",     speed: 1.0  },
  "Danish":                { accent: "Copenhagen Danish",                                voice: "ballad",  region: "Copenhagen",    speed: 1.0  },
  "Norwegian":             { accent: "Oslo Norwegian Bokmål",                            voice: "ballad",  region: "Oslo",          speed: 1.0  },
  "Bengali":               { accent: "native Bengali",                                   voice: "ballad",  region: "Kolkata",       speed: 0.95 },
  "Nepali":                { accent: "Kathmandu Nepali",                                 voice: "ballad",  region: "Kathmandu",     speed: 0.95 },

  // coral: warm, friendly, conversational — Southeast Asian + Turkish
  "Indonesian":            { accent: "Jakarta Bahasa Indonesia",                         voice: "coral",   region: "Jakarta",       speed: 1.0  },
  "Malay":                 { accent: "Kuala Lumpur Bahasa Melayu",                       voice: "coral",   region: "Kuala Lumpur",  speed: 1.0  },
  "Tagalog (Filipino)":    { accent: "Manila Tagalog",                                   voice: "coral",   region: "Manila",        speed: 1.0  },
  "Turkish":               { accent: "Istanbul Turkish",                                 voice: "coral",   region: "Istanbul",      speed: 1.0  },

  // echo: deep, authoritative resonance — formal Semitic + Slavic gravitas
  "Arabic":                { accent: "Modern Standard Arabic, Levantine inflection",     voice: "echo",    region: "Levant",        speed: 0.95 },
  "Russian":               { accent: "Moscow Russian",                                   voice: "echo",    region: "Moscow",        speed: 0.95 },

  // sage: calm, measured, deliberate — polite East Asian + precise Slavic/Finno-Ugric
  "Japanese":              { accent: "Tokyo Japanese",                                   voice: "sage",    region: "Tokyo",         speed: 0.95 },
  "Korean":                { accent: "Seoul Korean",                                     voice: "sage",    region: "Seoul",         speed: 0.95 },
  "Czech":                 { accent: "Prague Czech",                                     voice: "sage",    region: "Prague",        speed: 0.95 },
  "Slovak":                { accent: "Bratislava Slovak",                                voice: "sage",    region: "Bratislava",    speed: 0.95 },
  "Polish":                { accent: "Warsaw Polish",                                    voice: "sage",    region: "Warsaw",        speed: 0.95 },
  "Finnish":               { accent: "Helsinki Finnish",                                 voice: "sage",    region: "Helsinki",      speed: 0.95 },
  "Hungarian":             { accent: "Budapest Hungarian",                               voice: "sage",    region: "Budapest",      speed: 0.95 },
  "Bulgarian":             { accent: "Sofia Bulgarian",                                  voice: "sage",    region: "Sofia",         speed: 0.95 },

  // shimmer: bright, energetic, upbeat — lyrical Indic + East African melody
  "Hindi":                 { accent: "native Hindi",                                     voice: "shimmer", region: "Delhi",         speed: 0.95 },
  "Punjabi":               { accent: "Amritsar Punjabi",                                 voice: "shimmer", region: "Amritsar",      speed: 0.95 },
  "Swahili":               { accent: "coastal Swahili",                                  voice: "shimmer", region: "Mombasa",       speed: 0.95 },

  // verse: versatile, expressive, tonal-adaptive — tonal African, poetic Indic/Semitic, Mediterranean
  "Yoruba":                { accent: "native Yoruba",                                    voice: "verse",   region: "Lagos",         speed: 0.92 },
  "Igbo":                  { accent: "southeastern Nigerian Igbo",                       voice: "verse",   region: "Enugu",         speed: 0.95 },
  "Hausa":                 { accent: "northern Nigerian Hausa",                          voice: "verse",   region: "Kano",          speed: 0.95 },
  "Amharic":               { accent: "native Amharic",                                   voice: "verse",   region: "Addis Ababa",   speed: 0.95 },
  "Zulu":                  { accent: "native Zulu",                                      voice: "verse",   region: "KwaZulu-Natal", speed: 0.95 },
  "French":                { accent: "Parisian French",                                  voice: "verse",   region: "Paris",         speed: 1.0  },
  "Greek":                 { accent: "Athens Greek",                                     voice: "verse",   region: "Athens",        speed: 0.95 },
  "Gujarati":              { accent: "Ahmedabad Gujarati",                               voice: "verse",   region: "Ahmedabad",     speed: 0.95 },
  "Marathi":               { accent: "Mumbai Marathi",                                   voice: "verse",   region: "Mumbai",        speed: 0.95 },
  "Persian (Farsi)":       { accent: "Tehran Farsi",                                     voice: "verse",   region: "Tehran",        speed: 0.95 },
  "Urdu":                  { accent: "native Urdu",                                      voice: "verse",   region: "Lahore",        speed: 0.95 },
  "Tamil":                 { accent: "Chennai Tamil",                                    voice: "verse",   region: "Chennai",       speed: 0.95 },
  "Telugu":                { accent: "Hyderabad Telugu",                                 voice: "verse",   region: "Hyderabad",     speed: 0.95 },
  "Sinhala":               { accent: "Colombo Sinhala",                                  voice: "verse",   region: "Colombo",       speed: 0.95 },
};

/**
 * Deterministic config resolver.
 * Throws if the language is not in the map — no silent fallback.
 */
export function getLanguageConfig(targetLanguage) {
  if (!targetLanguage || typeof targetLanguage !== "string") {
    throw new Error(`[ACCENT LOCK] Invalid target language: ${targetLanguage}`);
  }

  const config = LANGUAGE_CONFIG[targetLanguage];

  if (!config) {
    throw new Error(
      `[ACCENT LOCK] Unsupported language: "${targetLanguage}". ` +
      `Add it to LANGUAGE_CONFIG in languageConfig.js before use.`
    );
  }

  return config;
}

/**
 * Build the accent-locked system prompt from the hardcoded config.
 * The AI obeys this string — it never invents or softens the accent.
 */
// ── Yoruba-specific prompt blocks (mirrors realtime_translate.py) ────────────
const _YORUBA_REMINDER =
  `REMINDER: This session is Yoruba. Maintain authentic Lagos native accent, ` +
  `three-tone system (high ´, mid, low \`), correct "gb" pronunciation, and natural ` +
  `syllable-timed rhythm. Do NOT drift to a neutral AI voice under any circumstances.`;

const _YORUBA_SPEAKING_GUIDE =
  `\nCRITICAL YORUBA SPEAKING INSTRUCTIONS — FOLLOW EXACTLY:\n\n` +
  `1. TONES ARE MANDATORY\n` +
  `Yoruba is a tonal language with THREE tones: high (´), mid (unmarked), and low (\`).\n` +
  `Tones change word meaning entirely. You MUST pronounce every tone correctly.\n\n` +
  `2. PRONUNCIATION RULES\n` +
  `  - "gb" is a single voiced labial-velar plosive — NOT "g" + "b"\n` +
  `  - "ọ" = "aw" in "law" | "ẹ" = "eh" in "bed" | "ṣ" = "sh" in "shoe"\n` +
  `  - Roll/tap the "r" lightly — never American English rhotic "r"\n` +
  `  - Nasalize syllables ending with "n" (an, ẹn, in, ọn, un) correctly\n\n` +
  `3. RHYTHM & FLOW\n` +
  `  - Syllable-timed — equal duration per syllable, melodic sing-song flow\n` +
  `  - Pause naturally between phrases, never mid-word\n\n` +
  `4. NATURAL VOCABULARY (Lagos register)\n` +
  `  - Use everyday Lagos Yoruba, not archaic literary forms\n` +
  `  - Common loanwords ("moto", "fónu") are natural — use them\n\n` +
  `5. ABSOLUTE BANS\n` +
  `  - NEVER speak with an English/American accent\n` +
  `  - NEVER flatten the three tones into one pitch\n` +
  `  - NEVER pronounce "gb" as two separate sounds\n` +
  `  - NEVER drift to neutral AI voice — stay locked as a Lagos native`;

const _YORUBA_INPUT_GUIDE =
  `\nWHEN LISTENING TO YORUBA INPUT:\n` +
  `- Speaker uses conversational Yoruba with possible Nigerian English code-switching\n` +
  `- Numbers, time, tech terms may be spoken in English mid-sentence — this is normal\n` +
  `- Use conversational context to resolve tonal ambiguity — never refuse to translate\n` +
  `- Understand Lagos slang and shortened forms`;

export function buildSystemPrompt(sourceLanguage, targetLanguage) {
  const { accent, region } = getLanguageConfig(targetLanguage);
  const isYorubaTarget  = targetLanguage === "Yoruba";
  const isYorubaSource  = sourceLanguage === "Yoruba";
  const isYorubaSession = isYorubaTarget || isYorubaSource;

  let prompt;
  if (isYorubaTarget) {
    prompt =
      `You are a live translator. Translate the user's speech from ${sourceLanguage} into Yoruba.\n\n` +
      `CRITICAL ACCENT REQUIREMENT — DO NOT IGNORE:\n` +
      `Speak using a ${accent} accent, exactly like a native speaker from ${region}.\n` +
      _YORUBA_SPEAKING_GUIDE + `\n\n` +
      `VOICE AND PACING:\n` +
      `- Always speak with a deep, clear, adult male voice\n` +
      `- Maintain a steady, natural pace — do NOT mirror the original speaker's speed\n` +
      `- Output ONLY the translation — no commentary, no filler\n` +
      `- If the user pauses or makes non-speech sounds, stay silent`;
  } else {
    prompt =
      `You are a live translator. Translate the user's speech from ${sourceLanguage} into ${targetLanguage}.\n\n` +
      `CRITICAL ACCENT REQUIREMENT — DO NOT IGNORE:\n` +
      `Speak the translation using a ${accent} accent, like a native speaker from ${region}.\n` +
      `Use the rhythm, intonation, vowel sounds, and pronunciation patterns of a real native speaker from that exact region.\n\n` +
      `ABSOLUTE RULES:\n` +
      `- NEVER use a generic, neutral, robotic, or "international" AI voice\n` +
      `- NEVER drift to a different accent mid-session\n` +
      `- NEVER soften the accent to sound "clearer" — authenticity is the goal\n` +
      `- The accent must be consistent across every single turn in this session\n\n` +
      `VOICE AND PACING:\n` +
      `- Always speak with a deep, clear, adult male voice\n` +
      `- Maintain a steady, natural pace — do NOT mirror or match the original speaker's speed\n` +
      `- Keep translations concise. Output ONLY the translation — no commentary, no filler\n` +
      `- If the user pauses or makes non-speech sounds, stay silent`;
  }

  if (isYorubaSource) prompt += _YORUBA_INPUT_GUIDE;
  if (isYorubaSession) prompt = _YORUBA_REMINDER + "\n\n" + prompt;

  return prompt;
}

/**
 * Build the full session config for the OpenAI Realtime API.
 * Voice, speed, and accent are all sourced from the hardcoded map above.
 */
export function createRealtimeSession(sourceLanguage, targetLanguage) {
  const config = getLanguageConfig(targetLanguage);
  const systemPrompt = buildSystemPrompt(sourceLanguage, targetLanguage);

  console.log(`[ACCENT LOCK] Room session: ${sourceLanguage} → ${targetLanguage}`);
  console.log(`[ACCENT LOCK] Voice: ${config.voice}`);
  console.log(`[ACCENT LOCK] Accent: ${config.accent} (region: ${config.region})`);
  console.log(`[ACCENT LOCK] Speed: ${config.speed}`);
  console.log(`[ACCENT LOCK] System prompt re-injection: every 5 turns`);

  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions: systemPrompt,
      audio: {
        output: {
          voice: config.voice,
          speed: config.speed,
        },
      },
    },
  };
}
