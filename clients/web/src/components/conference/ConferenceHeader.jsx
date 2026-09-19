import { ArrowLeft, Sparkles, Users, Radio, ChevronRight, Activity } from 'lucide-react';
import Visualizer from '../shared/Visualizer';
import { motion } from 'framer-motion';

export default function ConferenceHeader({
    roomName,
    status,
    onBack,
    onToggleParticipants,
    onToggleTranscripts,
    participantCount,
    showParticipants,
    showTranscripts
}) {
    return (
        <header className="flex items-center justify-between px-4 md:px-12 py-4 md:py-5 border-b border-white/5 bg-slate-950/40 backdrop-blur-3xl z-[60] relative">
            {/* Top Identity Line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-50" />
            
            <div className="flex items-center gap-3 md:gap-12 min-w-0">
                <motion.button
                    whileHover={{ scale: 1.05, x: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onBack}
                    className="group flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-xl shrink-0"
                >
                    <ArrowLeft size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300 hidden sm:inline">Exit</span>
                </motion.button>
                
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                                <Radio size={14} className="text-indigo-400 animate-pulse" />
                            </div>
                            <h2 className="text-lg md:text-2xl font-black tracking-tight text-white leading-tight truncate md:whitespace-nowrap">{roomName}</h2>
                        </div>
                        <div className="h-4 w-px bg-white/10 hidden lg:block" />
                        <div className={`hidden lg:flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shrink-0 ${
                            status === 'Connected' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${status === 'Connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                            {status}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 md:gap-5 mt-1 md:mt-2">
                        <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-[0.1em] shrink-0">
                            <Users size={12} className="text-indigo-400/60" />
                            <span className="text-slate-300">{participantCount}</span>
                            <span className="text-slate-600 hidden md:inline">Synchronized Nodes</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                             <Visualizer isActive={status === 'Connected'} color="indigo" barCount={6} />
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400/80 hidden lg:inline">Real-time Stream</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 md:gap-6">
                <div className="hidden md:flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                    <button
                        onClick={onToggleParticipants}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            showParticipants 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Users size={14} />
                        <span>People</span>
                    </button>
                    <button
                        onClick={onToggleTranscripts}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            showTranscripts 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Sparkles size={14} />
                        <span>Transcripts</span>
                    </button>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 md:w-11 md:h-11 rounded-[12px] md:rounded-[1.25rem] bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center cursor-pointer hover:border-indigo-400/40 transition-all group overflow-hidden shadow-2xl shrink-0">
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-black uppercase group-hover:scale-110 transition-transform">
                            {roomName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
