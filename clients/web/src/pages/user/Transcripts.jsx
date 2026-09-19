import React, { useState, useEffect, useRef } from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { transcriptService } from '../../services/api';
import {
    Search, ScrollText, Download,
    MessageSquare, ChevronRight, Filter,
    Play, Pause, Trash2, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function Transcripts() {
    const { rooms, fetchRooms } = useRoomStore();
    const { currentOrg } = useOrganizationStore();

    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [transcripts, setTranscripts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [playingTranscriptId, setPlayingTranscriptId] = useState(null);
    const [deletingTranscriptId, setDeletingTranscriptId] = useState(null);
    const audioRef = useRef(null);
    const audioUrlRef = useRef(null);

    useEffect(() => {
        if (currentOrg?.id) {
            fetchRooms(currentOrg.id);
        }
    }, [currentOrg?.id, fetchRooms]);

    useEffect(() => {
        if (selectedRoomId) {
            loadTranscripts(selectedRoomId);
        }
    }, [selectedRoomId]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }
        };
    }, []);

    const loadTranscripts = async (roomId) => {
        setIsLoading(true);
        try {
            const data = await transcriptService.list(roomId, 100);
            setTranscripts(data);
        } catch (err) {
            console.error("Failed to load transcripts", err);
            toast.error("Failed to load transcripts");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async (format) => {
        if (!selectedRoomId) return;
        try {
            let blob;
            if (format === 'csv') blob = await transcriptService.exportCsv(selectedRoomId);
            else blob = await transcriptService.exportJson(selectedRoomId);

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcript_${selectedRoomId}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error("Export failed");
        }
    };

    const stopAudioPlayback = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        setPlayingTranscriptId(null);
    };

    const handleListenTranscript = async (transcriptId) => {
        if (!selectedRoomId || !transcriptId) return;

        if (playingTranscriptId === transcriptId) {
            stopAudioPlayback();
            return;
        }

        stopAudioPlayback();
        setPlayingTranscriptId(transcriptId);
        try {
            const blob = await transcriptService.getAudio(selectedRoomId, transcriptId);
            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;

            const player = new Audio(url);
            audioRef.current = player;
            player.onended = stopAudioPlayback;
            player.onerror = () => {
                stopAudioPlayback();
                toast.error('Unable to play transcript audio');
            };
            await player.play();
        } catch (err) {
            setPlayingTranscriptId(null);
            if (err?.response?.status === 404) {
                toast.error('No saved audio for this transcript');
            } else {
                toast.error('Failed to load transcript audio');
            }
        }
    };

    const handleDeleteTranscript = async (transcriptId) => {
        if (!selectedRoomId || !transcriptId) return;
        const confirmed = window.confirm('Delete this transcript and its saved audio?');
        if (!confirmed) return;

        setDeletingTranscriptId(transcriptId);
        try {
            await transcriptService.delete(selectedRoomId, transcriptId);
            setTranscripts((prev) => prev.filter((t) => t.id !== transcriptId));
            if (playingTranscriptId === transcriptId) {
                stopAudioPlayback();
            }
            toast.success('Transcript deleted');
        } catch {
            toast.error('Failed to delete transcript');
        } finally {
            setDeletingTranscriptId(null);
        }
    };

    const filteredRooms = rooms.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6 overflow-hidden">
            {/* Sidebar: Room Selector */}
            <div className="w-80 flex flex-col bg-slate-900/40 backdrop-blur-3xl rounded-[40px] border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center gap-2">
                        <ScrollText size={14} className="text-indigo-400" />
                        Meeting History
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                        <input
                            type="text"
                            placeholder="Search meetings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-10 pr-4 py-3 text-[10px] font-black uppercase tracking-widest text-white placeholder:text-slate-800 focus:outline-none focus:border-indigo-500/30 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredRooms.map(room => (
                        <button
                            key={room.id}
                            onClick={() => setSelectedRoomId(room.id)}
                            className={`w-full flex items-center justify-between p-4 rounded-3xl transition-all border ${selectedRoomId === room.id
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-600/20'
                                : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:border-white/10'
                                }`}
                        >
                            <div className="flex flex-col items-start gap-1">
                                <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[140px]">{room.name}</span>
                                <span className={`text-[8px] font-bold uppercase tracking-widest ${selectedRoomId === room.id ? 'text-indigo-200' : 'text-slate-600'}`}>
                                    {room.id.slice(0, 8)}...
                                </span>
                            </div>
                            <ChevronRight size={14} className={selectedRoomId === room.id ? 'text-white' : 'text-slate-700'} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content: Transcript Feed */}
            <div className="flex-1 flex flex-col bg-slate-900/40 backdrop-blur-3xl rounded-[40px] border border-white/5 overflow-hidden">
                <AnimatePresence mode="wait">
                    {!selectedRoomId ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center text-center p-12"
                        >
                            <div className="w-20 h-20 bg-slate-800/30 rounded-[32px] flex items-center justify-center text-slate-600 mb-6 border border-white/5">
                                <Filter size={32} />
                            </div>
                            <h3 className="text-xl font-black italic tracking-tight mb-2 uppercase">Select a Meeting</h3>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Select a meeting from the archive to view its logs</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex-1 flex flex-col h-full overflow-hidden"
                        >
                            {/* Feed Header */}
                            <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                                        <ScrollText size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest">{rooms.find(r => r.id === selectedRoomId)?.name}</h3>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Meeting Conversation History</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 text-[10px] font-black uppercase tracking-widest">
                                        <Download size={14} /> CSV
                                    </button>
                                    <button onClick={() => handleExport('json')} className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 text-[10px] font-black uppercase tracking-widest">
                                        <Download size={14} /> JSON
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Feed */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-4">
                                        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading Transcripts...</p>
                                    </div>
                                ) : transcripts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                                        <div className="p-6 bg-slate-800/30 rounded-full mb-6">
                                            <MessageSquare size={32} />
                                        </div>
                                        <p className="text-[10px] font-black uppercase tracking-widest">No conversation logs found.</p>
                                    </div>
                                ) : (
                                    transcripts.map((t, i) => (
                                        <div key={t.id || i} className="group relative">
                                            {(() => {
                                                const speakerIdentity = String(t.speaker_identity || '').trim();
                                                const speakerHint = speakerIdentity.toLowerCase();
                                                const isAI = Boolean(t.is_ai) || speakerHint.includes('bot') || speakerHint.includes('ai');
                                                const translatedText = t.text_translated || t.text_raw || '';
                                                const hasOriginal = Boolean(t.text_raw && t.text_raw !== translatedText);
                                                return (
                                                    <>
                                            <div className="flex items-center gap-2 mb-2 px-1">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${isAI ? 'text-indigo-400' : 'text-slate-500'}`}>
                                                    {isAI ? 'AI Translator' : speakerIdentity || 'Guest'}
                                                </span>
                                                <span className="text-[7px] font-bold text-slate-700 uppercase tracking-widest ml-auto">
                                                    {new Date(t.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className={`p-5 rounded-3xl border transition-all ${isAI
                                                ? 'bg-indigo-600/5 border-indigo-500/10 text-indigo-100'
                                                : 'bg-white/[0.02] border-white/5 text-slate-300'
                                                }`}>
                                                <p className="text-sm leading-relaxed font-medium">{translatedText || '[empty]'}</p>
                                                {hasOriginal && !isAI && (
                                                    <p className="text-xs leading-relaxed opacity-70 italic border-l-2 border-white/10 pl-3 text-slate-400 mt-2">
                                                        Original: {t.text_raw}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="mt-2 flex items-center gap-2 px-1">
                                                <button
                                                    onClick={() => handleListenTranscript(t.id)}
                                                    disabled={!t.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {playingTranscriptId === t.id ? <Pause size={10} /> : <Play size={10} />}
                                                    {playingTranscriptId === t.id ? 'Stop' : 'Listen'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTranscript(t.id)}
                                                    disabled={!t.id || deletingTranscriptId === t.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-500/30 text-[9px] font-black uppercase tracking-wider text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {deletingTranscriptId === t.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                                    Delete
                                                </button>
                                            </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
