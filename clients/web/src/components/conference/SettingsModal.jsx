import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, VolumeX, Cpu, Fingerprint, Activity } from 'lucide-react';

export default function SettingsModal({
    isOpen,
    onClose,
    muteAI,
    setMuteAI,
    roomId
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[100] flex items-center justify-center p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 30, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 30, opacity: 0 }}
                        className="max-w-md w-full bg-slate-900/40 border border-white/10 rounded-[32px] md:rounded-[56px] shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-3xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Interactive Background Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/10 opacity-50 pointer-events-none" />
                        
                        {/* Side Accents */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full -mr-16 -mt-16" />
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/10 blur-[80px] rounded-full -ml-20 -mb-20" />

                        <div className="relative z-10 p-8 md:p-12">
                            <header className="flex items-center justify-between mb-10 md:mb-12">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 md:p-3 bg-indigo-600/20 border border-indigo-400/30 rounded-xl md:rounded-2xl text-indigo-400">
                                        <Cpu size={20} md:size={24} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white leading-none">Settings</h2>
                                        <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 md:mt-1.5">Kernel v4.2.0-Alpha</p>
                                    </div>
                                </div>
                                <motion.button 
                                    whileHover={{ rotate: 90, scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onClose} 
                                    className="p-2.5 md:p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl md:rounded-2xl text-slate-400 hover:text-white transition-all shadow-xl"
                                >
                                    <X size={18} md:size={20} />
                                </motion.button>
                            </header>

                            <div className="space-y-10 md:space-y-12">
                                {/* Toggle Control */}
                                <section>
                                    <div className="flex items-center gap-2 mb-4 md:mb-6 ml-1">
                                        <Activity size={10} md:size={12} className="text-indigo-400" />
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Neural Audio Bridge</span>
                                    </div>
                                    
                                    <motion.div
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="p-5 md:p-6 bg-slate-950/40 rounded-[24px] md:rounded-[32px] border border-white/5 flex items-center justify-between cursor-pointer hover:border-indigo-500/30 transition-all shadow-inner"
                                        onClick={() => setMuteAI(!muteAI)}
                                    >
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-[16px] md:rounded-[20px] bg-white/5 flex items-center justify-center text-slate-300">
                                                <VolumeX size={18} md:size={20} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] md:text-[11px] font-black text-white uppercase tracking-widest">Suppress AI Voice</span>
                                                <span className="text-[7px] md:text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 md:mt-1">Translate-only mode</span>
                                            </div>
                                        </div>
                                        <div className={`w-12 md:w-14 h-6 md:h-7 rounded-full relative shadow-inner transition-all duration-500 p-1 ${muteAI ? 'bg-indigo-600 ring-4 ring-indigo-500/20' : 'bg-slate-800'}`}>
                                            <motion.div 
                                                layout
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                className={`h-full aspect-square bg-white rounded-full shadow-lg ${muteAI ? 'ml-auto' : ''}`}
                                            />
                                        </div>
                                    </motion.div>
                                </section>

                                {/* Session Info */}
                                <section className="pt-6 md:pt-8 border-t border-white/5">
                                    <div className="flex items-center gap-2 mb-4 ml-1">
                                        <Fingerprint size={10} md:size={12} className="text-indigo-400" />
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Node Identifier</span>
                                    </div>
                                    <div className="p-4 md:p-5 bg-black/40 rounded-[20px] md:rounded-[24px] border border-white/5 group relative overflow-hidden">
                                        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <p className="text-[10px] md:text-[11px] font-mono text-indigo-400/90 truncate select-all relative z-10 pr-12">{roomId}</p>
                                        <div className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-slate-700 opacity-40">Copy</div>
                                    </div>
                                </section>
                            </div>

                            <motion.button 
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onClose} 
                                className="w-full mt-10 md:mt-14 py-4 md:py-6 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-[24px] md:rounded-[28px] font-black transition-all uppercase tracking-[0.2em] md:tracking-[0.3em] text-[10px] shadow-[0_20px_40px_rgba(79,70,229,0.3)] border border-indigo-400/30"
                            >
                                Synchronize Updates
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
