import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { invitationService, roomService } from '../services/api';
import { safeOn, safeOff } from '../utils/eventUtils';
import toast from 'react-hot-toast';
import { Volume2, VolumeX, Activity, Headphones, MessageSquare, Zap, Loader2, Play, Sparkles, Globe2, User, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LANGUAGES } from './languages';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "wss://aytme-56n8aplm.livekit.cloud";
const TTS_WPM_TARGET = 160;
const CACHE_PREFIX = 'aytme_cached_audio_';

const AudioTrack = ({ track }) => {
 useEffect(() => {
 const el = track.attach();
 el.setAttribute('playsinline', '');
 el.setAttribute('webkit-playsinline', '');
 return () => {
 try {
 track.detach(el);
 el.remove();
 } catch (e) {}
 };
 }, [track]);
 return null;
};

const VideoTrack = ({ track }) => {
  const videoEl = useRef(null);
  useEffect(() => {
    if (videoEl.current && track) {
      track.attach(videoEl.current);
    }
    return () => {
      try {
        if (videoEl.current && track) track.detach(videoEl.current);
      } catch (e) {}
    };
  }, [track]);
  return <video ref={videoEl} autoPlay playsInline className="w-full h-full object-cover" />;
};

export default function Listener({ roomId, guestLkToken, guestLkUrl, guestRoomDetails }) {
 const navigate = useNavigate();
 const [isConnected, setIsConnected] = useState(false);
 const [isConnecting, setIsConnecting] = useState(false);
 const [status, setStatus] = useState('tap to start');
 const [liveTranscripts, setLiveTranscripts] = useState([]);
 const [audioTracks, setAudioTracks] = useState([]);
 const [videoTracks, setVideoTracks] = useState([]);
 const [activeSpeakerIdentity, setActiveSpeakerIdentity] = useState(null);
 const [partialCaption, setPartialCaption] = useState(null); // Live streaming partial caption
 const transcriptEndRef = useRef(null);
 const isMountedRef = useRef(true);
 const [searchParams] = useSearchParams();
 const isGuestQuery = searchParams.get('guest') === 'true';
 const resolvedGuestLkToken = guestLkToken || (isGuestQuery ? searchParams.get('token') : null);
 const resolvedGuestLkUrl = guestLkUrl || (isGuestQuery ? searchParams.get('livekit_url') : null);
 const isLegacyInviteTokenJoin = !isGuestQuery && !!searchParams.get('token') && !resolvedGuestLkToken;
 const [targetLang, setTargetLang] = useState(searchParams.get('lang') || 'English');
 const [guestName, setGuestName] = useState('');
 const audioContextRef = useRef(null);  // iOS: AudioContext unlocked on user gesture
 const incomingAudioFramesRef = useRef(new Map());

 // iOS/Safari-safe audio playback — Web Audio API primary, <Audio> fallback
 const playAudioSafely = useCallback((base64Audio) => {
   return new Promise((resolve) => {
     // Ensure AudioContext exists and is active
     if (!audioContextRef.current) {
       const AC = window.AudioContext || window.webkitAudioContext;
       if (AC) audioContextRef.current = new AC();
     }
     const ctx = audioContextRef.current;
     if (ctx && ctx.state === 'suspended') {
       ctx.resume().catch(() => {});
     }

     // Decode base64 to ArrayBuffer
     let raw;
     try {
       raw = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
     } catch (decodeErr) {
       console.error('[LISTENER-TTS] Base64 decode failed:', decodeErr);
       resolve();
       return;
     }

     // Primary: Web Audio API (works on iOS/Safari after AudioContext unlock)
     if (ctx) {
       ctx.decodeAudioData(raw.buffer.slice(0), (audioBuffer) => {
         const source = ctx.createBufferSource();
         source.buffer = audioBuffer;
         source.connect(ctx.destination);
         source.onended = () => { console.log('[LISTENER-TTS] ✓ Web Audio playback complete'); resolve(); };
         source.start(0);
         console.log('[LISTENER-TTS] 🔊 Playing via Web Audio API');
       }, (err) => {
         console.warn('[LISTENER-TTS] Web Audio decode failed, falling back to <Audio>:', err);
         playViaAudioElement(base64Audio, resolve);
       });
     } else {
       playViaAudioElement(base64Audio, resolve);
     }
   });
 }, []);

 // Fallback: HTML5 Audio element
 const playViaAudioElement = useCallback((base64Audio, resolve) => {
   try {
     const audioEl = new Audio(`data:audio/mp3;base64,${base64Audio}`);
     audioEl.onended = () => { console.log('[LISTENER-TTS] ✓ HTML5 Audio playback complete'); resolve(); };
     audioEl.onerror = (e) => { console.error('[LISTENER-TTS] HTML5 Audio error:', e); resolve(); };
     audioEl.play().catch((playErr) => {
       console.warn('[LISTENER-TTS] HTML5 Audio play blocked:', playErr);
       const ctx = audioContextRef.current;
       if (ctx && ctx.state === 'suspended') {
         ctx.resume().then(() => {
           audioEl.play().catch(e2 => { console.error('[LISTENER-TTS] Final play failed:', e2); resolve(); });
         });
       } else {
         resolve();
       }
     });
   } catch (err) {
     console.error('[LISTENER-TTS] Failed to create audio element:', err);
     resolve();
   }
 }, []);

// Attempt best-effort partial decode & playback for chunked MP3 payloads.
const attemptPartialPlayback = useCallback(async (entry) => {
  if (!entry || entry.streamPlayed) return false;
  // Don't attempt until ALL chunks have arrived — WAV is not streamable in browsers;
  // a partial buffer decodes only the first N ms and sets streamPlayed=true, silencing
  // tryFinalizeChunkedAudio which would have played the complete audio.
  if (entry.received < entry.totalChunks) return false;
  try {
    const parts = (entry.chunks || []).filter(Boolean);
    if (parts.length === 0) return false;
    const joined = parts.join('');
    if (!audioContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioContextRef.current = new AC();
    }
    const ctx = audioContextRef.current;
    if (!ctx) return false;
    const raw = Uint8Array.from(atob(joined), c => c.charCodeAt(0)).buffer;
    const audioBuffer = await new Promise((res, rej) => ctx.decodeAudioData(raw, res, rej));
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.onended = () => { console.log('[LISTENER-TTS] Partial streamed playback complete'); };
    src.start(0);
    entry.streamPlayed = true;
    return true;
  } catch (err) {
    console.debug('[LISTENER-TTS] Partial decode/play attempt failed (awaiting more chunks)');
    return false;
  }
}, []);

 // 🔐 STABILITY: Refs to prevent stale closures in event handlers
 const currentTargetLangRef = useRef(targetLang);
 const currentAttachTrackRef = useRef(null);

 useEffect(() => {
   currentTargetLangRef.current = targetLang;
 }, [targetLang]);

 useEffect(() => {
  transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [liveTranscripts]);

 const roomRef = useRef(null);

 const addLiveTranscript = useCallback((t) => {
  setLiveTranscripts(prev => [t, ...prev].slice(0, 50));
 }, []);

 const attachTrack = useCallback((track, publication) => {
   if (track.kind !== 'audio') return;
   
   // Logic: If track has metadata, it's a translation. We only want it if it matches targetLang.
   // If it has no metadata, it might be the host's original audio.
   let isMatch = true;
   try {
     const metadata = JSON.parse(publication?.metadata || '{}');
     if (metadata.type === 'translation') {
       isMatch = metadata.language?.toLowerCase() === targetLang.toLowerCase();
     }
   } catch (e) {}

   if (!isMatch) {
     console.log(`[LISTENER] Skipping track: ${publication?.sid} (Language mismatch)`);
     return;
   }

   setAudioTracks(prev => {
   if (prev.find(t => t.sid === track.sid)) return prev;
   return [...prev, track];
   });
  }, [targetLang]);

 const attachVideoTrack = useCallback((track, participant) => {
   if (track.kind !== 'video') return;
   const identity = participant?.identity || track.sid;
   setVideoTracks(prev => {
     if (prev.find(v => v.track?.sid === track.sid)) return prev;
     const next = prev.filter(v => v.identity !== identity);
     return [...next, { track, identity }];
   });
 }, []);

  useEffect(() => {
    currentAttachTrackRef.current = attachTrack;
  }, [attachTrack]);

 const handleJoin = async () => {
  if (isConnected || isConnecting) return;
  if (!isMountedRef.current) return;
  setIsConnecting(true);
  setStatus('connecting...');

  // iOS/Safari: Unlock AudioContext on this user gesture so broadcast_audio playback works
  try {
    if (!audioContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioContextRef.current = new AC();
        const buf = audioContextRef.current.createBuffer(1, 1, 22050);
        const src = audioContextRef.current.createBufferSource();
        src.buffer = buf;
        src.connect(audioContextRef.current.destination);
        src.start(0);
        console.log('[iOS] Listener AudioContext unlocked via user gesture');
      }
    }
  } catch (acErr) {
    console.warn('[iOS] AudioContext unlock failed (non-fatal):', acErr);
  }
  
  try {
    // 1. Resolve token and URL (guest credentials from /invite flow first)
  let token, lkUrl;

    if (resolvedGuestLkToken) {
      token = resolvedGuestLkToken;
      lkUrl = resolvedGuestLkUrl || LIVEKIT_URL;
    } else if (isLegacyInviteTokenJoin) {
      const urlToken = searchParams.get('token');
    try {
      const joinData = await invitationService.joinWithToken(urlToken, guestName || 'Listener');
      token = joinData.token;
      lkUrl = joinData.livekit_url || LIVEKIT_URL;
      if (joinData.access_token) {
          sessionStorage.setItem('token', joinData.access_token);
      }
      console.log('[LISTENER] Exchanged invite token for LiveKit guest credentials');
    } catch (apiErr) {
      console.warn('[LISTENER] Invite token exchange failed', apiErr);
      throw new Error("Invalid or expired invite link.");
    }
  } else {
    try {
      const result = await roomService.getToken(roomId);
      token = typeof result === 'string' ? result : result?.token;
      lkUrl = result?.url || LIVEKIT_URL;
    } catch (apiErr) {
      console.warn('[LISTENER] Token API failed', apiErr);
      throw apiErr;
    }
  }

  // 2. Safety: Ignore localhost LiveKit URL if we are on a remote IP
  if (lkUrl.includes('localhost') && window.location.hostname !== 'localhost') {
  console.warn('[LISTENER] Refusing localhost LiveKit URL on remote client, using fallback');
  lkUrl = LIVEKIT_URL;
  }

  const room = new Room({
  adaptiveStream: true,
  });

  roomRef.current = room;

  safeOn(room, RoomEvent.TrackSubscribed, (track, publication, participant) => {
    currentAttachTrackRef.current?.(track, publication);
    if (track.kind === 'video') {
      attachVideoTrack(track, participant);
    }
  });
  safeOn(room, RoomEvent.TrackUnsubscribed, (track) => {
    if (!isMountedRef.current) return;
    if (track.kind === 'audio') {
      setAudioTracks(prev => prev.filter(t => t.sid !== track.sid));
    }
    if (track.kind === 'video') {
      setVideoTracks(prev => prev.filter(v => v.track?.sid !== track.sid));
    }
  });

  safeOn(room, RoomEvent.ActiveSpeakersChanged, (speakers) => {
    if (!isMountedRef.current) return;
    const primary = speakers?.[0]?.identity || null;
    setActiveSpeakerIdentity(primary);
  });

  safeOn(room, RoomEvent.DataReceived, (payload) => {
    if (!isMountedRef.current) return;
    try {
      const str = new TextDecoder().decode(payload);
      if (!str) return;
      const data = JSON.parse(str);

      const now = Date.now();
      for (const [msgId, entry] of incomingAudioFramesRef.current.entries()) {
        if (now - entry.createdAt > 120000) {
          incomingAudioFramesRef.current.delete(msgId);
        }
      }

      const tryFinalizeChunkedAudio = (messageId) => {
        const entry = incomingAudioFramesRef.current.get(messageId);
        if (!entry) return false;
        if (entry.received < entry.totalChunks) return false;

        // If partial streaming already played this message, skip final playback
        if (entry.streamPlayed) {
          incomingAudioFramesRef.current.delete(messageId);
          return true;
        }

        const joined = entry.chunks.join('');
        if (!joined) {
          incomingAudioFramesRef.current.delete(messageId);
          return false;
        }

        console.log(`[LISTENER] 🔊 Reassembled chunked audio ${messageId} (${entry.totalChunks} chunks)`);
        try {
          const cacheKey = `${CACHE_PREFIX}${messageId}`;
          try { localStorage.setItem(cacheKey, JSON.stringify({ audio: joined, translated_text: entry.translated_text || '', text_original: entry.source_text || '', createdAt: entry.createdAt || Date.now() })); } catch (e) { console.warn('[LISTENER-CACHE] Failed to cache audio', e); }
        } catch (e) {}
        playAudioSafely(joined, entry.translated_text || '');
        incomingAudioFramesRef.current.delete(messageId);
        return true;
      };

      if (data.type === 'broadcast_audio_start') {
        const totalChunks = Number(data.total_chunks) || 0;
        if (totalChunks <= 0) return;

        incomingAudioFramesRef.current.set(data.id, {
          createdAt: now,
          totalChunks,
          received: 0,
          chunks: new Array(totalChunks).fill(''),
          ended: false,
          streamPlayed: false,
        });

        if (data.translated_text || data.source_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `bas-${Date.now()}`,
            speaker: 'AI Translator',
            text: data.translated_text || '',
            text_original: data.source_text || '',
            is_ai: true,
            language: data.target_lang,
          }, ...prev].slice(0, 50));
        }
        return;
      }

      if (data.type === 'broadcast_audio_chunk') {
        const entry = incomingAudioFramesRef.current.get(data.id);
        if (!entry) return;

        const idx = Number(data.chunk_index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= entry.totalChunks) return;

        if (!entry.chunks[idx]) {
          entry.chunks[idx] = data.chunk_data || '';
          entry.received += 1;
          try {
            attemptPartialPlayback(entry).catch(() => {});
          } catch (e) {}
        }

        if (entry.ended) {
          tryFinalizeChunkedAudio(data.id);
        }
        return;
      }

      if (data.type === 'broadcast_audio_end') {
        const entry = incomingAudioFramesRef.current.get(data.id);
        if (!entry) return;
        entry.ended = true;
        tryFinalizeChunkedAudio(data.id);
        return;
      }
      
      if (data.type === 'broadcast_audio' && data.audio) {
        // Broadcast mode: Speaker sent translated audio for listeners to play
        console.log('[LISTENER] 🔊 Received broadcast audio — playing via safe playback...');
        playAudioSafely(data.audio, data.translated_text || '');

        // Also show the transcript
        if (data.translated_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `ba-${Date.now()}`,
            speaker: 'AI Translator',
            text: data.translated_text,
            text_original: data.source_text,
            is_ai: true,
            language: data.target_lang
          }, ...prev].slice(0, 50));
        }
        return;
      }

      if (data.type === 'broadcast_audio_notice') {
        if (data.translated_text || data.source_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `ban-${Date.now()}`,
            speaker: 'AI Translator',
            text: data.translated_text || '',
            text_original: data.source_text || '',
            is_ai: true,
            language: data.target_lang,
          }, ...prev].slice(0, 50));
        }
        return;
      }

      if (data.type === 'caption' || data.type === 'transcript') {
        // Clear any partial caption when a final caption arrives
        setPartialCaption(null);
        // FILTER: Only show translated text if it matches our target language
        const isForMe = data.is_ai ? (data.language?.toLowerCase() === currentTargetLangRef.current.toLowerCase()) : false;
        
        if (!isForMe && data.is_ai) return;
        if (!data.text?.trim()) return;

        setLiveTranscripts(prev => {
          const existingIdx = prev.findIndex(item => item.id === data.id);
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = { 
              ...updated[existingIdx], 
              text: data.text,
              text_original: data.text_original || updated[existingIdx].text_original 
            };
            return updated;
          }
          return [{
            id: data.id || `msg-${Date.now()}-${Math.random()}`,
            speaker: data.is_ai ? 'AI Translator' : (data.speaker || 'Speaker'),
            text: data.text,
            text_original: data.text_original,
            is_ai: !!data.is_ai,
            language: data.language
          }, ...prev].slice(0, 50);
        });
      }

      // ── SESSION ENDED: Host explicitly ended the session ──
      if (data.type === 'session_ended') {
        console.log('[LISTENER] Host ended the session');
        toast('The host has ended this session', { icon: '📢', duration: 5000 });
        if (roomRef.current) {
          try { roomRef.current.disconnect(); } catch (_) {}
        }
        setIsConnected(false);
        setStatus('session ended');
        setTimeout(() => navigate('/'), 3000);
        return;
      }
    } catch (e) { console.error('[SAFE-UI] Listener parse error', e); }
  });

  safeOn(room, RoomEvent.Disconnected, () => {
    if (!isMountedRef.current) return;
    setIsConnected(false);
    setStatus('disconnected');
  });

  await room.connect(lkUrl, token);
  if (!isMountedRef.current) {
  room.disconnect();
  return;
  }
  setIsConnected(true);
  setStatus('listening');
  toast.success("Joined as listener");

  } catch (err) {
  console.error("Listener connection failed", err);
  if (isMountedRef.current) {
  setStatus('failed');
  toast.error("Failed to join as listener");
  }
  } finally {
  if (isMountedRef.current) {
  setIsConnecting(false);
  }
  }
 };

 useEffect(() => {
   isMountedRef.current = true;
   // NOTE: We do NOT auto-connect here. The user MUST click "Start Listening" button
   // to provide the user gesture required by iOS/Safari for AudioContext + audio playback.
   return () => {
     isMountedRef.current = false;
     if (roomRef.current) {
       safeOff(roomRef.current, RoomEvent.TrackSubscribed);
       safeOff(roomRef.current, RoomEvent.TrackUnsubscribed);
       safeOff(roomRef.current, RoomEvent.ActiveSpeakersChanged);
       safeOff(roomRef.current, RoomEvent.DataReceived);
       safeOff(roomRef.current, RoomEvent.Disconnected);
       roomRef.current.disconnect();
     }
      incomingAudioFramesRef.current.clear();
   };
  }, [roomId]);

 const activeVideoTrack = activeSpeakerIdentity
   ? videoTracks.find(v => v.identity === activeSpeakerIdentity)?.track
   : null;
 const visibleVideoTrack = activeVideoTrack || videoTracks[0]?.track || null;

 return (
 <div className="v2-app min-h-screen relative overflow-hidden flex flex-col p-4 md:p-0">
 <div id="v2-audio-container" style={{ display: 'none' }}>
 {audioTracks.map(t => <AudioTrack key={t.sid} track={t} />)}
 </div>
 {/* Start Overlay */}
 <AnimatePresence>
 {!isConnected && (
 <motion.div 
 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
 className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex items-center justify-center p-6"
 >
 <div className="v2-card max-w-md w-full text-center space-y-8 p-12 shadow-2xl">
  <div className="flex justify-center">
  <div className="w-24 h-24 bg-v2-header rounded-full flex items-center justify-center text-v2-accent">
  <Headphones size={48} className="animate-pulse" />
  </div>
  </div>
  <div>
  <h2 className="text-3xl font-bold mb-2">Listen In</h2>
  <p className="text-v2-muted">You are joining a live session as a listener. Audio will play automatically once connected.</p>
  </div>
  
  {isLegacyInviteTokenJoin && (
    <div className="relative text-left">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-v2-muted mb-2">Your Display Name</label>
      <div className="relative">
        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" />
        <input 
          autoFocus
          type="text" 
          value={guestName} 
          onChange={e => setGuestName(e.target.value)} 
          placeholder="Enter your name to join..." 
          className="w-full pl-12 pr-4 py-3 bg-v2-header border border-v2-border/50 rounded-lg outline-none focus:border-v2-accent focus:bg-white text-v2-text font-medium transition-all"
        />
      </div>
    </div>
  )}

  <button 
  onClick={handleJoin} 
  disabled={isConnecting}
  className="v2-btn w-full py-5 text-xl flex items-center justify-center gap-4"
  >
  {isConnecting ? <Loader2 className="animate-spin" /> : <Play />} 
  {isConnecting ? 'Initializing...' : 'Start Listening'}
  </button>
  </div>
 </motion.div>
 )}
 </AnimatePresence>

 <header className="v2-header px-8 py-4 flex justify-between items-center border-b border-v2-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
 <div className="flex items-center gap-6">
 <div>
 <h1 className="text-2xl font-bold tracking-tight">Listening: {guestRoomDetails?.name || roomId.slice(0,8)}</h1>
 <div className="flex items-center gap-2">
 <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
 <span className="text-xs text-v2-muted uppercase tracking-widest">{status}</span>
 </div>
 </div>
 </div>

 <div className="flex items-center gap-3">
    <div className="flex flex-col items-end">
        <span className="text-[10px] font-bold text-v2-muted uppercase tracking-widest">Translation Language</span>
        <select 
            value={targetLang}
            onChange={(e) => {
                setTargetLang(e.target.value);
                // Reset audio tracks to force re-attach with correct language
                setAudioTracks([]);
                roomRef.current?.remoteParticipants.forEach(p => {
                    p.trackPublications.forEach(pub => {
                        if (pub.track) attachTrack(pub.track, pub);
                    });
                });
            }}
            className="bg-transparent border-none text-v2-accent font-black text-xs uppercase tracking-tighter outline-none cursor-pointer text-right appearance-none"
        >
            {LANGUAGES.map(l => (
                <option key={l} value={l} className="bg-white text-slate-800">{l}</option>
            ))}
        </select>
    </div>
    <div className="p-2.5 bg-v2-accent/10 rounded-lg text-v2-accent">
        <Globe2 size={18} />
    </div>
    {/* Leave Meeting Button */}
    <button
      onClick={() => {
        if (roomRef.current) {
          try { roomRef.current.disconnect(); } catch (_) {}
        }
        navigate('/');
      }}
      className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-all"
      title="Leave Meeting"
    >
      <LogOut size={18} />
    </button>
  </div>
 </header>

 <main className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-8 p-4 md:p-8 max-w-[1600px] mx-auto w-full">
 {/* Listening Status */}
 <div className="flex-[2] flex flex-col gap-8 h-full">
 {visibleVideoTrack && (
 <div className="v2-card p-0 overflow-hidden bg-white border-v2-border">
   <div className="px-5 py-3 border-b border-v2-border bg-gray-50/50">
     <p className="text-[10px] font-bold uppercase tracking-widest text-v2-muted">Speaker Video</p>
   </div>
   <div className="aspect-video w-full bg-black">
     <VideoTrack track={visibleVideoTrack} />
   </div>
 </div>
 )}
 <div className="v2-card flex-1 flex flex-col items-center justify-center relative bg-white border-v2-border p-12">
 <motion.div 
 animate={{ scale: isConnected ? [1, 1.05, 1] : 1 }}
 transition={{ duration: 2, repeat: Infinity }}
 className={`w-48 h-48 rounded-full flex items-center justify-center mb-8 ${isConnected ? 'bg-[#f0fff4] text-v2-accent shadow-lg' : 'bg-gray-50 text-v2-border'}`}
 >
 <Volume2 size={80} className={isConnected ? "animate-pulse" : ""} />
 </motion.div>
 
 <div className="text-center">
 <h2 className="text-3xl font-bold mb-2">{isConnected ? 'Audio stream active' : 'Waiting for audio...'}</h2>
 <p className="text-v2-muted text-lg">You are listening to the real-time AI translation stream.</p>
 </div>
 </div>
 
 <div className="v2-card p-8 bg-v2-header border-v2-accent/20 flex items-center gap-4">
 <Sparkles className="text-v2-accent" size={24} />
 <div>
 <p className="font-bold text-v2-text">High-Fidelity Audio</p>
 <p className="text-sm text-v2-muted font-medium ">Powered by OpenAI Realtime Voice</p>
 </div>
 </div>
 </div>

 {/* Transcripts Side Panel */}
 <div className="flex-1 flex flex-col min-w-[350px] lg:max-w-[450px] h-full">
 <div className="v2-card flex-1 flex flex-col bg-white overflow-hidden p-0">
 <div className="flex items-center gap-3 p-6 border-b border-v2-border bg-gray-50/50">
 <MessageSquare size={20} className="text-v2-accent" />
 <h2 className="text-lg font-bold">Live Transcripts</h2>
 </div>
 
 <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
 <AnimatePresence initial={false}>
 {liveTranscripts.length === 0 && (
 <div className="h-full flex flex-col items-center justify-center text-v2-muted/60 space-y-4 text-center py-16">
 <Activity size={40} className="opacity-20 animate-pulse" />
 <p className="text-sm">Listening for speech events...<br/>Transcript stream is active.</p>
 </div>
 )}
 {liveTranscripts.map((t) => (
 <motion.div 
 key={t.id}
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className={`p-4 rounded-md border ${t.is_ai ? 'bg-indigo-50/80 border-indigo-200/60' : 'bg-gray-50/80 border-v2-border'}`}
 >
 <div className="flex justify-between items-center mb-1">
 <span className={`text-[10px] font-bold uppercase tracking-wider ${t.is_ai ? 'text-indigo-500' : 'text-v2-muted'}`}>
 {t.is_ai ? '🤖 AI Translator' : `🎙 ${t.speaker}`}
 </span>
 </div>
 <p className="text-sm leading-relaxed text-v2-text">{t.text}</p>
 </motion.div>
 ))}
 {/* Live partial caption — pulsing dots while speaker is talking */}
 {partialCaption && (
   <motion.div
     initial={{ opacity: 0 }}
     animate={{ opacity: 1 }}
     className="p-4 rounded-md border bg-blue-50/60 border-blue-200/60 animate-pulse"
   >
     <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
       🎤 Speaking...
     </span>
     <p className="text-sm italic text-slate-500/70 leading-relaxed mt-1">
       {partialCaption.text}
     </p>
   </motion.div>
 )}
 </AnimatePresence>
 <div ref={transcriptEndRef} />
 </div>
 </div>
 </div>
 </main>

 {/* Fixed bottom leave button for mobile */}
 {isConnected && (
   <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-v2-border z-50 flex justify-center lg:hidden"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
     <button
       onClick={() => {
         if (roomRef.current) { try { roomRef.current.disconnect(); } catch (_) {} }
         navigate('/');
       }}
       className="w-full max-w-md py-4 bg-rose-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg"
     >
       <LogOut size={18} /> Leave Meeting
     </button>
   </div>
 )}
 </div>
 );
}
