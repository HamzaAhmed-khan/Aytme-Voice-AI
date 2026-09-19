import React, { useState, useEffect, useRef } from 'react';
import { roomService, transcriptService } from '../services/api';
import { useOrganizationStore } from '../store/organizationStore';
import toast from 'react-hot-toast';
import {
  FileText, Clock, User,
  Search, Download, MessageSquare,
  ChevronRight, ChevronLeft, Sparkles, Activity,
  Database, Play, Pause, Trash2, Loader2, Share2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TranscriptsView() {
  const { currentOrg } = useOrganizationStore();
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  const [playingTranscriptId, setPlayingTranscriptId] = useState(null);
  const [deletingTranscriptId, setDeletingTranscriptId] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const scrollRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        window.URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const data = await roomService.listRooms();
      const sorted = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRooms(sorted);
      if (sorted.length > 0) {
        handleSelectRoom(sorted[0]);
      }
    } catch (err) {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    setDetailsLoading(true);
    try {
      const roomSessions = await transcriptService.listSessions(room.id);
      setSessions(roomSessions || []);
      if (roomSessions?.length > 0) {
        loadSessionTranscripts(room.id, roomSessions[0]);
      } else {
        setTranscripts([]);
        setSelectedSession(null);
      }
    } catch (err) {
      toast.error('Failed to load room sessions');
      setSessions([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const loadSessionTranscripts = async (roomId, session) => {
    setSelectedSession(session);
    setDetailsLoading(true);
    try {
      const data = await transcriptService.list(roomId, 200, session.session_id);
      setTranscripts(data || []);
    } catch (err) {
      toast.error('Failed to load session transcripts');
      setTranscripts([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleExport = async (format) => {
    if (!selectedRoom) return;
    try {
      let data, filename;
      if (format === 'json') {
        data = await transcriptService.exportJson(selectedRoom.id);
        filename = `transcript-${selectedRoom.id}.json`;
      } else {
        data = await transcriptService.exportCsv(selectedRoom.id);
        filename = `transcript-${selectedRoom.id}.csv`;
      }
      
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    }
  };

  const formatTranscriptForShare = () => {
    if (!transcripts.length) return '';
    const roomName = selectedRoom?.name || 'Session';
    const sessionId = selectedSession?.session_id?.slice(0, 8) || '';
    const header = `Aytme Transcript — ${roomName} (${sessionId})\n${'─'.repeat(40)}\n`;
    const lines = transcripts.map(t => {
      const speaker = t.is_ai ? 'AI Interpreter' : (t.speaker_identity || 'Speaker');
      const text = t.text_translated || t.text_raw || '';
      return `${speaker}: ${text}`;
    });
    return header + lines.join('\n');
  };

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      window.URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingTranscriptId(null);
  };

  const handlePlayTranscript = async (transcriptId) => {
    if (!selectedRoom?.id || !transcriptId) return;

    if (playingTranscriptId === transcriptId) {
      stopAudioPlayback();
      return;
    }

    stopAudioPlayback();
    setPlayingTranscriptId(transcriptId);
    try {
      const blob = await transcriptService.getAudio(selectedRoom.id, transcriptId);
      const url = window.URL.createObjectURL(blob);
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
    if (!selectedRoom?.id || !transcriptId) return;
    const confirmed = window.confirm('Delete this transcript and its saved audio?');
    if (!confirmed) return;

    setDeletingTranscriptId(transcriptId);
    try {
      await transcriptService.delete(selectedRoom.id, transcriptId);
      setTranscripts((prev) => prev.filter((t) => t.id !== transcriptId));
      setSessions((prev) => prev.map((s) => {
        if (s.session_id !== selectedSession?.session_id) return s;
        return {
          ...s,
          transcript_count: Math.max(0, (s.transcript_count || 0) - 1),
        };
      }));
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

  const filteredSessions = sessions.filter((s) => {
    const roomName = (selectedRoom?.name || '').toLowerCase();
    const sessionKey = String(s.session_id || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return roomName.includes(q) || sessionKey.includes(q);
  });

  if (loading && rooms.length === 0) {
    return (
      <div className="v2-page flex items-center justify-center min-h-[400px]">
        <Activity className="animate-spin text-v2-accent" size={48} />
      </div>
    );
  }

  if (!loading && rooms.length === 0) {
    return (
      <div className="v2-page flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <FileText className="text-v2-muted/30" size={64} strokeWidth={1} />
        <h2 className="text-xl font-bold text-v2-text/50 uppercase tracking-tight">No Transcripts Yet</h2>
        <p className="text-sm text-v2-muted max-w-sm text-center font-medium">
          Start a conversation or translation session first. Transcripts will appear here once you have session history.
        </p>
      </div>
    );
  }

  return (
    <div className="v2-page flex flex-col h-[calc(100vh-140px)] space-y-6 animate-in fade-in duration-700">
      <header className="flex justify-between items-end flex-shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-v2-accent font-bold uppercase tracking-[0.2em] text-[10px]">
            <Database size={12} strokeWidth={3} />
            Knowledge Base
          </div>
          <h1 className="text-4xl font-semibold text-v2-text tracking-tighter uppercase">Session Transcripts</h1>
          <p className="text-v2-muted text-sm font-medium">Explore historical session logs and AI-generated translations.</p>
        </div>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Sidebar: Session List */}
        <div className={`w-full md:w-80 flex-col bg-white v2-card p-0 overflow-hidden shadow-xl border-v2-border/40 ${showMobileList ? 'flex' : 'hidden md:flex'}`}>
          <div className="p-4 border-b border-v2-border/30 bg-v2-header/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-v2-muted" size={14} />
              <input 
                type="text"
                placeholder="Search sessions..."
                className="v2-input pl-9 h-10 text-xs bg-white/50"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Room Selector if needed, but for now we search all rooms */}
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {rooms.slice(0, 5).map(r => (
                <button 
                  key={r.id}
                  onClick={() => handleSelectRoom(r)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase whitespace-nowrap border transition-all ${selectedRoom?.id === r.id ? 'bg-v2-accent text-white border-v2-accent' : 'bg-white text-v2-muted border-v2-border/40 hover:border-v2-accent/40'}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-v2-border/10">
            {filteredSessions.length === 0 ? (
              <div className="p-10 text-center space-y-2 opacity-40">
                <FileText className="mx-auto text-v2-muted mb-2" size={32} />
                <p className="text-xs font-bold uppercase tracking-widest">No sessions found</p>
              </div>
            ) : (
              filteredSessions.map(session => (
                <button
                  key={session.session_id}
                  onClick={() => {
                    loadSessionTranscripts(selectedRoom?.id, session);
                    setShowMobileList(false);
                  }}
                  className={`w-full text-left p-4 transition-all hover:bg-v2-accent/5 group relative ${selectedSession?.session_id === session.session_id ? 'bg-v2-accent/10' : ''}`}
                >
                  {selectedSession?.session_id === session.session_id && (
                    <motion.div layoutId="active-indicator" className="absolute left-0 top-0 bottom-0 w-1 bg-v2-accent" />
                  )}
                  <div className="flex justify-between items-start mb-1">
                    <p className={`font-bold text-sm tracking-tight truncate flex-1 ${selectedSession?.session_id === session.session_id ? 'text-v2-accent' : 'text-v2-text'}`}>
                      {new Date(session.start_time).toLocaleDateString()}
                    </p>
                    <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${selectedSession?.session_id === session.session_id ? 'text-v2-accent translate-x-1' : 'text-v2-border group-hover:text-v2-muted'}`} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-v2-muted font-bold uppercase tracking-tighter">
                    <span className="flex items-center gap-1"><Clock size={10} /> {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="flex items-center gap-1 bg-v2-border/10 px-1.5 py-0.5 rounded text-[8px]">{session.transcript_count} lines</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Content: Transcript Detail */}
        <div className={`flex-1 flex-col bg-white v2-card p-0 overflow-hidden shadow-xl border-v2-border/40 ${!showMobileList ? 'flex' : 'hidden md:flex'}`}>
          {selectedSession ? (
            <>
              <div className="p-4 md:p-6 border-b border-v2-border/30 bg-v2-header/5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div className="flex items-center gap-3 md:gap-4">
                  <button 
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden p-2 -ml-2 text-v2-muted hover:text-v2-text"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 rounded-xl bg-v2-accent/10 flex items-center justify-center text-v2-accent shadow-inner">
                    <MessageSquare size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg md:text-xl font-bold text-v2-text tracking-tight uppercase truncate">{selectedRoom?.name}</h2>
                    <p className="text-[10px] font-bold text-v2-muted uppercase tracking-[0.2em]">Session: {selectedSession.session_id?.slice(0, 8)}</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport('csv')}
                    className="v2-btn-secondary px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    <Download size={12} /> CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="v2-btn-secondary px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    <Download size={12} /> JSON
                  </button>
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="v2-btn-secondary px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    <Share2 size={12} /> Share
                  </button>
                </div>

                <AnimatePresence>
                  {showShareModal && (() => {
                    const text = formatTranscriptForShare();
                    const encoded = encodeURIComponent(text);
                    const whatsappUrl = `https://wa.me/?text=${encoded}`;
                    const smsUrl = `sms:?body=${encoded}`;
                    const gmailUrl = `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Aytme Transcript')}&body=${encoded}`;
                    return (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowShareModal(false)}
                      >
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                          className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold uppercase tracking-widest text-v2-text">Share Transcript</h3>
                            <button onClick={() => setShowShareModal(false)} className="text-v2-muted hover:text-v2-text">
                              <X size={18} />
                            </button>
                          </div>
                          <div className="space-y-3">
                            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#128C7E] font-bold text-sm hover:bg-[#25D366]/20 transition-colors">
                              <MessageSquare size={18} /> WhatsApp
                            </a>
                            <a href={smsUrl}
                              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 font-bold text-sm hover:bg-blue-500/20 transition-colors">
                              <MessageSquare size={18} /> SMS
                            </a>
                            <a href={gmailUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 font-bold text-sm hover:bg-rose-500/20 transition-colors">
                              <MessageSquare size={18} /> Gmail
                            </a>
                          </div>
                        </motion.div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30" ref={scrollRef}>
                {detailsLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Activity className="animate-spin text-v2-accent" size={32} />
                  </div>
                ) : transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-v2-muted/50 space-y-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-v2-border/10 flex items-center justify-center">
                      <Sparkles size={32} className="opacity-20" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-v2-text">No Transcript Found</p>
                      <p className="text-sm max-w-xs">This session might have been empty or the translator was not activated.</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-full mx-auto space-y-4">
                    {/* Language mapping for display */}
                    {(() => {
                      const langNames = {
                        'en': 'English', 'ur': 'Urdu', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
                        'ar': 'Arabic', 'hi': 'Hindi', 'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean',
                        'pt': 'Portuguese', 'ru': 'Russian', 'it': 'Italian', 'nl': 'Dutch', 'pl': 'Polish',
                        'tr': 'Turkish', 'vi': 'Vietnamese', 'id': 'Indonesian', 'fil': 'Tagalog', 'bn': 'Bengali'
                      };
                      
                      return transcripts.map((t, idx) => {
                        const speakerIdentity = String(t.speaker_identity || '').trim();
                        const speakerHint = speakerIdentity.toLowerCase();
                        const isAI = Boolean(t.is_ai) || speakerHint.includes('bot') || speakerHint.includes('ai');
                        const translatedText = t.text_translated || t.text_raw || '';
                        const hasOriginal = Boolean(t.text_raw && t.text_raw !== translatedText);
                        const sourceLang = langNames[t.source_lang] || t.source_lang?.toUpperCase() || 'Unknown';
                        const targetLang = langNames[t.target_lang] || t.target_lang?.toUpperCase() || 'Unknown';
                        
                        return (
                          <motion.div
                            key={t.id || idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex group ${isAI ? 'justify-start' : 'justify-end'}`}
                          >
                            <div className={`max-w-[85%] space-y-1 ${isAI ? 'items-start' : 'items-end'}`}>
                              <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest mb-1 flex-wrap ${isAI ? 'text-indigo-500 justify-start' : 'text-v2-muted justify-end'}`}>
                                <span className="flex items-center gap-2">
                                  {isAI ? <Sparkles size={10} /> : <User size={10} />}
                                  {isAI ? 'AI INTERPRETER' : (speakerIdentity || 'SPEAKER')}
                                </span>
                                {!isAI && t.source_lang && t.target_lang && (
                                  <span className="px-2 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-[8px] font-bold">
                                    {sourceLang} → {targetLang}
                                  </span>
                                )}
                              </div>
                              <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm border space-y-2 ${
                                isAI 
                                  ? 'bg-indigo-50 border-indigo-100 text-indigo-900 rounded-tl-none' 
                                  : 'bg-white border-v2-border/60 text-v2-text rounded-tr-none'
                              }`}>
                                {/* Translated text (primary) */}
                                <p>{translatedText || '[empty]'}</p>
                                
                                {/* Original text if different from translation */}
                                {hasOriginal && !isAI && (
                                  <p className="text-xs leading-relaxed opacity-70 italic border-l-2 border-v2-border/30 pl-3 text-v2-muted">
                                    Original: {t.text_raw}
                                  </p>
                                )}
                              </div>
                              <div className={`flex items-center gap-2 ${isAI ? 'justify-start' : 'justify-end'}`}>
                                <button
                                  onClick={() => handlePlayTranscript(t.id)}
                                  disabled={!t.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-v2-border/50 text-[9px] font-bold uppercase tracking-wider text-v2-muted hover:text-v2-text hover:border-v2-border disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Listen to this transcript"
                                >
                                  {playingTranscriptId === t.id ? <Pause size={10} /> : <Play size={10} />}
                                  {playingTranscriptId === t.id ? 'Stop' : 'Listen'}
                                </button>
                                <button
                                  onClick={() => handleDeleteTranscript(t.id)}
                                  disabled={!t.id || deletingTranscriptId === t.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-[9px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Delete transcript"
                                >
                                  {deletingTranscriptId === t.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                  Delete
                                </button>
                              </div>
                              <p className="text-[8px] text-v2-muted font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                {t.created_at ? new Date(t.created_at).toLocaleTimeString() : ''}
                              </p>
                            </div>
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-v2-muted/30 p-20 text-center">
              <FileText size={80} strokeWidth={1} className="mb-6" />
              <h3 className="text-xl font-bold text-v2-text/40 uppercase tracking-tighter">Select a session</h3>
              <p className="max-w-xs text-sm font-medium">Select a session from the sidebar to view detailed transcripts and export data.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
