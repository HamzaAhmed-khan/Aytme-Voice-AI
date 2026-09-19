import React from 'react';
import ParticipantTile from './ParticipantTile';
import { motion, AnimatePresence } from 'framer-motion';

export default function ParticipantGrid({
    participants,
    videoTracks,
    currentSpeaker,
    isSpeechActive,
    isBotSpeaking,
    isMicEnabled,
    onMute,
    onRemove
}) {
    // Dynamic grid configuration based on participant count
    const getGridConfig = (count) => {
        if (count === 1) return 'grid-cols-1 max-w-4xl lg:max-w-5xl aspect-video';
        if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-7xl aspect-video md:aspect-[21/9]';
        if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-7xl';
        if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-full';
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-w-full';
    };

    const gridClass = getGridConfig(participants.length);

    return (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden pt-20 md:pt-28 pb-32 md:pb-40">
            <motion.div 
                layout
                className={`grid ${gridClass} gap-4 md:gap-8 w-full max-w-7xl mx-auto items-center justify-items-center overflow-y-auto scrollbar-hide`}
            >
                <AnimatePresence mode="popLayout">
                    {participants.map((p, idx) => {
                        const isMe = p.isLocal;
                        const isBot = p.isBot;

                        const isSpeaking = isBot
                            ? isBotSpeaking
                            : isMe
                                ? (isSpeechActive && (currentSpeaker === p.rawIdentity || currentSpeaker === 'Me' || !currentSpeaker))
                                : (isSpeechActive && currentSpeaker === p.rawIdentity);

                        const isMicOn = isMe ? isMicEnabled : true;
                        const identityKey = p.rawIdentity || p.identity;
                        const videoTrack = identityKey ? videoTracks?.[identityKey] : null;

                        return (
                            <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                key={p.rawIdentity || p.identity || idx} 
                                className="w-full h-full min-h-[220px] max-h-[600px] flex items-center justify-center p-1"
                            >
                                <ParticipantTile
                                    participant={p}
                                    isSpeaking={isSpeaking}
                                    isMicOn={isMicOn}
                                    videoTrack={videoTrack}
                                    onMute={onMute}
                                    onRemove={onRemove}
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>
            
            {/* Ambient indicator for multiple pages/scroll if needed */}
            {participants.length > 12 && (
                <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-700 animate-pulse">
                    <span>Adaptive Viewing Mode Active</span>
                </div>
            )}
        </div>
    );
}
