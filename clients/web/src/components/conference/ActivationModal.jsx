import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, ArrowRight, X, Languages, Zap } from 'lucide-react';

export default function ActivationModal({
    isOpen,
    onClose,
    onConfirm,
    primaryLang,
    setPrimaryLang,
    secondaryLang,
    setSecondaryLang,
    languages
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-3xl"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 30 }}
                        className="bg-slate-900/40 border border-white/10 rounded-[32px] md:rounded-[56px] w-full max-w-xl shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-3xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-indigo-500/10 blur-[80px] -mr-24 md:-mr-32 -mt-24 md:-mt-32 rounded-full" />
                        <div className="absolute bottom-0 left-0 w-48 md:w-64 h-48 md:h-64 bg-emerald-500/5 blur-[80px] -ml-24 md:-ml-32 -mb-24 md:-mb-32 rounded-full" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[length:32px_32px] opacity-[0.02] pointer-events-none" />

                        <div className="relative z-10 p-6 md:p-12">
                            <header className="flex items-center justify-between mb-8 md:mb-12">
                                <div className="flex items-center gap-3 md:gap-5">
                                    <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-600/20 border border-indigo-400/30 rounded-2xl md:rounded-[24px] flex items-center justify-center text-indigo-400 shadow-xl">
                                        <Languages size={24} md:size={32} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5 md:mb-1">
                                            <Zap size={10} md:size={12} className="text-indigo-400 animate-pulse" />
                                            <h3 className="text-lg md:text-2xl font-black uppercase tracking-tighter text-white leading-none">Neural Link</h3>
                                        </div>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Configure Matrix</p>
                                    </div>
                                </div>
                                <motion.button 
                                    whileHover={{ rotate: 90, scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onClose} 
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl md:rounded-2xl text-slate-500 hover:text-white transition-all"
                                >
                                    <X size={18} md:size={20} />
                                </motion.button>
                            </header>

                            <div className="space-y-8 md:space-y-10">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                                        <label className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 block mb-3 md:mb-4">Ingress (Target)</label>
                                        <div className="relative group">
                                            <select
                                                value={primaryLang}
                                                onChange={e => setPrimaryLang(e.target.value)}
                                                className="w-full bg-slate-950/50 border border-white/10 rounded-2xl md:rounded-3xl px-5 md:px-6 py-4 md:py-5 text-[10px] md:text-[11px] font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/20 appearance-none cursor-pointer text-white shadow-inner transition-all hover:border-indigo-500/30"
                                            >
                                                {languages.map(l => <option key={l.code} value={l.label} className="bg-slate-900">{l.label}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4 md:w-5 md:h-5 pointer-events-none group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                    </motion.div>
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                                        <label className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 block mb-3 md:mb-4">Egress (You)</label>
                                        <div className="relative group">
                                            <select
                                                value={secondaryLang}
                                                onChange={e => setSecondaryLang(e.target.value)}
                                                className="w-full bg-slate-950/50 border border-white/10 rounded-2xl md:rounded-3xl px-5 md:px-6 py-4 md:py-5 text-[10px] md:text-[11px] font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-emerald-500/20 appearance-none cursor-pointer text-white shadow-inner transition-all hover:border-emerald-500/30"
                                            >
                                                {languages.map(l => <option key={l.code} value={l.label} className="bg-slate-900">{l.label}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4 md:w-5 md:h-5 pointer-events-none group-hover:text-emerald-400 transition-colors" />
                                        </div>
                                    </motion.div>
                                </div>

                                <div className="p-4 md:p-6 bg-indigo-500/5 rounded-2xl md:rounded-[32px] border border-indigo-500/10 flex items-center justify-center gap-3 md:gap-4">
                                    <Sparkles size={14} md:size={16} className="text-indigo-400 shrink-0" />
                                    <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-center leading-relaxed">
                                        System will automatically route and translate binary speech streams between defined endpoints.
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-2 md:pt-4">
                                    <motion.button 
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onClose} 
                                        className="flex-1 py-4 md:py-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl md:rounded-3xl font-black uppercase tracking-[0.2em] text-[9px] md:text-[10px] text-slate-400 transition-all shadow-xl"
                                    >
                                        Abort
                                    </motion.button>
                                    <motion.button 
                                        whileHover={{ scale: 1.02, y: -2 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onConfirm} 
                                        className="flex-[2] py-4 md:py-6 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl md:rounded-3xl font-black uppercase tracking-[0.2em] text-[9px] md:text-[10px] transition-all shadow-[0_20px_40px_rgba(79,70,229,0.3)] border border-indigo-400/30 flex items-center justify-center gap-3"
                                    >
                                        Initialize Protocol <ArrowRight size={14} md:size={16} />
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
