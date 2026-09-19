import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Mic, MicOff, Video, VideoOff, Sparkles, MessageSquare, 
    Users, LogOut, Globe, Settings, Send, RefreshCw, X
} from 'lucide-react';

export default function AgentControlPanel({
    isMicEnabled,
    isCameraEnabled,
    isBotActive,
    startingBot,
    showTranscripts,
    primaryLang,
    languages,
    onToggleMic,
    onToggleCamera,
    isCameraDisabled,
    onToggleTranscripts,
    onToggleParticipants,
    onActivateAI,
    onLanguageChange,
    onEndSession,
    onSendCommand,
    onShowSettings
}) {
    const [showCommandInput, setShowCommandInput] = useState(false);

    return (
        <div className="fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-5xl px-4 md:px-6">
            <div className="flex flex-col items-center gap-3 md:gap-4">
                
                {/* AI Command Input Popover */}
                <AnimatePresence>
                    {showCommandInput && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="w-full max-w-[450px] mb-2 md:mb-4 overflow-hidden"
                        >
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const text = e.target.chatInput.value.trim();
                                    if (text) {
                                        onSendCommand(text);
                                        e.target.chatInput.value = '';
                                        setShowCommandInput(false);
                                    }
                                }}
                                className="relative bg-slate-950/90 backdrop-blur-3xl border border-white/10 rounded-[24px] md:rounded-[28px] p-1.5 md:p-2 shadow-2xl flex items-center"
                            >
                                <input
                                    autoFocus
                                    name="chatInput"
                                    type="text"
                                    placeholder="Instruct AI Agent..."
                                    className="flex-1 bg-transparent px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none"
                                />
                                <button type="submit" className="p-3 md:p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl md:rounded-2xl transition-all shadow-lg active:scale-95">
                                    <Send size={16} />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setShowCommandInput(false)}
                                    className="p-3 md:p-4 text-slate-500 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>
                
                {/* Main Floating Dock */}
                <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-slate-950/60 md:bg-slate-950/40 backdrop-blur-3xl border border-white/10 rounded-[28px] md:rounded-[35px] p-2 md:p-3 flex flex-wrap items-center justify-center gap-2 md:gap-4 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.6)] group max-w-full"
                >
                    {/* Media Section */}
                    <div className="flex items-center gap-1.5 md:gap-2 p-1 bg-white/[0.03] rounded-[20px] md:rounded-[24px] border border-white/5 shadow-inner">
                        <ControlBtn 
                            onClick={() => onToggleMic(!isMicEnabled)} 
                            active={isMicEnabled} 
                            danger={!isMicEnabled}
                            icon={isMicEnabled ? Mic : MicOff} 
                            label={isMicEnabled ? "Mute" : "Unmute"}
                        />
                        <ControlBtn 
                            onClick={() => onToggleCamera?.(!isCameraEnabled)}
                            active={isCameraEnabled}
                            icon={isCameraEnabled ? Video : VideoOff}
                            label={isCameraEnabled ? "Camera On" : "Camera Off"}
                            disabled={isCameraDisabled}
                        />
                    </div>

                    <div className="w-[1px] h-6 md:h-8 bg-white/10 mx-0.5" />

                    {/* AI Interpretation Section */}
                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Always show the main AI Button action */}
                        <motion.button
                            whileHover={!isBotActive ? { scale: 1.05 } : {}}
                            whileTap={!isBotActive ? { scale: 0.95 } : {}}
                            onClick={!isBotActive ? onActivateAI : undefined}
                            disabled={startingBot}
                            className={`h-[48px] md:h-[60px] px-4 md:px-8 disabled:opacity-50 rounded-[18px] md:rounded-[24px] font-black text-[9px] md:text-[11px] uppercase tracking-[0.2em] flex items-center gap-2 md:gap-3 transition-all active:scale-95 relative overflow-hidden shrink-0 ${
                                isBotActive 
                                    ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 cursor-default' 
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_10px_30px_rgba(79,70,229,0.3)]'
                            }`}
                        >
                            {!isBotActive && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />}
                            
                            {startingBot ? <RefreshCw size={16} className="animate-spin" /> : 
                             isBotActive ? <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> : 
                             <Sparkles size={16} />}
                            
                            {startingBot ? 'Syncing...' : (isBotActive ? 'AI Active' : 'Summon AI')}
                        </motion.button>

                        {/* Language Selector appearing next to the active button */}
                        <AnimatePresence>
                            {isBotActive && (
                                <motion.div 
                                    initial={{ opacity: 0, x: -20, scale: 0.9 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    className="flex items-center gap-1.5 md:gap-2"
                                >
                                    <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-[18px] md:rounded-[24px] p-0.5 md:p-1 flex items-center gap-1 md:gap-1.5 shadow-inner">
                                        <div className="relative">
                                            <select
                                                value={primaryLang}
                                                onChange={onLanguageChange}
                                                className="bg-transparent text-indigo-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] pl-6 pr-4 h-9 md:h-11 outline-none cursor-pointer appearance-none hover:text-indigo-300 transition-colors"
                                            >
                                                {languages.map(l => <option key={l.code} value={l.label} className="bg-slate-950 font-sans">{l.label}</option>)}
                                            </select>
                                            <Globe size={12} className="absolute left-2.5 md:left-4 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <ControlBtn 
                                        onClick={() => setShowCommandInput(!showCommandInput)}
                                        active={showCommandInput}
                                        icon={Send} 
                                        label="AI Commands"
                                        color="indigo"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="w-[1px] h-6 md:h-8 bg-white/10 mx-0.5" />

                    {/* Navigation Toggles */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                        <div className="hidden sm:flex items-center gap-1.5 md:gap-2">
                            <ControlBtn 
                                onClick={onToggleTranscripts}
                                active={showTranscripts}
                                icon={MessageSquare} 
                                label="Transcripts"
                            />
                            <ControlBtn 
                                onClick={onToggleParticipants}
                                icon={Users} 
                                label="Participants"
                            />
                        </div>
                        <ControlBtn 
                            onClick={onShowSettings}
                            icon={Settings} 
                            label="Settings"
                        />
                        
                        <div className="w-[1px] h-6 md:h-8 bg-white/10 mx-0.5 sm:hidden" />
                        
                        {/* Terminate Session */}
                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 180 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={onEndSession}
                            className="w-[48px] h-[48px] md:w-[60px] md:h-[60px] flex items-center justify-center bg-rose-600 hover:bg-rose-500 text-white rounded-[18px] md:rounded-[24px] shadow-xl shadow-rose-600/20 transition-all border border-rose-400/30 shrink-0"
                        >
                            <LogOut size={20} />
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

function ControlBtn({ icon: Icon, label, onClick, active, danger, disabled, color = 'slate' }) {
    const activeStyles = {
        indigo: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
        slate: 'bg-indigo-600 shadow-xl shadow-indigo-600/20 text-white border-indigo-400/50'
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex items-center justify-center w-[44px] h-[44px] md:w-[52px] md:h-[52px] rounded-[15px] md:rounded-[18px] transition-all duration-300 border ${
                disabled ? 'opacity-20 cursor-not-allowed grayscale' :
                danger ? 'bg-rose-600/10 border-rose-500/30 text-rose-500 hover:bg-rose-600 hover:text-white' :
                active ? activeStyles[color] :
                'bg-white/[0.03] border-white/5 text-slate-500 hover:text-white hover:bg-white/10 hover:border-white/20'
            }`}
        >
            <Icon size={18} className="md:size-[20px] transition-transform group-hover:scale-110" />
            <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-950 border border-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-2xl z-[110]`}>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white whitespace-nowrap">{label}</span>
            </div>
        </motion.button>
    );
}
