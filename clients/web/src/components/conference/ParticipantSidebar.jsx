import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, VolumeX, UserMinus, Sparkles, Shield, User } from 'lucide-react';

export default function ParticipantSidebar({
    isOpen,
    onClose,
    participants,
    onMute,
    onRemove
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="absolute right-0 top-0 bottom-0 w-80 md:w-96 bg-slate-950/40 backdrop-blur-3xl border-l border-white/10 z-[70] shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <header className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Neural Cluster</h3>
                        </div>
                        <motion.button 
                            whileHover={{ rotate: 90, scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={onClose} 
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"
                        >
                            <X size={20} />
                        </motion.button>
                    </header>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide pb-20">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6 ml-2">Active Participants ({participants.length})</p>
                        
                        {participants.map((p, idx) => (
                            <motion.div
                                key={`${p.identity}-${idx}`}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group relative p-4 bg-white/[0.03] rounded-[28px] border border-white/5 hover:border-indigo-500/30 transition-all shadow-inner overflow-hidden"
                            >
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-[18px] bg-slate-900 border border-white/10 flex items-center justify-center text-xs font-black text-indigo-400 overflow-hidden shadow-2xl">
                                            {p.isBot ? <Sparkles size={20} /> : p.identity.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-[3px] border-slate-950 shadow-lg" />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black truncate uppercase tracking-tighter text-white">
                                            {p.identity}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {p.isLocal ? (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-[8px] font-black uppercase tracking-widest text-indigo-400">
                                                    <Shield size={8} /> Self
                                                </div>
                                            ) : p.isBot ? (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                                                    AI Agent
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-lg border border-white/5 text-[8px] font-black uppercase tracking-widest text-slate-500">
                                                    Authorized Node
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {!p.isLocal && !p.isBot && (
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                            <button 
                                                onClick={() => onMute(p.rawIdentity || p.identity)} 
                                                className="p-3 bg-slate-950/80 hover:bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-white transition-all shadow-xl"
                                                title="Mute Component"
                                            >
                                                <VolumeX size={16} />
                                            </button>
                                            <button 
                                                onClick={() => onRemove(p.rawIdentity || p.identity)} 
                                                className="p-3 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 rounded-xl text-rose-500 hover:text-white transition-all shadow-xl"
                                                title="Decommission Node"
                                            >
                                                <UserMinus size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full -mr-16 -mt-16 pointer-events-none" />
                            </motion.div>
                        ))}
                    </div>
                    
                    {/* Ambient Footer */}
                    <div className="p-8 bg-slate-950/40 border-t border-white/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Sync Status</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">Encrypted</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
