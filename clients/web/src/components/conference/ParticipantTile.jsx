import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, VolumeX, UserMinus, Sparkles, User, MicOff } from 'lucide-react';
import Visualizer from '../shared/Visualizer';

export default function ParticipantTile({
    participant,
    isSpeaking,
    isMicOn,
    videoTrack,
    onMute,
    onRemove
}) {
    const isMe = participant.isLocal;
    const isBot = participant.isBot;
    const pIdentity = participant.identity || "Unknown Node";
    const rawIdentity = participant.rawIdentity;
    const videoRef = useRef(null);

    useEffect(() => {
        if (!videoTrack || !videoRef.current) return;
        try {
            videoTrack.attach(videoRef.current);
        } catch (e) {}
        return () => {
            try {
                videoTrack.detach(videoRef.current);
            } catch (e) {}
        };
    }, [videoTrack]);

    return (
        <div className="relative flex flex-col items-center justify-center w-full h-full p-2">
            {/* Ambient Speaking Pulse (Under-glow) */}
            <AnimatePresence>
                {isSpeaking && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 0.4, scale: 1.1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-x-8 inset-y-8 bg-gradient-to-br from-indigo-500/30 to-blue-500/30 blur-[80px] rounded-full z-0 pointer-events-none"
                    />
                )}
            </AnimatePresence>

            <motion.div 
                layout
                className={`relative z-10 w-full h-full min-h-[200px] md:min-h-[260px] rounded-[32px] md:rounded-[42px] flex flex-col items-center justify-center transition-all duration-700 border backdrop-blur-3xl shadow-2xl group overflow-hidden
                ${isSpeaking 
                    ? 'border-indigo-400/50 bg-indigo-500/10 shadow-[0_0_60px_rgba(79,70,229,0.25)] ring-4 ring-indigo-500/10' 
                    : 'bg-slate-900/40 border-white/5'
                }
            `}>
                {videoTrack && (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted={isMe}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-950/30" />
                    </>
                )}
                {/* Decorative Background Texture */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[length:24px_24px]" />
1: 
                {/* Status Badges */}
                <div className="absolute top-4 md:top-6 left-4 md:left-6 flex items-center gap-2">
                    {isBot && (
                        <div className="bg-indigo-600 text-white p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-xl flex items-center gap-1.5 md:gap-2 border border-indigo-400/30">
                            <Sparkles size={12} className="animate-pulse" />
                            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none pr-1">AI</span>
                        </div>
                    )}
                    {isMe && (
                        <div className="bg-white/5 backdrop-blur-xl text-slate-400 px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest">
                            Self
                        </div>
                    )}
                </div>

                <div className="absolute top-4 md:top-6 right-4 md:right-6">
                    <div className="flex items-center gap-2">
                         {!isMicOn && (
                            <div className="p-1 md:p-1.5 bg-rose-600/20 rounded-lg border border-rose-500/30">
                                <MicOff size={10} md:size={12} className="text-rose-400" />
                            </div>
                        )}
                        <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                    </div>
                </div>

                {/* Avatar Section */}
                {!videoTrack && (
                    <div className="relative mt-4">
                        <AnimatePresence>
                            {isSpeaking && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="absolute -inset-3 md:-inset-4 border-2 border-indigo-500/30 rounded-[30px] md:rounded-[40px] animate-ping opacity-20"
                                />
                            )}
                        </AnimatePresence>
                        
                        <div className={`w-20 h-20 md:w-28 md:h-28 rounded-[28px] md:rounded-[38px] flex items-center justify-center transition-all duration-500 shadow-inner overflow-hidden border
                            ${isSpeaking 
                                ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 border-indigo-400 scale-105 rotate-2' 
                                : 'bg-slate-950/80 border-white/10'
                            }
                        `}>
                            {isBot ? (
                                <Bot size={36} md:size={54} className={`${isSpeaking ? "text-white drop-shadow-lg" : "text-slate-600"} transition-all`} />
                            ) : (
                                <span className={`text-2xl md:text-4xl font-black transition-all ${isSpeaking ? 'text-white' : 'text-slate-400'}`}>
                                    {pIdentity.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Info Overlay */}
                <div className="mt-4 md:mt-8 px-4 md:px-8 w-full">
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 max-w-full">
                            <h3 className={`text-[10px] md:text-sm font-black uppercase tracking-[0.15em] md:tracking-[0.2em] truncate transition-colors duration-500 ${isSpeaking ? 'text-white' : 'text-slate-400'}`}>
                                {isMe ? "You" : pIdentity}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 mt-2 md:mt-3">
                            <Visualizer isActive={isSpeaking} color={isBot ? "white" : "indigo"} barCount={4} md:barCount={6} />
                        </div>
                    </div>
                </div>

                {/* Hover Actions / Controls */}
                <AnimatePresence>
                    {!isMe && !isBot && (
                        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center gap-4 md:gap-6 opacity-0 group-hover:opacity-100 transition-all duration-500 p-4 md:p-8">
                             <div className="flex flex-col items-center text-center">
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-[18px] md:rounded-[24px] bg-white/5 border border-white/10 flex items-center justify-center mb-2 md:mb-4 text-white text-lg md:text-xl font-black select-none">
                                    {pIdentity.charAt(0)}
                                </div>
                                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white underline underline-offset-4 md:underline-offset-8 decoration-indigo-500 mb-4 md:mb-8 truncate max-w-full">{pIdentity}</p>
                             </div>
                             
                             <div className="flex items-center gap-2 md:gap-4">
                                <motion.button 
                                    whileHover={{ scale: 1.1, y: -2 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => onMute(rawIdentity || pIdentity)} 
                                    className="px-4 md:px-6 py-3 md:py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all flex items-center gap-2 md:gap-3"
                                >
                                    <VolumeX size={16} md:size={18} />
                                    <span>Silence</span>
                                </motion.button>
                                <motion.button 
                                    whileHover={{ scale: 1.1, y: -2 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => onRemove(rawIdentity || pIdentity)} 
                                    className="px-4 md:px-6 py-3 md:py-4 bg-rose-600 hover:bg-rose-500 border border-rose-400/30 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-xl shadow-rose-600/20 flex items-center gap-2 md:gap-3"
                                >
                                    <UserMinus size={16} md:size={18} />
                                    <span>Eject</span>
                                </motion.button>
                             </div>
                        </div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
