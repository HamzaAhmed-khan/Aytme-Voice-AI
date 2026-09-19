import React, { useState } from 'react';
import { X, Send, MessageSquare, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

/**
 * CAPTION TEST MODE - Translates test text and injects it as captions
 * Simulates the real caption pipeline: text → translation → UI display
 */
export function CaptionTestMode({ onInjectCaption, isOpen, onClose }) {
  const [testText, setTestText] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [speaker, setSpeaker] = useState('Test Speaker');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState('');

  const languages = {
    ar: 'Arabic',
    zh: 'Chinese',
    en: 'English',
    fr: 'French',
    de: 'German',
    hi: 'Hindi',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    pt: 'Portuguese',
    ru: 'Russian',
    es: 'Spanish',
  };

  const handleTranslate = async () => {
    if (!testText.trim()) {
      toast.error('Please enter text to translate');
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch('/api/v1/talk-together/translate-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: testText,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      setTranslatedText(data.translated_text);
      toast.success('Translation complete!');
    } catch (error) {
      console.error('Translation error:', error);
      toast.error('Translation failed: ' + error.message);
      setTranslatedText('');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleInject = () => {
    if (!testText.trim()) {
      toast.error('Please enter caption text');
      return;
    }

    const caption = {
      type: 'caption',
      text: testText.trim(),
      translated_text: translatedText || undefined,
      speaker: speaker,
      is_final: true,
      timestamp: Date.now(),
      id: `test-${Date.now()}`
    };

    console.log('[TEST MODE] Injecting caption:', caption);
    onInjectCaption(caption);

    // Clear form
    setTestText('');
    setTranslatedText('');
    toast.success('Caption injected into transcript!');
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <MessageSquare size={16} className="text-indigo-600" />
            </div>
            <h2 className="font-bold text-slate-800">Translate & Test Caption</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Source Text */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Enter Text (Source Language)
          </label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="What do you want to translate and display as caption?"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none h-20"
          />
        </div>

        {/* Language Selection */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Source Language
            </label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              {Object.entries(languages).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Target Language
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              {Object.entries(languages).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Translate Button */}
        <button
          onClick={handleTranslate}
          disabled={isTranslating || !testText.trim()}
          className="w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTranslating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Translating...
            </>
          ) : (
            '✨ Translate with OpenAI'
          )}
        </button>

        {/* Translated Result */}
        {translatedText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-2">
              Translated Text ({languages[targetLang]})
            </p>
            <p className="text-sm text-emerald-900">{translatedText}</p>
          </motion.div>
        )}

        {/* Speaker Name */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Speaker Name
          </label>
          <input
            type="text"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="Speaker name..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition font-semibold text-sm"
          >
            Close
          </button>
          <button
            onClick={handleInject}
            disabled={!testText.trim() || isTranslating}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            Inject Caption
          </button>
        </div>

        {/* Info */}
        <div className="pt-2 border-t border-slate-200">
          <p className="text-[9px] text-slate-400 text-center">
            💡 This translates your text using OpenAI and injects it as a caption to test the display system.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
