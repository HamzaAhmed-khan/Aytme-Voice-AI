/**
 * yorubaAccentPreprocess.js
 * ─────────────────────────────────────────────
 * Preprocesses text to simulate a Yoruba-accented English voice
 * when passed to OpenAI TTS (onyx voice).
 *
 * Usage:
 *   import { yorubaAccentPreprocess, yorubaTTS } from '../utils/yorubaAccentPreprocess'
 *
 *   const result = yorubaAccentPreprocess("This thing is very good", "medium")
 *   // Or full pipeline:
 *   const audioBuffer = await yorubaTTS(translatedText, openai, "medium", true)
 */

// ─── RULE MODULES ─────────────────────────────────────────────────────────────

/**
 * Rule 1: Replace "th" sounds with Yoruba-natural equivalents
 * Yoruba has no /θ/ or /ð/ phoneme — speakers substitute d/t
 */
function applyThSubstitution(text) {
  return text
    .replace(/\bthe\b/gi, "de")
    .replace(/\bthis\b/gi, "dis")
    .replace(/\bthat\b/gi, "dat")
    .replace(/\bthey\b/gi, "dey")
    .replace(/\bthem\b/gi, "dem")
    .replace(/\bthere\b/gi, "dere")
    .replace(/\bthese\b/gi, "dese")
    .replace(/\bthose\b/gi, "dose")
    .replace(/\bthink\b/gi, "tink")
    .replace(/\bthought\b/gi, "tot")
    .replace(/\bthrough\b/gi, "tru")
    .replace(/\bthree\b/gi, "tree")
    .replace(/\bthing\b/gi, "ting")
    .replace(/\bthings\b/gi, "tings")
    .replace(/\bwith\b/gi, "wit")
    .replace(/\bwithout\b/gi, "witout")
    .replace(/\bmother\b/gi, "moder")
    .replace(/\bfather\b/gi, "fader")
    .replace(/\bbrother\b/gi, "broder")
    .replace(/\bother\b/gi, "oder");
}

/**
 * Rule 2: Drop or soften the "h" at word starts
 * Yoruba speakers sometimes drop initial H
 */
function applyHDrop(text) {
  return text
    .replace(/\bhe\b/g, "e")
    .replace(/\bhim\b/g, "im")
    .replace(/\bhis\b/g, "is")
    .replace(/\bher\b/g, "er")
    .replace(/\bhave\b/gi, "av")
    .replace(/\bhas\b/gi, "as")
    .replace(/\bhad\b/gi, "ad");
}

/**
 * Rule 3: Soften "-ing" endings to "-in"
 * Yoruba English drops the final G on gerunds
 */
function applyIngDropping(text) {
  return text.replace(/(\w+)ing\b/g, (match, stem) => {
    // Don't alter short words like "king", "ring", "sing" — sounds unnatural
    if (stem.length <= 2) return match;
    return stem + "in";
  });
}

/**
 * Rule 4: Expand contractions — Yoruba English is more formal/literal
 * "can't" → "cannot", "won't" → "will not"
 */
