import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, Clock, Globe } from 'lucide-react';

const TranscriptLine = React.forwardRef(({ speaker, text, textOriginal, timestamp, isAi, isFinal, languages }, ref) => {
    const isSystem = isAi || speaker?.toLowerCase() === 'system' || speaker?.includes('agent');
    
    // Language code to friendly name mapping
    const langNames = {
        'en': 'English', 'ur': 'Urdu', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
        'ar': 'Arabic', 'hi': 'Hindi', 'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean',
        'pt': 'Portuguese', 'ru': 'Russian', 'it': 'Italian', 'nl': 'Dutch', 'pl': 'Polish',
        'tr': 'Turkish', 'vi': 'Vietnamese', 'id': 'Indonesian', 'fil': 'Tagalog', 'bn': 'Bengali'
    };
    
    const sourceLanguage = languages?.source ? langNames[languages.source] || languages.source.toUpperCase() : '';
    const targetLanguage = languages?.target ? langNames[languages.target] || languages.target.toUpperCase() : '';
    const languageLabel = sourceLanguage && targetLanguage ? `${sourceLanguage} → ${targetLanguage}` : '';
    
    const hasOriginal = textOriginal && textOriginal !== text && !isAi;
    
    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex flex-col group ${isSystem ? 'items-start' : 'items-end'}`}
        >
            <div className={`flex items-center gap-3 mb-2 px-2 transition-all flex-wrap ${isSystem ? 'justify-start' : 'justify-end'}`}>
                <div className={`flex items-center gap-2 flex-row ${isSystem ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${
                        isSystem 
                            ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400' 
                            : 'bg-white/5 border-white/10 text-slate-500'
                    }`}>
                        {isSystem ? <Sparkles size={12} /> : <User size={12} />}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isSystem ? 'text-indigo-400' : 'text-slate-500'}`}>
                        {isSystem ? (speaker || 'Aytme Intelligence') : speaker}
                    </span>
                </div>
                
                {/* Language Badge */}
                {languageLabel && !isSystem && (
                    <span className="text-[8px] font-bold px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 flex items-center gap-1">
                        <Globe size={10} />
                        {languageLabel}
                    </span>
                )}
                
                {timestamp && (
                    <span className="text-[8px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
                {!isFinal && (
                    <motion.span 
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="text-[8px] text-amber-500 font-black uppercase tracking-widest pl-2"
                    >
                        Streaming...
                    </motion.span>
                )}
            </div>

            <div className={`relative p-5 max-w-[85%] rounded-[28px] shadow-2xl transition-all duration-500 overflow-hidden border ${
                isSystem
                    ? 'bg-indigo-600/10 border-indigo-500/20 rounded-tl-none text-indigo-50/90 shadow-[0_10px_30px_rgba(79,70,229,0.05)]'
                    : 'bg-white/5 border-white/10 rounded-tr-none text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.1)]'
            }`}>
                {/* Visual indicator for streaming text */}
                {!isFinal && (
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                )}
                
                <div className="flex flex-col gap-2">
                    {/* Translated text (primary) */}
                    <p className={`text-sm leading-relaxed font-medium ${!isFinal ? 'animate-pulse' : ''}`}>{text}</p>
                    
                    {/* Original text (if different from translation) */}
                    {hasOriginal && (
                        <p className="text-xs leading-relaxed font-normal opacity-60 italic border-l-2 border-white/10 pl-3 text-slate-400">
                            {textOriginal}
                        </p>
                    )}
                </div>
                
                {isSystem && (
                    <div className="absolute -right-4 -bottom-4 opacity-10">
                        <Sparkles size={48} />
                    </div>
                )}
            </div>
        </motion.div>
    );
});

TranscriptLine.displayName = 'TranscriptLine';

export default TranscriptLine;