function expandContractions(text) {
  return text
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\bwon't\b/gi, "will not")
    .replace(/\bdon't\b/gi, "do not")
    .replace(/\bisn't\b/gi, "is not")
    .replace(/\baren't\b/gi, "are not")
    .replace(/\bwasn't\b/gi, "was not")
    .replace(/\bweren't\b/gi, "were not")
    .replace(/\bdidn't\b/gi, "did not")
    .replace(/\bhadn't\b/gi, "had not")
    .replace(/\bhasn't\b/gi, "has not")
    .replace(/\bhaven't\b/gi, "have not")
    .replace(/\bwouldn't\b/gi, "would not")
    .replace(/\bcouldn't\b/gi, "could not")
    .replace(/\bshouldn't\b/gi, "should not")
    .replace(/\bI'm\b/gi, "I am")
    .replace(/\bI've\b/gi, "I have")
    .replace(/\bI'll\b/gi, "I will")
    .replace(/\bI'd\b/gi, "I would")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bthat's\b/gi, "that is")
    .replace(/\bhe's\b/gi, "he is")
    .replace(/\bshe's\b/gi, "she is")
    .replace(/\bwe're\b/gi, "we are")
    .replace(/\bthey're\b/gi, "they are")
    .replace(/\byou're\b/gi, "you are");
}

/**
 * Rule 5: Inject pacing pauses at clause boundaries
 * Mimics Yoruba speech rhythm — deliberate, with breath points
 */
function injectPacing(text) {
  return text
    // Add pause after conjunctions
    .replace(/\b(but|and|so|because|however|therefore|although)\b/gi, "... $1")
    // Add pause before relative clauses
    .replace(/\b(which|who|that|where)\b/gi, "... $1")
    // Split run-on sentences at natural points
    .replace(/([.!?])\s+/g, "$1 ... ");
}

/**
 * Rule 6: Sentence-end emphasis rewrite
 * Yoruba English tends to front-load subjects and end on the key word
 */
function applyEmphasisPatterns(text, intensity) {
  if (intensity === "low") return text;

  const affirmations = ["I tell you", "ehn", "so", "now"];
  const sentences = text.split(/(?<=[.!?])\s+/);

  return sentences
    .map((sentence, i) => {
      if (intensity === "high" && i % 2 === 0 && sentence.length > 20) {
        const aff = affirmations[i % affirmations.length];
        return sentence.replace(/([.!?])$/, `, ${aff}$1`);
      }
      return sentence;
    })
    .join(" ");
}

/**
 * Rule 7: Vowel stress markers
 * Yoruba is a tonal language — speakers elongate stressed vowels
 */
function applyVowelElongation(text, intensity) {
  if (intensity !== "high") return text;

  return text
    .replace(/\bvery\b/gi, "veeery")
    .replace(/\breally\b/gi, "reeally")
    .replace(/\bso\b/gi, "sooo")
    .replace(/\bplease\b/gi, "pleeease")
    .replace(/\bnow\b/gi, "nooow")
    .replace(/\bno\b/gi, "nooo")
    .replace(/\byes\b/gi, "yeees");
}

// ─── MAIN PREPROCESSOR ────────────────────────────────────────────────────────

/**
 * Main function — chains all rules and returns processed text
 *
 * @param {string} text - The translated text to preprocess
 * @param {"low"|"medium"|"high"} intensity - Accent strength (default: "medium")
 * @param {boolean} debug - Log original vs modified text
 * @returns {{ output: string, original: string, intensity: string }}
 */
export function yorubaAccentPreprocess(text, intensity = "medium", debug = false) {
  if (!text || typeof text !== "string") {
    return { output: text || "", original: text || "", intensity };
  }

  const original = text;
  let processed = text;

  // Always applied (low, medium, high)
  processed = expandContractions(processed);
  processed = injectPacing(processed);

  // Applied at medium and high
  if (intensity === "medium" || intensity === "high") {
    processed = applyThSubstitution(processed);
    processed = applyIngDropping(processed);
    processed = applyEmphasisPatterns(processed, intensity);
  }

  // Applied at high only
  if (intensity === "high") {
    processed = applyHDrop(processed);
    processed = applyVowelElongation(processed, intensity);
  }

  if (debug) {
    console.log("─── Yoruba Accent Preprocessor ───");
    console.log("ORIGINAL : ", original);
    console.log("PROCESSED: ", processed);
    console.log("INTENSITY: ", intensity);
    console.log("──────────────────────────────────");
  }

  return {
    output: processed,
    original,
    intensity,
  };
}

// ─── YORUBA DETECTION HELPERS ─────────────────────────────────────────────────

const YORUBA_CODES = new Set(['yo', 'yoruba']);

export function isYoruba(langCode) {
  return YORUBA_CODES.has((langCode || '').toLowerCase().trim());
}

export function involvesYoruba(sourceLang, targetLang) {
  return isYoruba(sourceLang) || isYoruba(targetLang);
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

export {
  applyThSubstitution,
  applyHDrop,
  applyIngDropping,
  expandContractions,
  injectPacing,
  applyEmphasisPatterns,
  applyVowelElongation,
};
