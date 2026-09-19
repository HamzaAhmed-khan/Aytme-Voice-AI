import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, Track, ConnectionState, DisconnectReason, DataPacket_Kind } from 'livekit-client';
import { safeOn, safeOff } from '../utils/eventUtils';
import { roomService, billingService } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useOrganizationStore } from '../store/organizationStore';
import { buildInviteLink } from '../utils/shareLinks';
import toast from 'react-hot-toast';
import {
  Mic, Activity, Sparkles, MessageSquare, Zap, Loader2,
  Users, Bot, LogOut, Settings, ShieldCheck, Share2, XCircle, CheckCircle2,
  X, ChevronUp, ChevronDown, PhoneCall, Beaker, Copy, CheckCheck, Link2,
  Mail, MessageCircle, Phone, Video, VideoOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QuotaLimitModal from '../components/QuotaLimitModal';
import { CaptionTestMode } from './CaptionTestMode';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "wss://aytme-56n8aplm.livekit.cloud";

// ─── ERROR BOUNDARY ──────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("[STAGE-CRITICAL]", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-white text-slate-900 font-sans">
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-6 border border-rose-200 shadow-lg">
            <XCircle size={40} />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter mb-3">Interface Halted</h2>
          <p className="text-slate-500 text-sm max-w-sm mb-8 leading-relaxed">
             The translation interface encountered a critical state error. Please refresh to restore the stage.
          </p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-xs tracking-widest transition-all shadow-lg">
            Restart Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── SUBCOMPONENTS ──────────────────────────────────────────

const ControlButton = ({ icon: Icon, label, isActive, isLoading, isPTT, onToggle, onDown, onUp, activeColor = "bg-indigo-600", isDisabled = false }) => {
  const isHolding = useRef(false);
  const handlePointerDown = (e) => {
    if (isDisabled || !onDown) return;
    if (isPTT) {
      isHolding.current = true;
      onDown();
      const cleanup = () => {
        if (isHolding.current) {
          isHolding.current = false;
          onUp();
        }
        window.removeEventListener('pointerup', cleanup);
        window.removeEventListener('pointercancel', cleanup);
      };
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
    }
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onClick={!isPTT ? onToggle : undefined}
      disabled={isDisabled || isLoading}
      className={`relative flex flex-col items-center justify-center gap-1.5 p-3 md:p-4 rounded-2xl transition-all duration-300 select-none touch-none border
        ${isActive ? `${activeColor} text-white border-transparent shadow-lg ring-4 ring-indigo-500/20` : `bg-white border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600`}
        ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale' : ''}
      `}
    >
      <div className={`p-2 md:p-2.5 rounded-xl transition-all ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />}
      </div>
      <span className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.15em]">{label}</span>
      {isActive && !isPTT && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />}
    </button>
  );
};

const TranscriptItem = ({ transcript }) => {
  // WhatsApp-style: is_local=true → sent (right/indigo), is_local=false → received (left/gray)
  const isSent = transcript.is_local !== false; // default to sent for backwards compat
  const hasTranslation = !!transcript.translated_text;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex flex-col max-w-[85%] ${isSent ? 'self-end' : 'self-start'}`}
    >
      <div className={`px-4 py-3 rounded-2xl border ${
        isSent 
          ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-none shadow-lg shadow-indigo-200' 
          : 'bg-white text-slate-800 border-slate-200 rounded-tl-none shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-1.5 opacity-50">
          <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">{transcript.speaker}</span>
          <span className="text-[7px] font-bold">{new Date(transcript.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        
        {/* If this is a translation packet from the AI interpreter */}
        {hasTranslation ? (
          <div className="space-y-2">
            <p className={`text-[10px] md:text-xs leading-relaxed opacity-70 italic border-l-2 pl-2 ${isSent ? 'border-white/30' : 'border-slate-300'}`}>
              {transcript.text}
            </p>
            <p className="text-sm md:text-base leading-relaxed font-bold tracking-tight">
              {transcript.translated_text}
            </p>
          </div>
        ) : (
          <p className="text-xs md:text-sm leading-relaxed font-medium tracking-tight">
            {transcript.text}
          </p>
        )}

        {!transcript.is_final && <div className="flex gap-1 mt-2"><div className="w-1 h-1 bg-current opacity-40 rounded-full animate-bounce" /><div className="w-1 h-1 bg-current opacity-40 rounded-full animate-bounce delay-75" /></div>}
      </div>
    </motion.div>
  );
};

const AudioTrack = ({ track }) => {
  const audioEl = useRef(null);
  useEffect(() => {
    if (audioEl.current && track) {
      track.attach(audioEl.current);
    }
    return () => { if (audioEl.current && track) try { track.detach(audioEl.current); } catch (e) {} };
  }, [track]);
  return <audio ref={audioEl} autoPlay playsInline webkit-playsinline="true" className="hidden" />;
};

const VideoTrack = ({ track, isLocal }) => {
  const videoEl = useRef(null);
  useEffect(() => {
    if (videoEl.current && track) {
      track.attach(videoEl.current);
      const el = videoEl.current;

      const tryPlay = () => {
        if (!el) return;
        // iOS requires muted for autoplay — keep permanently muted since audio
        // is handled by the separate hidden AudioTrack <audio> element.
        el.muted = true;
        const p = el.play();
        if (p?.catch) p.catch(err => {
          console.warn('[VideoTrack] play() rejected:', err.name, err.message);
          setTimeout(() => { if (el) el.play().catch(() => {}); }, 500);
        });
      };

      tryPlay();

      // iOS: fires when data loads (track may buffer before first frame)
      el.addEventListener('loadeddata', tryPlay);
      // iOS: fires when stream stalls mid-play
      el.addEventListener('stalled', tryPlay);
      // iOS: fires when video is waiting for more data
      el.addEventListener('waiting', tryPlay);

      const handleVisibility = () => { if (!document.hidden && el) tryPlay(); };
      document.addEventListener('visibilitychange', handleVisibility);

      // iOS: MediaStreamTrack can end silently (resource pressure, background, permission revoke).
      // onended fires immediately — don't wait for the frozen-frame detector.
      const mediaTrack = track.mediaStreamTrack;
      const onTrackEnded = () => {
        console.warn('[VideoTrack][iOS] MediaStreamTrack ended silently — readyState:', mediaTrack?.readyState);
        try { track.detach(el); } catch (_) {}
        setTimeout(() => { try { track.attach(el); } catch (_) {} tryPlay(); }, 300);
      };
      if (mediaTrack) mediaTrack.addEventListener('ended', onTrackEnded);

      // iOS frozen-frame detector — currentTime stops advancing on a live stream when frozen.
      // Runs every 1 s (was 2 s) so iOS drops are caught within 2 ticks (2 s) instead of 4 s.
      let lastTime = -1;
      let frozenTicks = 0;
      const keepAlive = setInterval(() => {
        if (!el || !track) return;
        if (el.paused || el.readyState < 2) {
          console.log('[VideoTrack] Keep-alive: paused/no-data, retrying play');
          tryPlay();
          return;
        }
        const ct = el.currentTime;
        if (ct === lastTime) {
          if (++frozenTicks >= 2) {
            frozenTicks = 0;
            console.warn('[VideoTrack] currentTime frozen — reattaching LiveKit track');
            try { track.detach(el); } catch (_) {}
            setTimeout(() => { try { track.attach(el); } catch (_) {} tryPlay(); }, 100);
          }
        } else {
          frozenTicks = 0;
          lastTime = ct;
        }
      }, 1000);

      return () => {
        clearInterval(keepAlive);
        el.removeEventListener('loadeddata', tryPlay);
        el.removeEventListener('stalled', tryPlay);
        el.removeEventListener('waiting', tryPlay);
        document.removeEventListener('visibilitychange', handleVisibility);
        if (mediaTrack) mediaTrack.removeEventListener('ended', onTrackEnded);
        try { track.detach(el); } catch (e) {}
      };
    }
    return () => { if (videoEl.current && track) try { track.detach(videoEl.current); } catch (e) {} };
  }, [track]);
  return (
    <video
      ref={videoEl}
      autoPlay
      playsInline
      webkit-playsinline=""
      x-webkit-airplay="allow"
      muted
      className="w-full h-full object-cover"
    />
  );
};

// Loading placeholder shown while LiveKit is publishing the local camera track.
// Deliberately does NOT call getUserMedia — LiveKit already acquired the camera
// via setCameraEnabled(). A second independent getUserMedia call causes a camera
// resource conflict on iOS that silently drops the LiveKit-published track.
const LocalCameraFallback = () => (
  <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-3">
    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    <span className="text-slate-400 text-xs font-medium tracking-wide">Starting camera…</span>
  </div>
);

// ── Realtime PTT helpers ──────────────────────────────────────────────────────

const _STAGE_WORKLET_CODE = `
class PCMCaptureStageProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._CHUNK = 480;
    this._ratio = sampleRate / 24000;
    // 8-tap Hanning-windowed sinc FIR low-pass — cutoff at Nyquist of target rate
    const N = 8, cutoff = 0.5 / this._ratio;
    this._fir = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const n = i - (N - 1) / 2;
      const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      this._fir[i] = (n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)) * hann;
    }
    const sum = this._fir.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) this._fir[i] /= sum;
    this._hist = new Float32Array(N);
    this._histIdx = 0;
    this._phase = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const N = this._fir.length;
    for (let i = 0; i < ch.length; i++) {
      this._hist[this._histIdx % N] = ch[i];
      this._histIdx++;
      this._phase += 1;
      if (this._phase >= this._ratio) {
        this._phase -= this._ratio;
        let out = 0;
        for (let k = 0; k < N; k++) {
          out += this._fir[k] * this._hist[(this._histIdx - 1 - k + N) % N];
        }
        this._buf.push(out);
      }
    }
    while (this._buf.length >= this._CHUNK) {
      const slice = this._buf.splice(0, this._CHUNK);
      const pcm = new Int16Array(this._CHUNK);
      for (let i = 0; i < this._CHUNK; i++) {
        pcm[i] = Math.round(Math.max(-1, Math.min(1, slice[i])) * 32767);
      }
      this.port.postMessage({ type: 'audio', buf: pcm.buffer }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture-stage', PCMCaptureStageProcessor);
`;

let _stageWorkletBlobUrl = null;
function _stageWorkletUrl() {
  if (!_stageWorkletBlobUrl) {
    const blob = new Blob([_STAGE_WORKLET_CODE], { type: 'application/javascript' });
    _stageWorkletBlobUrl = URL.createObjectURL(blob);
  }
  return _stageWorkletBlobUrl;
}

function _pcm16ToWavBase64(pcm16Chunks) {
  const totalSamples = pcm16Chunks.reduce((sum, ch) => sum + ch.length, 0);
  if (totalSamples === 0) return '';
  const combined = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of pcm16Chunks) { combined.set(chunk, offset); offset += chunk.length; }
  const dataLen = combined.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true);
  ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true); v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(combined);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

const _LANG_CODE_TO_NAME = {
  'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
  'pt': 'Portuguese', 'nl': 'Dutch', 'ru': 'Russian', 'yo': 'Yoruba', 'sw': 'Swahili',
  'ha': 'Hausa', 'am': 'Amharic', 'zu': 'Zulu', 'ig': 'Igbo', 'af': 'Afrikaans',
  'ar': 'Arabic', 'ur': 'Urdu', 'hi': 'Hindi', 'bn': 'Bengali', 'fa': 'Persian (Farsi)',
  'tr': 'Turkish', 'zh': 'Chinese (Simplified)', 'zh-tw': 'Chinese (Traditional)',
  'ja': 'Japanese', 'ko': 'Korean', 'th': 'Thai', 'vi': 'Vietnamese', 'id': 'Indonesian',
  'ms': 'Malay', 'pl': 'Polish', 'uk': 'Ukrainian', 'cs': 'Czech', 'sk': 'Slovak',
  'hu': 'Hungarian', 'ro': 'Romanian', 'bg': 'Bulgarian', 'el': 'Greek', 'sv': 'Swedish',
  'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish', 'he': 'Hebrew', 'ta': 'Tamil',
  'te': 'Telugu', 'mr': 'Marathi', 'pa': 'Punjabi', 'gu': 'Gujarati', 'si': 'Sinhala',
  'ne': 'Nepali', 'tl': 'Tagalog (Filipino)',
};

function _langCodeToName(code) {
  if (!code) return 'English';
  if (code.length > 3 && code[0] === code[0].toUpperCase()) return code;
  return _LANG_CODE_TO_NAME[code.toLowerCase()] || code;
}

const normalizeMode = (rawMode) => {
  const mode = String(rawMode || '').toLowerCase().trim();
  if (!mode) return null;
  if (mode === 'group') return 'talk_together';
  return mode;
};

// DataChannel absolute max payload is 65535 bytes. Keep a small transport headroom
// and then compute chunk boundaries so each packet stays under the hard cap.
const DC_ABSOLUTE_LIMIT_BYTES = 65535;
const DC_TRANSPORT_HEADROOM_BYTES = 2 * 1024;
const DC_SOFT_LIMIT_BYTES = 60 * 1024;
const DC_HARD_LIMIT_BYTES = DC_ABSOLUTE_LIMIT_BYTES - DC_TRANSPORT_HEADROOM_BYTES;
const DC_MAX_RETRIES = 3;
const DC_AUDIO_CHUNK_CHARS = 62000;       // Near-max upper bound; exact chunk size is auto-fitted per packet
const DC_AUDIO_MIN_CHUNK_CHARS = 2000;
// Maximum recording length (seconds). No practical limit — streaming chunks handle long speech.
const MAX_RECORD_SECONDS = parseInt(import.meta.env.VITE_MAX_RECORD_SECONDS || '300', 10);
// Streaming chunk interval (ms). Each chunk is sent for STT independently.
const STREAM_CHUNK_INTERVAL_MS = parseInt(import.meta.env.VITE_STREAM_CHUNK_INTERVAL_MS || '1000', 10);
const TTS_WPM_TARGET = 160; // words-per-minute target for playback normalization
const CACHE_PREFIX = 'aytme_cached_audio_';

const getGuestRoomDetails = (roomId) => {
  if (!roomId) return null;
  try {
    const raw = sessionStorage.getItem(`aytme_guest_room_details_${roomId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Stage] Failed to parse guest room details', err);
    return null;
  }
};

function Stage({ roomId, guestLkToken, guestLkUrl, guestRoomDetails }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const modeFromQuery = searchParams.get('mode');
  const isGuestQuery = searchParams.get('guest') === 'true';
  const autoJoinRequested = searchParams.get('auto_join') === '1';
  const resolvedGuestRoomDetails = useMemo(
    () => guestRoomDetails || getGuestRoomDetails(roomId),
    [guestRoomDetails, roomId]
  );
  const resolvedGuestLkToken = guestLkToken || (isGuestQuery ? searchParams.get('token') : null);
  const resolvedGuestLkUrl = guestLkUrl || (isGuestQuery ? searchParams.get('livekit_url') : null);
  const isGuestSession = Boolean(isGuestQuery || guestLkToken);
  const { user } = useAuthStore();
  const { currentOrg, fetchSubscription } = useOrganizationStore();

  // ─── STATE ─────────────────────────────────────────────
  const [connection, setConnection] = useState({ state: 'idle', status: 'Ready', error: null });
  const [participants, setParticipants] = useState([]);
  const [roomDetails, setRoomDetails] = useState(() => resolvedGuestRoomDetails || null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [videoTracks, setVideoTracks] = useState({});
  const [isPTT, setIsPTT] = useState(true);
  const [isTalking, setIsTalking] = useState(false);
  const [activeMic, setActiveMic] = useState(null); 
  const [botState, setBotState] = useState('inactive'); 
  const [aiStatus, setAiStatus] = useState('listening'); 
  const [aiReady, setAiReady] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState([]);
  const [partialCaption, setPartialCaption] = useState(null); // Foggy/live STT text
  const partialCaptionTimerRef = useRef(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  // Recording countdown state (local user only)
  const [recordRemainingSec, setRecordRemainingSec] = useState(0); // kept as fallback UI
  const recordTimerRef = useRef(null);
  const recordStartTsRef = useRef(null);
  // Streaming STT state
  const [streamingText, setStreamingText] = useState(''); // Accumulated partial STT text
  const streamingTextRef = useRef(''); // kept for UI ref (streamingText display)
  const [quotaModal, setQuotaModal] = useState({ open: false, info: null });
  const [showRelay, setShowRelay] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showReconnectBanner, setShowReconnectBanner] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState(null);
  const [showTestMode, setShowTestMode] = useState(false);
  const [localAIEnabled, setLocalAIEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const cachedInviteTokenRef = useRef(null); // Cache invite token per room to avoid creating duplicates

  const intentMode = normalizeMode(modeFromQuery || resolvedGuestRoomDetails?.mode || roomDetails?.mode);

  // Determine if current user is room host (owner)
  const isHost = (
    (roomDetails?.owner_id && user?.id && String(roomDetails.owner_id) === String(user.id)) ||
    (user?.role && String(user.role).toLowerCase() === 'admin')
  );
  // Broadcast listeners have no mic
  const isBroadcastListener = intentMode === 'broadcast' && !isHost;
  
  const roomRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const botPollRef = useRef(null);
  const connectingRef = useRef(false);   // Guard: prevent double-connect
  const connectedRef = useRef(false);     // Guard: track connected state
  const lastTranscriptRef = useRef('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const activeMicRef = useRef('primary');
  const audioContextRef = useRef(null);  // iOS: AudioContext unlocked on user gesture
  const realtimeWsRef = useRef(null);
  const realtimePcmChunksRef = useRef([]);
  const realtimeSentChunksRef = useRef(0);   // chunks sent TO OpenAI (mic capture)
  const realtimeAudioEnergyRef = useRef(0);  // accumulated RMS — detects silence
  const realtimeSpeechTextRef = useRef('');  // original speech transcript from server
  const realtimeCaptionRef = useRef('');
  const realtimeAudioCtxRef = useRef(null);
  const realtimeMicStreamRef = useRef(null);
  const realtimeWorkletRef = useRef(null);
  const realtimeWorkletReadyRef = useRef(false); // true once addModule has run on current AudioContext
  const realtimeSourceRef = useRef(null);        // MediaStreamSource node — kept to disconnect on stop
  const realtimeSetupAbortRef = useRef(false);   // set if user releases PTT before async setup completes
  const realtimeSourceLangRef = useRef('English');
  const realtimeTargetLangRef = useRef('Spanish');
  const realtimePlaybackEndTimeRef = useRef(0);  // Web Audio clock: end time of last scheduled PCM chunk
  const realtimePcmStreamedRef = useRef(false);  // true if incremental PCM already played this turn
  const updateParticipantsRef = useRef(null); // Stable ref for event handlers
  const incomingAudioFramesRef = useRef(new Map());
  const participantPollRef = useRef(null);
  const autoJoinAttemptedRef = useRef(false);
  const seenRemoteIdentitiesRef = useRef(new Set()); // Track participants seen via data channel
  // ── Session-minutes tracking ──
  const sessionStartRef    = useRef(null);  // Date.now() when room connected
  const lastFlushTimeRef   = useRef(null);  // Date.now() of last partial flush
  const sessionOrgIdRef    = useRef(null);  // org id captured at connect (stable for the session)
  const usageFlushTimerRef = useRef(null);  // periodic 5-min flush interval

  // ─── Check if room is currently connected (derived) ────
  const isRoomConnected = connection.state === 'connected';

  // Build combined video tile list: remote LiveKit tracks + local (LiveKit track OR getUserMedia fallback)
  const videoTiles = useMemo(() => {
    const tiles = [];
    const usedIdentities = new Set();
    // Remote participants with video tracks
    participants
      .filter(p => !p.isBot && !p.isLocal)
      .forEach(p => {
        const track = videoTracks[p.identity];
        if (track) {
          tiles.push({ identity: p.identity, isLocal: false, track, type: 'livekit' });
          usedIdentities.add(p.identity);
        }
      });
    // Also include orphaned remote tracks (identity in videoTracks but not in participants)
    Object.keys(videoTracks).forEach(identity => {
      if (usedIdentities.has(identity)) return;
      // Skip local participant's identity
      const isLocalIdentity = participants.some(p => p.isLocal && p.identity === identity);
      if (isLocalIdentity) return;
      // Skip bots
      const idLower = identity.toLowerCase();
      if (idLower.includes('bot_') || idLower.includes('bot-') || idLower.includes('interpreter')) return;
      tiles.push({ identity, isLocal: false, track: videoTracks[identity], type: 'livekit' });
    });
    // Local participant: prefer LiveKit track, fall back to getUserMedia
    const localP = participants.find(p => p.isLocal);
    if (localP) {
      const localTrack = videoTracks[localP.identity];
      if (localTrack) {
        tiles.push({ identity: localP.identity, isLocal: true, track: localTrack, type: 'livekit' });
      } else if (isCameraEnabled) {
        tiles.push({ identity: localP.identity || 'You', isLocal: true, track: null, type: 'fallback' });
      }
    }
    return tiles;
  }, [participants, videoTracks, isCameraEnabled]);

  // ─── VIDEO TRACK HELPERS (must be declared before updateParticipants) ───
  const setVideoTrackForIdentity = useCallback((identity, track) => {
    if (!identity) return;
    setVideoTracks(prev => {
      const next = { ...prev };
      if (track) {
        next[identity] = track;
      } else {
        delete next[identity];
      }
      return next;
    });
  }, []);

  const removeVideoTrackBySid = useCallback((sid) => {
    if (!sid) return;
    setVideoTracks(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (next[key]?.sid === sid) {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  const syncLocalVideoTrack = useCallback((publication = null) => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    // Use the same fallback as updateParticipants so videoTracks keys always match
    const identity = String(room.localParticipant.identity || '') || 'Me';

    // If the caller passed the publication directly (from LocalTrackPublished event), use it.
    if (publication?.kind === 'video' && publication.track) {
      setVideoTrackForIdentity(identity, publication.track);
      return;
    }

    // Otherwise scan all video publications for one with an active track.
    let camTrack = null;
    try {
      const vtPubs = room.localParticipant.videoTrackPublications;
      if (vtPubs && typeof vtPubs.values === 'function') {
        const pub = Array.from(vtPubs.values()).find(p => p.track);
        camTrack = pub?.track || null;
      }
    } catch (e) {
      console.warn('[Stage] Error reading video track:', e);
    }
    setVideoTrackForIdentity(identity, camTrack);
  }, [setVideoTrackForIdentity]);

  // ─── CALLBACKS ─────────────────────────────────────────
  const updateParticipants = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    const local = r.localParticipant;
    if (!local) return; // Room not fully initialized yet
    const localIdentity = String(local?.identity || '');
    // Safely access remoteParticipants — may be undefined before connection completes
    let remotes = [];
    try {
      const remoteMap = r.remoteParticipants;
      if (remoteMap && typeof remoteMap.values === 'function') {
        remotes = Array.from(remoteMap.values());
      }
    } catch (e) {
      console.warn('[Stage] Error reading remoteParticipants:', e);
    }
    // Build set of identities from LiveKit
    const livekitIdentities = new Set();
    const mapped = [
      { identity: localIdentity || 'Me', isLocal: true, isBot: false, isSpeaking: local?.isSpeaking },
      ...remotes.map(p => {
        const identity = String(p.identity || p.sid || '');
        if (!identity || identity === localIdentity) return null;
        livekitIdentities.add(identity);
        const identityLower = identity.toLowerCase();
        return {
          identity,
          isLocal: false,
          isBot: identityLower.includes('bot_') || identityLower.includes('interpreter') || identityLower.includes('bot-'),
          isSpeaking: p.isSpeaking
        };
      }).filter(Boolean)
    ];
    // Merge in participants detected via data channel but missing from LiveKit's remoteParticipants
    for (const seenId of seenRemoteIdentitiesRef.current) {
      if (seenId === localIdentity) continue;
      if (livekitIdentities.has(seenId)) continue;
      const idLower = seenId.toLowerCase();
      const isBot = idLower.includes('bot_') || idLower.includes('interpreter') || idLower.includes('bot-');
      mapped.push({ identity: seenId, isLocal: false, isBot, isSpeaking: false });
    }
    setParticipants(mapped);
    if (mapped.some(p => p.isBot)) setBotState(prev => prev !== 'active' ? 'active' : prev);
    // Also scan for any remote video tracks we may have missed
    try {
      remotes.forEach(p => {
        const identity = String(p.identity || p.sid || '');
        if (!identity || identity.toLowerCase().includes('bot')) return;
        let vtPubs = [];
        try {
          const vtp = p.videoTrackPublications;
          if (vtp && typeof vtp.values === 'function') vtPubs = Array.from(vtp.values());
        } catch (e) {}
        const pub = vtPubs.find(vp => vp.track && vp.isSubscribed);
        if (pub?.track) setVideoTrackForIdentity(identity, pub.track);
      });
    } catch (e) { console.warn('[Stage] Remote video scan error:', e); }
  }, [setVideoTrackForIdentity]);

  // Keep ref in sync so event handlers always call the latest version
  useEffect(() => { updateParticipantsRef.current = updateParticipants; }, [updateParticipants]);

  // Helper: ensure AudioContext is created and active
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioContextRef.current = new AC();
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Recording timer helpers
  const clearRecordTimer = useCallback(() => {
    try {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    } catch (e) {}
    recordStartTsRef.current = null;
    setRecordRemainingSec(0);
  }, []);

  const startRecordTimer = useCallback((seconds = MAX_RECORD_SECONDS) => {
    clearRecordTimer();
    setRecordRemainingSec(seconds);
    recordStartTsRef.current = Date.now();
    recordTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (recordStartTsRef.current || Date.now())) / 1000);
      const remaining = Math.max(0, seconds - elapsed);
      setRecordRemainingSec(remaining);
      if (remaining <= 0) {
        // Auto-stop: stop the media recorder and clear timer. onstop will handle sending.
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (e) { console.error('[MIC] Error auto-stopping recorder:', e); }
        clearRecordTimer();
        setIsRecording(false);
        setIsMicEnabled(false);
        setIsTalking(false);
      }
    }, 250);
  }, [clearRecordTimer]);


  // Ensure timer cleanup on unmount
  useEffect(() => {
    return () => { clearRecordTimer(); };
  }, [clearRecordTimer]);

  // iOS/Safari-safe audio playback — uses Web Audio API as primary, <Audio> as fallback
  const playAudioSafely = useCallback((base64Audio, referenceText = '') => {
    return new Promise((resolve) => {
      const ctx = ensureAudioContext();

      // Decode base64 to ArrayBuffer
      let raw;
      try {
        raw = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      } catch (decodeErr) {
        console.error('[TTS] Base64 decode failed:', decodeErr);
        resolve();
        return;
      }

      // ── Primary path: Web Audio API (works on iOS/Safari after AudioContext unlock) ──
      if (ctx) {
        ctx.decodeAudioData(raw.buffer.slice(0), (audioBuffer) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          // Play at natural rate — OpenAI Realtime controls pacing via session speed.
          // Rate-shifting pitches the voice up (male → child/female), so never do it.
          source.connect(ctx.destination);
          source.onended = () => { console.log('[TTS] ✓ Web Audio playback complete'); resolve(); };

          // iOS: getUserMedia (PTT mic) changes the audio session category, which can
          // suspend the playback AudioContext even if it was unlocked at join time.
          // decodeAudioData still succeeds on a suspended context, but source.start(0)
          // silently queues audio that never plays. Resume first; if it fails, fall back.
          if (ctx.state === 'running') {
            source.start(0);
            console.log('[TTS] 🔊 Playing via Web Audio API (rate=1.0)');
          } else {
            ctx.resume().then(() => {
              if (ctx.state === 'running') {
                source.start(0);
                console.log('[TTS] 🔊 Playing via Web Audio API after resume (rate=1.0)');
              } else {
                source.disconnect();
                console.warn('[TTS] AudioContext suspended after resume attempt — using HTML5 fallback');
                playViaAudioElement(base64Audio, resolve, 1.0);
              }
            }).catch(() => {
              source.disconnect();
              playViaAudioElement(base64Audio, resolve, 1.0);
            });
          }
        }, (decodeErr) => {
          console.warn('[TTS] Web Audio decodeAudioData failed, falling back to <Audio>:', decodeErr);
          // ── Fallback: HTML5 Audio element ──
          playViaAudioElement(base64Audio, resolve, 1.0);
        });
      } else {
        // No AudioContext available — use HTML5 Audio element
        playViaAudioElement(base64Audio, resolve, 1.0);
      }
    });
  }, [ensureAudioContext]);

  // Fallback playback via HTML5 Audio element
  const playViaAudioElement = useCallback((base64Audio, resolve, playbackRate = 1.0) => {
    try {
      // Detect audio format from magic bytes — WAV starts with "RIFF", otherwise assume MP3.
      // Conversation mode sends WAV (from _pcm16ToWavBase64); server TTS may send MP3.
      // iOS Safari rejects playback when the declared MIME type doesn't match actual bytes.
      let mime = 'audio/mpeg';
      try {
        const header = atob(base64Audio.slice(0, 8));
        if (header.charCodeAt(0) === 0x52 && header.charCodeAt(1) === 0x49 &&
            header.charCodeAt(2) === 0x46 && header.charCodeAt(3) === 0x46) {
          mime = 'audio/wav';
        }
      } catch (_) {}
      const audioSrc = `data:${mime};base64,${base64Audio}`;
      const audioEl = new Audio(audioSrc);
      audioEl.onended = () => { console.log('[TTS] ✓ HTML5 Audio playback complete'); resolve(); };
      audioEl.onerror = (e) => { console.error('[TTS] HTML5 Audio playback error:', e); resolve(); };
      try { audioEl.playbackRate = playbackRate; } catch (e) {}
      audioEl.play().catch((playErr) => {
        console.warn('[TTS] HTML5 Audio play blocked:', playErr);
        // Last resort: try resuming AudioContext then retrying
        const ctx = audioContextRef.current;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            audioEl.play().catch(e2 => { console.error('[TTS] Final play attempt failed:', e2); resolve(); });
          });
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error('[TTS] Failed to create audio element:', err);
      resolve();
    }
  }, []);

  // Attempt to decode & play partially-received chunked audio as a low-latency fallback.
  // This is non-blocking and best-effort: if decoding the partial buffer fails we
  // simply wait for more chunks and fall back to final reassembly playback.
  const attemptPartialPlayback = useCallback(async (entry) => {
    if (!entry || entry.streamPlayed) return false;
    if (entry.received < entry.totalChunks) return false;
    try {
      const parts = (entry.chunks || []).filter(Boolean);
      if (parts.length === 0) return false;
      const joined = parts.join('');
      const ctx = ensureAudioContext();
      if (!ctx) return false;
      const raw = Uint8Array.from(atob(joined), c => c.charCodeAt(0)).buffer;
      // decodeAudioData uses callbacks in some browsers; wrap in a promise
      const audioBuffer = await new Promise((res, rej) => ctx.decodeAudioData(raw, res, rej));
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      src.onended = () => { console.log('[TTS] Partial streamed playback complete'); };
      src.start(0);
      entry.streamPlayed = true;
      return true;
    } catch (err) {
      // Partial decode failed (common for incomplete MP3 frames) — wait for more chunks
      // Do not treat as fatal; reassembly will handle final playback.
      // Keep quiet in normal failures to avoid log spam, but log once for diagnostics.
      console.debug('[TTS] Partial decode/play attempt failed (awaiting more chunks)');
      return false;
    }
  }, [ensureAudioContext]);

  const measurePayloadBytes = useCallback((payloadObject) => {
    try {
      return new TextEncoder().encode(JSON.stringify(payloadObject)).byteLength;
    } catch (err) {
      return 0;
    }
  }, []);

  const buildSafeAudioChunks = useCallback((audioBase64, messageId) => {
    if (!audioBase64 || !messageId) {
      return { ok: false, reason: 'invalid-input', chunks: [], effectiveChunkChars: 0 };
    }

    const envelopeBytes = measurePayloadBytes({
      type: 'broadcast_audio_chunk',
      id: messageId,
      chunk_index: 999999,
      total_chunks: 999999,
      chunk_data: '',
    });

    if (!Number.isFinite(envelopeBytes) || envelopeBytes <= 0) {
      return { ok: false, reason: 'envelope-measure-failed', chunks: [], effectiveChunkChars: 0 };
    }

    const effectiveChunkChars = Math.max(
      DC_AUDIO_MIN_CHUNK_CHARS,
      Math.min(DC_AUDIO_CHUNK_CHARS, DC_HARD_LIMIT_BYTES - envelopeBytes - 32)
    );

    if (effectiveChunkChars <= 0) {
      return { ok: false, reason: 'no-chunk-budget', chunks: [], effectiveChunkChars: 0 };
    }

    const chunks = [];
    let cursor = 0;

    while (cursor < audioBase64.length) {
      let take = Math.min(effectiveChunkChars, audioBase64.length - cursor);
      let candidate = audioBase64.slice(cursor, cursor + take);
      let candidateBytes = measurePayloadBytes({
        type: 'broadcast_audio_chunk',
        id: messageId,
        chunk_index: chunks.length,
        total_chunks: 999999,
        chunk_data: candidate,
      });

      let guard = 0;
      while (candidateBytes > DC_HARD_LIMIT_BYTES && take > DC_AUDIO_MIN_CHUNK_CHARS && guard < 64) {
        take = Math.max(DC_AUDIO_MIN_CHUNK_CHARS, take - 512);
        candidate = audioBase64.slice(cursor, cursor + take);
        candidateBytes = measurePayloadBytes({
          type: 'broadcast_audio_chunk',
          id: messageId,
          chunk_index: chunks.length,
          total_chunks: 999999,
          chunk_data: candidate,
        });
        guard += 1;
      }

      if (candidateBytes > DC_HARD_LIMIT_BYTES || take <= 0) {
        return {
          ok: false,
          reason: 'chunk-still-too-large',
          chunks,
          effectiveChunkChars,
        };
      }

      chunks.push(candidate);
      cursor += take;
    }

    return { ok: true, reason: 'planned', chunks, effectiveChunkChars };
  }, [measurePayloadBytes]);

  const safePublishDataPacket = useCallback(async (payloadObject, label = 'payload') => {
    const room = roomRef.current;
    if (!room?.localParticipant) {
      return { ok: false, reason: 'no-local-participant', sizeBytes: 0 };
    }

    let payloadText;
    try {
      payloadText = JSON.stringify(payloadObject);
    } catch (err) {
      console.error(`[DC] Failed to encode ${label}:`, err);
      return { ok: false, reason: 'encode-failed', sizeBytes: 0 };
    }

    const encoded = new TextEncoder().encode(payloadText);
    const sizeBytes = encoded.byteLength;
    if (sizeBytes > DC_ABSOLUTE_LIMIT_BYTES) {
      console.error(`[DC] ${label} EXCEEDS DC LIMIT (${sizeBytes} bytes > ${DC_ABSOLUTE_LIMIT_BYTES}). This should never happen.`);
      return { ok: false, reason: 'payload-exceeds-dc-limit', sizeBytes };
    }
    if (sizeBytes > DC_HARD_LIMIT_BYTES) {
      console.warn(`[DC] ${label} exceeds hard limit (${sizeBytes} bytes > ${DC_HARD_LIMIT_BYTES}). Skipping direct send.`);
      return { ok: false, reason: 'payload-too-large', sizeBytes };
    }
    if (sizeBytes > DC_SOFT_LIMIT_BYTES) {
      console.warn(`[DC] ${label} approaching limit (${sizeBytes} bytes).`);
    }

    let lastError = null;
    for (let i = 0; i < DC_MAX_RETRIES; i++) {
      try {
        await room.localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
        return { ok: true, reason: 'sent', sizeBytes };
      } catch (dcErr) {
        lastError = dcErr;
        console.warn(`[DC] Retry ${i + 1}/${DC_MAX_RETRIES} for ${label}...`, dcErr);
        await new Promise(r => setTimeout(r, 700));
      }
    }

    return { ok: false, reason: 'send-failed', sizeBytes, error: lastError?.message || String(lastError || '') };
  }, []);

  const sendChunkedBroadcastAudio = useCallback(async ({
    audioBase64,
    translatedText,
    sourceText,
    targetLang,
    speakerIdentity,
    messageId,
  }) => {
    if (!audioBase64 || !messageId) {
      return { ok: false, reason: 'invalid-audio-payload', chunks: 0, totalChars: 0 };
    }

    const chunkPlan = buildSafeAudioChunks(audioBase64, messageId);
    if (!chunkPlan.ok) {
      return {
        ok: false,
        reason: `chunk-plan-${chunkPlan.reason}`,
        chunks: chunkPlan.chunks.length,
        totalChars: audioBase64.length,
      };
    }

    const chunks = chunkPlan.chunks;
    if (!chunks.length) {
      return { ok: false, reason: 'chunk-plan-empty', chunks: 0, totalChars: audioBase64.length };
    }

    const startResult = await safePublishDataPacket({
      type: 'broadcast_audio_start',
      id: messageId,
      total_chunks: chunks.length,
      total_chars: audioBase64.length,
      translated_text: translatedText || '',
      source_text: sourceText || '',
      target_lang: targetLang,
      speaker_identity: speakerIdentity,
      mime: 'audio/mp3',
    }, 'broadcast_audio_start');

    if (!startResult.ok) {
      return { ok: false, reason: `start-${startResult.reason}`, chunks: chunks.length, totalChars: audioBase64.length };
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await safePublishDataPacket({
        type: 'broadcast_audio_chunk',
        id: messageId,
        chunk_index: i,
        total_chunks: chunks.length,
        chunk_data: chunks[i],
      }, 'broadcast_audio_chunk');

      if (!chunkResult.ok) {
        return {
          ok: false,
          reason: `chunk-${chunkResult.reason}`,
          chunks: chunks.length,
          totalChars: audioBase64.length,
          failedChunk: i,
          error: chunkResult.error,
        };
      }
    }

    const endResult = await safePublishDataPacket({
      type: 'broadcast_audio_end',
      id: messageId,
    }, 'broadcast_audio_end');

    if (!endResult.ok) {
      return { ok: false, reason: `end-${endResult.reason}`, chunks: chunks.length, totalChars: audioBase64.length };
    }

    return {
      ok: true,
      reason: 'sent',
      chunks: chunks.length,
      totalChars: audioBase64.length,
      chunkChars: chunkPlan.effectiveChunkChars,
    };
  }, [buildSafeAudioChunks, safePublishDataPacket]);

  // ─── SESSION-MINUTES TRACKING ──────────────────────────────────────
  // Calculates elapsed in-room minutes and posts to the billing API.
  // Uses refs for all dynamic data so it's safe to call from timers/event handlers.
  // isFinal=true → stop the periodic timer and zero the clock.
  // Declared here (before handleData) because handleData lists it as a dep.
  const flushSessionUsage = useCallback(async (isFinal = false) => {
    if (!sessionStartRef.current) return;
    const orgId = sessionOrgIdRef.current;
    if (!orgId || isGuestSession) return;

    const now = Date.now();
    const fromMs = lastFlushTimeRef.current ?? sessionStartRef.current;
    const elapsedMinutes = (now - fromMs) / 60000;
    if (elapsedMinutes < 0.1) return; // < 6 s — not worth recording

    lastFlushTimeRef.current = now;
    if (isFinal) {
      sessionStartRef.current = null;
      if (usageFlushTimerRef.current) {
        clearInterval(usageFlushTimerRef.current);
        usageFlushTimerRef.current = null;
      }
    }

    await billingService.recordUsage(orgId, roomId, elapsedMinutes);
    fetchSubscription(orgId).catch(() => {});
  }, [isGuestSession, roomId, fetchSubscription]);

  const handleData = useCallback((payload, participant) => {
    try {
      const decoded = new TextDecoder().decode(payload);
      const data = JSON.parse(decoded);
      console.log("[DIAG][FRONTEND] Data received:", data);
      
      // bot_status signals: listening | processing | speaking
      if (data.type === 'bot_status') {
        setAiStatus(data.status);
        if (data.status === 'active') setAiReady(true);
      }

      // Live partial STT captions (foggy text while speaker is talking)
      if (data.type === 'stt:partial') {
        setPartialCaption({
          text: data.text,
          speaker: data.speaker || 'Speaker',
          language: data.language || '',
          timestamp: Date.now()
        });
        // Auto-clear after 3s if no new partial arrives
        if (partialCaptionTimerRef.current) clearTimeout(partialCaptionTimerRef.current);
        partialCaptionTimerRef.current = setTimeout(() => setPartialCaption(null), 3000);
        return;
      }

      const now = Date.now();
      for (const [msgId, entry] of incomingAudioFramesRef.current.entries()) {
        if (now - entry.createdAt > 120000) {
          incomingAudioFramesRef.current.delete(msgId);
        }
      }

      const localIdentity = roomRef.current?.localParticipant?.identity || '';
      const senderIdentity = data.speaker_identity || participant?.identity || '';

      // Track remote participants seen via data channel (for robust participant counting)
      if (senderIdentity && senderIdentity !== localIdentity) {
        seenRemoteIdentitiesRef.current.add(senderIdentity);
        // Also register from the LiveKit participant object if available
        if (participant?.identity && participant.identity !== localIdentity) {
          seenRemoteIdentitiesRef.current.add(participant.identity);
        }
        // Trigger participant list refresh so counter updates immediately
        updateParticipantsRef.current?.();
      }

      const tryFinalizeChunkedAudio = (messageId) => {
        const entry = incomingAudioFramesRef.current.get(messageId);
        if (!entry) return false;
        if (entry.received < entry.totalChunks) return false;

        // If we already streamed partial playback successfully, skip final playback
        if (entry.streamPlayed) {
          incomingAudioFramesRef.current.delete(messageId);
          return true;
        }

        const joined = entry.chunks.join('');
        if (!joined) {
          incomingAudioFramesRef.current.delete(messageId);
          return false;
        }

        console.log(`[AUDIO] 🔊 Reassembled chunked audio ${messageId} (${entry.totalChunks} chunks)`);
        // Cache final reassembled audio for long-session recovery
        try {
          const cacheKey = `${CACHE_PREFIX}${messageId}`;
          try { localStorage.setItem(cacheKey, JSON.stringify({ audio: joined, translated_text: entry.translated_text || '', source_text: entry.source_text || '', createdAt: entry.createdAt || Date.now() })); } catch (e) { console.warn('[CACHE] Failed to cache audio', e); }
        } catch (e) {}

        playAudioSafely(joined, entry.translated_text || '');
        incomingAudioFramesRef.current.delete(messageId);
        return true;
      };

      if (data.type === 'broadcast_audio_start') {
        if (senderIdentity && senderIdentity === localIdentity) {
          return;
        }

        const totalChunks = Number(data.total_chunks) || 0;
        if (totalChunks <= 0) {
          return;
        }

        incomingAudioFramesRef.current.set(data.id, {
          createdAt: now,
          totalChunks,
          received: 0,
          chunks: new Array(totalChunks).fill(''),
          ended: false,
          streamPlayed: false,
          translated_text: data.translated_text || '',
          source_text: data.source_text || '',
          target_lang: data.target_lang || '',
          mime: data.mime || 'audio/mp3',
        });

        if (data.translated_text || data.source_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `bas-${Date.now()}`,
            text: data.source_text || '',
            translated_text: data.translated_text || '',
            speaker: senderIdentity || 'Remote Speaker',
            is_ai: true,
            is_local: false,
            is_final: true,
            timestamp: Date.now()
          }, ...prev.slice(0, 99)]);
        }
        return;
      }

      if (data.type === 'broadcast_audio_chunk') {
        const entry = incomingAudioFramesRef.current.get(data.id);
        if (!entry) {
          return;
        }

        const idx = Number(data.chunk_index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= entry.totalChunks) {
          return;
        }

        if (!entry.chunks[idx]) {
          entry.chunks[idx] = data.chunk_data || '';
          entry.received += 1;
          // Best-effort: try to decode & play the currently-received portion for low-latency
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
        if (!entry) {
          return;
        }
        entry.ended = true;
        tryFinalizeChunkedAudio(data.id);
        return;
      }

      // ─── BROADCAST AUDIO: Play translated audio sent by another participant ───
      // This is the primary audio delivery mechanism for Conversation & Talk Together modes.
      // The sender already skipped their own TTS; we play it here on the receiving end.
      if (data.type === 'broadcast_audio' && data.audio) {
        // Don't play our own forwarded audio back to ourselves
        if (senderIdentity && senderIdentity === localIdentity) {
          console.log('[AUDIO] Ignoring own broadcast_audio echo');
          return;
        }
        console.log('[AUDIO] 🔊 Received broadcast_audio from', senderIdentity, '— playing translated audio');
        playAudioSafely(data.audio, data.translated_text || '');

        // Also inject the caption into the transcript panel
        if (data.translated_text || data.source_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `ba-${Date.now()}`,
            text: data.source_text || '',
            translated_text: data.translated_text || '',
            speaker: senderIdentity || 'Remote Speaker',
            is_ai: true,
            is_local: false, // Received from someone else — WhatsApp "received" style
            is_final: true,
            timestamp: Date.now()
          }, ...prev.slice(0, 99)]);
        }
        return;
      }

      if (data.type === 'broadcast_audio_notice') {
        const senderIdentity = data.speaker_identity || participant?.identity || 'Remote Speaker';
        if (data.translated_text || data.source_text) {
          setLiveTranscripts(prev => [{
            id: data.id || `ban-${Date.now()}`,
            text: data.source_text || '',
            translated_text: data.translated_text || '',
            speaker: senderIdentity,
            is_ai: true,
            is_local: false,
            is_final: true,
            timestamp: Date.now()
          }, ...prev.slice(0, 99)]);
        }
        return;
      }

      if (data.type === 'transcript' || data.type === 'caption') {
        const key = `${data.text}|${data.translated_text}`;
        if (key === lastTranscriptRef.current) return;
        lastTranscriptRef.current = key;

        // Switch back to listening automatically when new text arrives
        setAiStatus('listening');
        // Clear foggy partial — final transcript replaces it
        setPartialCaption(null);

        setLiveTranscripts(prev => {
          const t = { ...data, id: data.id || `msg-${Date.now()}`, timestamp: Date.now(), speaker: data.speaker || participant?.identity || 'Voice Engine', is_local: false };
          const idx = prev.findIndex(item => item.id === t.id);
          if (idx !== -1) {
             const updated = [...prev];
             updated[idx] = { ...updated[idx], text: t.text, translated_text: t.translated_text, is_final: t.is_final };
             return updated;
          }
          return [...prev, t].slice(-100);
        });
      }

      // ── SESSION ENDED: Host explicitly ended the session ──
      if (data.type === 'session_ended') {
        console.log('[Stage] Host ended the session');
        toast('The host has ended this session', { icon: '📢', duration: 5000 });
        flushSessionUsage(true).catch(() => {});
        if (roomRef.current) {
          try { roomRef.current.disconnect(); } catch (_) {}
        }
        connectedRef.current = false;
        setConnection({ state: 'disconnected', status: 'Session Ended', error: null });
        // Guests go to landing, authenticated users go to dashboard
        setTimeout(() => navigate(isGuestSession ? '/' : '/dashboard'), 3000);
        return;
      }
    } catch (e) {
      console.error("[DIAG][FRONTEND] Parse error:", e);
    }
  }, [playAudioSafely, navigate, flushSessionUsage, isGuestSession]);

  // ─── TEST MODE: Inject captions without audio ───
  const handleInjectCaption = useCallback((captionData) => {
    console.log('[TEST MODE] Injecting caption:', captionData);
    setLiveTranscripts(prev => {
      const t = { 
        ...captionData, 
        id: captionData.id || `test-${Date.now()}`, 
        timestamp: captionData.timestamp || Date.now(),
        is_final: captionData.is_final !== undefined ? captionData.is_final : true
      };
      return [...prev, t].slice(-100);
    });
    toast.success('Caption injected!');
  }, []);


  // ─── LOCAL AI: Realtime PTT pipeline ─────────────────────────────────────────

  const _handleRealtimeTurnDone = useCallback(async (translatedCaption, sourceLang, targetLang, sessionId) => {
    setIsProcessing(true);
    setAiStatus('speaking');

    const micType = activeMicRef.current || 'primary';
    const speakerLabel = intentMode === 'group' || intentMode === 'talk_together'
      ? (user?.full_name?.split(' ')[0] || 'Me')
      : (micType === 'secondary' ? `Speaker (${sourceLang})` : 'You');

    const originalSpeech = realtimeSpeechTextRef.current || '';
    realtimeSpeechTextRef.current = '';

    setLiveTranscripts(prev => [...prev, {
      type: 'caption',
      // Show '…' if speech_done hasn't arrived yet — backfilled when it comes
      text: originalSpeech || '…',
      translated_text: translatedCaption,
      speaker: speakerLabel,
      is_ai: true,
      is_local: true,
      is_final: true,
      timestamp: Date.now(),
      id: sessionId || `rt-${Date.now()}`,
    }].slice(-100));

    const chunks = realtimePcmChunksRef.current.splice(0);
    realtimePcmChunksRef.current = [];
    const wavBase64 = _pcm16ToWavBase64(chunks);

    // In broadcast mode the speaker is the source — listeners receive the translated audio
    // via the data channel. Playing it back to the speaker would be confusing/redundant.
    const shouldSkipOwnTTS = intentMode === 'conversation' || intentMode === 'broadcast';

    if (wavBase64 && roomRef.current?.localParticipant) {
      const messageId = `rt-${Date.now()}`;
      const sendResult = await sendChunkedBroadcastAudio({
        audioBase64: wavBase64,
        translatedText: translatedCaption,
        sourceText: originalSpeech,
        targetLang,
        speakerIdentity: roomRef.current.localParticipant.identity,
        messageId,
      });
      if (!sendResult.ok) {
        console.warn(`[REALTIME] Audio forward failed (${sendResult.reason}) — sending notice`);
        await safePublishDataPacket({
          type: 'broadcast_audio_notice',
          translated_text: translatedCaption,
          source_text: '',
          target_lang: targetLang,
          speaker_identity: roomRef.current.localParticipant.identity,
          id: `${messageId}-notice`,
        }, 'broadcast_audio_notice');
      }
    }

    if (!shouldSkipOwnTTS && wavBase64 && !realtimePcmStreamedRef.current) {
      try {
        await playAudioSafely(wavBase64, translatedCaption);
      } catch (e) {
        console.warn('[REALTIME] Local playback error:', e);
      }
    }

    setAiStatus('listening');
    setIsProcessing(false);

    // Delay WS close by 3 s so the speech_done event (input audio transcription from
    // gpt-4o-transcribe) has time to arrive — it fires after response.done on OpenAI's side.
    // Capture the specific WS reference now — do NOT read realtimeWsRef.current at fire time.
    // If the user presses PTT again before 3 s, realtimeWsRef.current is replaced with a new WS.
    // Reading it at fire time would close the new connection and kill the second translation.
    const _wsAtTurnDone = realtimeWsRef.current;
    setTimeout(() => {
      try { _wsAtTurnDone?.close(); } catch (_) {}
      if (realtimeWsRef.current === _wsAtTurnDone) {
        realtimeWsRef.current = null;
      }
    }, 3000);
  }, [intentMode, user, sendChunkedBroadcastAudio, safePublishDataPacket, playAudioSafely]);

  const startLocalRecording = async () => {
    if (isProcessing) {
      console.warn('[REALTIME] Still processing previous turn, please wait...');
      return;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const micType = activeMicRef.current || 'primary';
    const sourceLang = _langCodeToName(micType === 'secondary'
      ? (roomDetails?.secondary_lang || 'en')
      : (roomDetails?.primary_lang || 'en'));
    const targetLang = _langCodeToName(micType === 'secondary'
      ? (roomDetails?.primary_lang || 'en')
      : (roomDetails?.secondary_lang || 'es'));

    realtimeSourceLangRef.current = sourceLang;
    realtimeTargetLangRef.current = targetLang;

    // Unique ID for this PTT session — prevents speech_delta/speech_done from targeting
    // a previous turn's committed entry (which also has an rt- prefix).
    const sessionId = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Reset per-turn accumulators immediately so stale data from a previous session
    // (whose WS may still be in the 3s close-tail) cannot bleed into this turn.
    realtimeCaptionRef.current = '';
    realtimeSpeechTextRef.current = '';

    console.log(`[REALTIME] PTT start: ${sourceLang} → ${targetLang}`);

    // ── IMMEDIATE UI feedback — zero delay before the mic indicator lights up ──
    realtimeSetupAbortRef.current = false;
    setIsRecording(true);
    setIsMicEnabled(true);
    setIsTalking(true);
    setAiStatus('listening');
    setPartialCaption({ text: '…', speaker: user?.full_name?.split(' ')[0] || 'You', timestamp: Date.now(), is_streaming: true });

    try {
      // Open fresh WebSocket to relay (new OpenAI session per PTT press)
      if (realtimeWsRef.current) {
        try { realtimeWsRef.current.close(); } catch (_) {}
        realtimeWsRef.current = null;
      }

      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${location.host}/api/v1/realtime/ws?source=${encodeURIComponent(sourceLang)}&target=${encodeURIComponent(targetLang)}&token=${encodeURIComponent(token || '')}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      realtimeWsRef.current = ws;

      // Capture lang refs at open time for use in the message closure
      const capturedSource = sourceLang;
      const capturedTarget = targetLang;

      ws.onmessage = (evt) => {
        if (typeof evt.data === 'string') {
          let evt2;
          try { evt2 = JSON.parse(evt.data); } catch { return; }
          switch (evt2.type) {
            case 'caption_delta':
              realtimeCaptionRef.current += evt2.text;
              setPartialCaption({
                text: realtimeCaptionRef.current + '…',
                speaker: user?.full_name?.split(' ')[0] || 'You',
                timestamp: Date.now(),
                is_streaming: true,
              });
              break;
            case 'turn_done': {
              const full = evt2.text || realtimeCaptionRef.current;
              realtimeCaptionRef.current = '';
              setPartialCaption(null);
              if (full) _handleRealtimeTurnDone(full, capturedSource, capturedTarget, sessionId);
              break;
            }
            case 'speech_started':
              setAiStatus('listening');
              break;
            case 'speech_delta': {
              // Stream original speech into this session's caption entry only.
              // Using exact sessionId instead of an rt-prefix scan prevents deltas
              // from a new turn appending to a previous turn's committed entry.
              const sdelta = evt2.text || '';
              if (sdelta) {
                setLiveTranscripts(prev => {
                  const idx = prev.findIndex(e => e.id === sessionId);
                  if (idx === -1) return prev;
                  const entry = prev[idx];
                  const cur = (!entry.text || entry.text === '…') ? '' : entry.text;
                  const updated = [...prev];
                  updated[idx] = { ...entry, text: cur + sdelta };
                  return updated;
                });
              }
              break;
            }
            case 'speech_done': {
              const speechText = evt2.text || '';
              realtimeSpeechTextRef.current = speechText;
              if (speechText) {
                setLiveTranscripts(prev => {
                  const idx = prev.findIndex(e => e.id === sessionId);
                  if (idx === -1) return prev;
                  const entry = prev[idx];
                  // Backfill: replace empty or '…' placeholder with the real original text
                  if (!entry.text || entry.text === '…') {
                    const updated = [...prev];
                    updated[idx] = { ...entry, text: speechText };
                    return updated;
                  }
                  return prev;
                });
              }
              break;
            }
            case 'error': {
              const errMsg = evt2.message || '';
              const errCode = evt2.code || '';
              const isCancellationNoise = (
                errCode === 'response_cancel_failed' ||
                errCode === 'response_not_found' ||
                errCode === 'cancellation_failed' ||
                errCode === 'input_audio_buffer_empty' ||
                errMsg.toLowerCase().includes('cancell') ||
                errMsg.toLowerCase().includes('no active response')
              );
              if (isCancellationNoise) {
                console.debug('[REALTIME] Suppressed non-fatal error:', errCode, errMsg);
              } else {
                console.error('[REALTIME] Server error:', errMsg);
                toast.error(`Translation error: ${errMsg}`);
              }
              setAiStatus('listening');
              setPartialCaption(null);
              setIsProcessing(false);
              break;
            }
            default:
              break;
          }
        } else {
          const pcm = new Int16Array(evt.data);
          realtimePcmChunksRef.current.push(pcm);
          // Incremental playback for talk_together — schedule each PCM chunk on the Web Audio clock
          // so output starts immediately rather than waiting for the full turn to complete.
          if (intentMode !== 'conversation' && intentMode !== 'broadcast') {
            const ctx = realtimeAudioCtxRef.current;
            if (ctx && ctx.state === 'running') {
              const float32 = new Float32Array(pcm.length);
              for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768;
              const audioBuf = ctx.createBuffer(1, float32.length, 24000);
              audioBuf.copyToChannel(float32, 0);
              const chunkSrc = ctx.createBufferSource();
              chunkSrc.buffer = audioBuf;
              chunkSrc.connect(ctx.destination);
              const startAt = Math.max(ctx.currentTime, realtimePlaybackEndTimeRef.current);
              chunkSrc.start(startAt);
              realtimePlaybackEndTimeRef.current = startAt + audioBuf.duration;
              realtimePcmStreamedRef.current = true;
            }
          }
        }
      };
      ws.onerror = (err) => console.error('[REALTIME] WS error', err);
      ws.onclose = ({ code }) => {
        if (isRecording) {
          console.warn(`[REALTIME] WS closed unexpectedly (${code}) while recording`);
          setIsRecording(false); setIsMicEnabled(false); setIsTalking(false);
          setAiStatus('listening'); setIsProcessing(false); setPartialCaption(null);
        }
      };

      // Register the WS open handler synchronously — before any await so we never miss the event
      const _wsOpenPromise = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('WS connect timeout')), 8000);
        ws.onopen = () => { clearTimeout(t); resolve(); };
        if (ws.readyState === WebSocket.OPEN) { clearTimeout(t); resolve(); }
      });

      // Reuse existing AudioContext across PTT presses — closing and recreating it adds ~200 ms
      let audioCtx = realtimeAudioCtxRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        realtimeAudioCtxRef.current = audioCtx;
        realtimeWorkletReadyRef.current = false;
      } else if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (_) {}
      }
      const _workletLoad = realtimeWorkletReadyRef.current
        ? Promise.resolve()
        : audioCtx.audioWorklet.addModule(_stageWorkletUrl()).then(() => { realtimeWorkletReadyRef.current = true; });

      // Run WS handshake + getUserMedia + worklet module load all in parallel
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 48000 } } }),
        _wsOpenPromise,
        _workletLoad,
      ]);

      // Guarantee AudioContext is running before connecting the audio graph
      if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (_) {}
      }

      // User released PTT before hardware was ready — abort cleanly
      if (realtimeSetupAbortRef.current) {
        stream.getTracks().forEach(t => t.stop());
        try { realtimeWsRef.current?.close(); } catch (_) {}
        realtimeWsRef.current = null;
        setIsRecording(false); setIsMicEnabled(false); setIsTalking(false);
        setPartialCaption(null); setAiStatus('listening');
        return;
      }

      // Reset per-turn accumulators
      realtimePcmChunksRef.current = [];
      realtimeCaptionRef.current = '';
      realtimeSentChunksRef.current = 0;
      realtimeAudioEnergyRef.current = 0;
      realtimeSpeechTextRef.current = '';
      realtimePcmStreamedRef.current = false;
      realtimePlaybackEndTimeRef.current = 0;

      realtimeMicStreamRef.current = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      realtimeSourceRef.current = source;
      realtimeWorkletRef.current = new AudioWorkletNode(audioCtx, 'pcm-capture-stage');
      realtimeWorkletRef.current.port.onmessage = ({ data }) => {
        if (realtimeWsRef.current?.readyState === WebSocket.OPEN) {
          const pcm = new Int16Array(data.buf);
          let sumSq = 0;
          for (let i = 0; i < pcm.length; i++) sumSq += (pcm[i] / 32768) ** 2;
          realtimeAudioEnergyRef.current += Math.sqrt(sumSq / pcm.length);
          realtimeWsRef.current.send(data.buf);
          realtimeSentChunksRef.current++;
        }
      };
      source.connect(realtimeWorkletRef.current);
      console.log('[REALTIME] PTT: mic active, streaming PCM16 to relay');
    } catch (err) {
      console.error('[REALTIME] Failed to start recording:', err);
      toast.error('Failed to start microphone — check permissions');
      realtimeSourceRef.current?.disconnect();
      realtimeMicStreamRef.current?.getTracks().forEach(t => t.stop());
      realtimeAudioCtxRef.current?.close().catch(() => {});
      realtimeAudioCtxRef.current = null;
      realtimeWorkletReadyRef.current = false;
      realtimeSourceRef.current = null;
      realtimeWorkletRef.current = null;
      realtimeMicStreamRef.current = null;
      if (realtimeWsRef.current) { try { realtimeWsRef.current.close(); } catch (_) {} realtimeWsRef.current = null; }
    }
  };

  const stopLocalRecording = () => {
    console.log('[REALTIME] PTT: mic released — committing buffer');

    // If the user released before async setup finished, signal the setup to abort
    if (!realtimeWorkletRef.current && !realtimeMicStreamRef.current) {
      realtimeSetupAbortRef.current = true;
      setIsRecording(false); setIsMicEnabled(false); setIsTalking(false);
      setPartialCaption(null); setAiStatus('listening');
      return;
    }

    realtimeSourceRef.current?.disconnect();
    realtimeWorkletRef.current?.disconnect();
    realtimeMicStreamRef.current?.getTracks().forEach(t => t.stop());
    // Keep AudioContext alive — reused on the next PTT press to skip ~200 ms re-init
    realtimeSourceRef.current = null;
    realtimeWorkletRef.current = null;
    realtimeMicStreamRef.current = null;

    // iOS: releasing the mic stream changes the audio session back, which can leave
    // the playback AudioContext suspended. Resume it now while we're still inside
    // the pointer-up user gesture — iOS only allows resume() from a user gesture.
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    if (realtimeWsRef.current?.readyState === WebSocket.OPEN) {
      const chunks = realtimeSentChunksRef.current;
      const avgEnergy = chunks > 0 ? realtimeAudioEnergyRef.current / chunks : 0;
      const SILENCE_THRESHOLD = 0.008; // lowered: 0.025 rejected normal-distance speech (avgRMS ~0.019)
      const MIN_CHUNKS = 15; // 15 × 20 ms = 300 ms minimum — rejects taps, short enough for quick words

      if (chunks >= MIN_CHUNKS && avgEnergy > SILENCE_THRESHOLD) {
        console.log(`[REALTIME] Committing (chunks=${chunks}, avgRMS=${avgEnergy.toFixed(4)})`);
        realtimeWsRef.current.send(JSON.stringify({ type: 'commit' }));
        setAiStatus('processing');
      } else {
        console.warn(`[REALTIME] Skipping — too short or silent (chunks=${chunks}, avgRMS=${avgEnergy.toFixed(4)})`);
        realtimeWsRef.current.close();
        realtimeWsRef.current = null;
        setAiStatus('listening');
        setPartialCaption(null);
        // Let the user know their speech wasn't captured — silent rejection causes
        // confusion ("I spoke, why no translation?"), especially on iOS where mic
        // gain is sometimes lower than desktop.
        if (chunks < MIN_CHUNKS) {
          toast('Hold the mic button while speaking', { icon: '🎙️', duration: 2500 });
        } else {
          toast('Speak closer to the mic', { icon: '🎙️', duration: 2500 });
        }
      }
    }

    setIsRecording(false);
    setIsMicEnabled(false);
    setIsTalking(false);
  };

  // ─── CONNECT (called ONLY from user gesture — handleJoinClick) ─────
  const connectToRoom = useCallback(async () => {
    setConnection({ state: 'connecting', status: 'Authenticating...', error: null });
    try {
      let livekitToken = resolvedGuestLkToken;
      let connectUrl = resolvedGuestLkUrl || LIVEKIT_URL;

      // Guest invite joins already have LiveKit credentials.
      if (!livekitToken) {
        const result = await roomService.getToken(roomId);
        livekitToken = typeof result === 'string' ? result : result?.token;
        connectUrl = result?.url || result?.livekit_url || LIVEKIT_URL;
      }

      if (!livekitToken) {
        throw new Error('Missing room access token.');
      }

      // iOS Safari: disable simulcast (reduces from 3 parallel streams to 1 — prevents
      // WebKit memory pressure termination that drops the track). Cap resolution at 720p.
      const _iosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      const r = new Room({
        adaptiveStream: true,
        dynacast: !_iosDevice,  // dynacast relies on simulcast; disable on iOS
        disconnectOnPageLeave: false,
        videoCaptureDefaults: _iosDevice ? {
          resolution: { width: 1280, height: 720, frameRate: 30 },
        } : undefined,
        publishDefaults: _iosDevice ? {
          simulcast: false,
          videoSimulcastLayers: [],
        } : undefined,
        reconnectPolicy: {
          nextRetryDelayInMs: (context) => {
            if (context.retryCount > 7) return null;
            return Math.min(300 * Math.pow(2, context.retryCount), 10000);
          },
        },
      });
      roomRef.current = r;

      // Wire up event handlers — use ref wrappers so handlers always call latest versions
      const stableUpdateParticipants = () => updateParticipantsRef.current?.();
      safeOn(r, RoomEvent.DataReceived, handleData);
      safeOn(r, RoomEvent.ParticipantConnected, (participant) => {
        // Register this participant so the counter updates immediately
        const identity = String(participant?.identity || '');
        if (identity) seenRemoteIdentitiesRef.current.add(identity);
        stableUpdateParticipants();
      });
      safeOn(r, RoomEvent.ParticipantDisconnected, (participant) => {
        // Remove from seen set so counter decrements
        const identity = String(participant?.identity || '');
        if (identity) seenRemoteIdentitiesRef.current.delete(identity);
        stableUpdateParticipants();
      });
      safeOn(r, RoomEvent.TrackSubscribed, (track, publication, participant) => {
        // Register participant identity from track subscription (most reliable signal)
        const pIdentity = String(participant?.identity || '');
        if (pIdentity) {
          seenRemoteIdentitiesRef.current.add(pIdentity);
          stableUpdateParticipants();
        }
        if (track.kind === 'audio') {
          // BROADCAST MODE: Speaker should NOT hear the bot's translated audio.
          // Only listeners (Listener.jsx) should hear translated audio tracks.
          // Captions (via DataReceived) remain universal for all participants.
          if (intentMode === 'broadcast') {
            const participantId = participant?.identity || '';
            const isBotTrack = participantId.startsWith('bot_') || participantId.startsWith('bot-') || participantId.startsWith('agent_');
            if (isBotTrack) {
              console.log(`[BROADCAST] Speaker: skipping bot translation audio track from ${participantId}`);
              return;
            }
          }
          setAudioTracks(prev => [...prev, track]);
        }
        if (track.kind === 'video') {
          const identity = String(participant?.identity || '');
          if (!identity.toLowerCase().includes('bot')) {
            setVideoTrackForIdentity(identity, track);
          }
        }
        stableUpdateParticipants();
      });
      safeOn(r, RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === 'audio') {
          setAudioTracks(prev => prev.filter(t => t.sid !== track.sid));
        }
        if (track.kind === 'video') {
          removeVideoTrackBySid(track.sid);
        }
        stableUpdateParticipants();
      });
      safeOn(r, RoomEvent.ActiveSpeakersChanged, stableUpdateParticipants);
      safeOn(r, RoomEvent.LocalTrackPublished, (pub) => syncLocalVideoTrack(pub));
      // Only re-sync when a VIDEO track is unpublished — audio unpublish must not clear the video track.
      safeOn(r, RoomEvent.LocalTrackUnpublished, (pub) => { if (pub?.kind === 'video') syncLocalVideoTrack(); });

      // ─── Disconnect / Reconnect handlers ───
      r.on(RoomEvent.Disconnected, (reason) => {
        console.error('[LiveKit] Disconnected:', reason);
        connectedRef.current = false;
        if (participantPollRef.current) {
          clearInterval(participantPollRef.current);
          participantPollRef.current = null;
        }
        try {
          if (sessionStorage.getItem('aytme_active_room_id') === String(roomId)) {
            sessionStorage.removeItem('aytme_active_room_id');
          }
        } catch (_) {}
        // STATE_MISMATCH (reason 6): Auto-reconnect with fresh token
        // This commonly happens on mobile when the app is backgrounded
        if (reason === DisconnectReason.STATE_MISMATCH || reason === 6) {
          console.warn('[LiveKit] STATE_MISMATCH — auto-reconnecting with fresh token...');
          setConnection({ state: 'reconnecting', status: 'Reconnecting...', error: null });
          setShowReconnectBanner(true);
          roomRef.current = null;
          setTimeout(() => {
            if (!connectingRef.current) {
              connectingRef.current = true;
              connectToRoom().finally(() => {
                connectingRef.current = false;
                setShowReconnectBanner(false);
              });
            }
          }, 500);
          return;
        }
        setConnection({ state: 'disconnected', status: 'Disconnected', error: null });
        setDisconnectReason(reason || 'Connection lost');
        // If reason is NOT user-initiated (leave button), show reconnect UI
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          setShowReconnectBanner(true);
        }
      });

      r.on(RoomEvent.Reconnecting, () => {
        console.warn('[LiveKit] Reconnecting...');
        setConnection({ state: 'reconnecting', status: 'Reconnecting...', error: null });
        setShowReconnectBanner(true);
      });

      r.on(RoomEvent.Reconnected, () => {
        console.log('[LiveKit] Reconnected successfully');
        connectedRef.current = true;
        setConnection({ state: 'connected', status: 'Live', error: null });
        setShowReconnectBanner(false);
        stableUpdateParticipants();
      });

      // This is called from inside a click handler = valid user gesture
      // AudioContext is now allowed by the browser
      console.log('[Stage] Connecting to LiveKit:', connectUrl);
      await r.connect(connectUrl, livekitToken, {
        autoSubscribe: true,
      });

      connectedRef.current = true;
      setConnection({ state: 'connected', status: 'Live', error: null });
      setShowReconnectBanner(false);
      try { sessionStorage.setItem('aytme_active_room_id', String(roomId)); } catch (_) {}

      // ── Start session-minutes clock ──
      const now = Date.now();
      sessionStartRef.current = now;
      lastFlushTimeRef.current = now;
      sessionOrgIdRef.current = currentOrg?.id ?? null;
      if (usageFlushTimerRef.current) clearInterval(usageFlushTimerRef.current);
      if (sessionOrgIdRef.current && !isGuestSession) {
        usageFlushTimerRef.current = setInterval(() => {
          flushSessionUsage(false).catch(() => {});
        }, 5 * 60 * 1000); // flush every 5 min — guards against tab close
      }

      if (participantPollRef.current) {
        clearInterval(participantPollRef.current);
      }
      participantPollRef.current = setInterval(() => {
        updateParticipantsRef.current?.();
      }, 2000);

      // Pre-authorize mic permission via browser API so PTT works later
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop()); // Release immediately — just needed the permission grant
        // Auto-activate AI translation mode — mic button works immediately without needing
        // a separate "AI" button press. Translation is always the purpose of joining a room.
        setLocalAIEnabled(true);
        setBotState('active');
        setAiReady(true);
        setAiStatus('listening');
        console.log('[AI] Auto-activated on room connect — mic button ready for translation');

        // Pre-warm AudioContext + worklet while we still have a user gesture.
        // stopLocalRecording() keeps the AudioContext alive between PTT presses,
        // so this init is reused for ALL subsequent presses — not just the first.
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !realtimeAudioCtxRef.current) {
          try {
            const ac = new AC();
            realtimeAudioCtxRef.current = ac;
            await ac.audioWorklet.addModule(_stageWorkletUrl());
            realtimeWorkletReadyRef.current = true;
            console.log('[AI] AudioContext + Worklet pre-warmed on join');
          } catch (warmErr) {
            console.warn('[AI] Worklet pre-warm failed (will retry on first mic press):', warmErr);
          }
        }
      } catch (micErr) {
        console.warn('[Stage] Mic permission not granted:', micErr);
      }
      
      updateParticipants();
      syncLocalVideoTrack();

      // Scan ALL existing remote participants and register them for robust counting
      try {
        const remoteMap = r.remoteParticipants;
        if (remoteMap && typeof remoteMap.values === 'function') {
          Array.from(remoteMap.values()).forEach(p => {
            const identity = String(p.identity || p.sid || '');
            if (identity) seenRemoteIdentitiesRef.current.add(identity);
          });
        }
        // Also count the local participant sees itself
        updateParticipants(); // Re-run after seenRemoteIdentities is populated
      } catch (e) { console.warn('[Stage] Post-connect participant scan:', e); }

      // Delayed refresh to catch late-populating remoteParticipants
      setTimeout(() => { updateParticipantsRef.current?.(); }, 1000);

      // Also scan any already-published remote video tracks
      try {
        const remoteMap = r.remoteParticipants;
        if (remoteMap && typeof remoteMap.values === 'function') {
          Array.from(remoteMap.values()).forEach(p => {
            const identity = String(p.identity || p.sid || '');
            if (!identity || identity.toLowerCase().includes('bot')) return;
            let vtPubs = [];
            try {
              const vtp = p.videoTrackPublications;
              if (vtp && typeof vtp.values === 'function') vtPubs = Array.from(vtp.values());
            } catch (e) {}
            const pub = vtPubs.find(vp => vp.track && vp.isSubscribed);
            if (pub?.track) setVideoTrackForIdentity(identity, pub.track);
          });
        }
      } catch (e) { console.warn('[Stage] Remote video scan after connect:', e); }

      if (isGuestSession) {
        if (resolvedGuestRoomDetails) {
          setRoomDetails(resolvedGuestRoomDetails);
        }
      } else {
        const details = await roomService.getRoom(roomId);
        setRoomDetails(details);
      }
    } catch (err) {
      console.error('[Stage] Connect failed:', err);
      connectedRef.current = false;
      // Provide user-friendly error messages
      let errorMsg = err.message || 'Connection failed';
      if (errorMsg.includes('region') || errorMsg.includes('fetch')) {
        errorMsg = 'Unable to reach the translation server. Please check your internet connection and try again.';
      } else if (errorMsg.includes('token') || errorMsg.includes('401') || errorMsg.includes('403')) {
        errorMsg = 'Session expired or invalid. Please go back and rejoin.';
      }
      setConnection({ state: 'error', status: 'Failed', error: errorMsg });
    }
  }, [
    roomId,
    handleData,
    updateParticipants,
    resolvedGuestLkToken,
    resolvedGuestLkUrl,
    isGuestSession,
    resolvedGuestRoomDetails,
    setVideoTrackForIdentity,
    removeVideoTrackBySid,
    syncLocalVideoTrack,
    flushSessionUsage,
    currentOrg,
  ]);

  // ─── JOIN CLICK HANDLER (user gesture — the ONLY entry point to connect) ──
  const handleJoinClick = useCallback(async () => {
    // Prevent duplicate connection attempts (StrictMode / double-clicks)
    if (connectingRef.current || connectedRef.current) {
      console.warn('[Stage] Already connecting or connected — skipping');
      return;
    }
    connectingRef.current = true;

    // iOS/Safari: Unlock AudioContext on this user gesture so future playback works
    try {
      if (!audioContextRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioContextRef.current = new AC();
          // Create and play a silent buffer to fully unlock audio on iOS
          const buf = audioContextRef.current.createBuffer(1, 1, 22050);
          const src = audioContextRef.current.createBufferSource();
          src.buffer = buf;
          src.connect(audioContextRef.current.destination);
          src.start(0);
          console.log('[iOS] AudioContext unlocked via user gesture');
        }
      }
    } catch (acErr) {
      console.warn('[iOS] AudioContext unlock failed (non-fatal):', acErr);
    }

    try {
      await connectToRoom();
    } finally {
      connectingRef.current = false;
    }
  }, [connectToRoom]);

  useEffect(() => {
    if (!autoJoinRequested || autoJoinAttemptedRef.current) return;
    if (!isHost || connection.state !== 'idle') return;
    autoJoinAttemptedRef.current = true;
    handleJoinClick();
  }, [autoJoinRequested, isHost, connection.state, handleJoinClick]);

  // ─── Manual reconnect handler (for reconnect banner) ───
  const handleManualReconnect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    setConnection({ state: 'reconnecting', status: 'Reconnecting...', error: null });
    try {
      // Disconnect old room if it exists
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch (_) {}
        roomRef.current = null;
      }
      connectedRef.current = false;
      // Re-connect with fresh token
      await connectToRoom();
      setShowReconnectBanner(false);
    } catch (err) {
      console.error('[Stage] Reconnect failed:', err);
      setConnection({ state: 'disconnected', status: 'Disconnected', error: err.message });
    } finally {
      connectingRef.current = false;
    }
  }, [connectToRoom]);

  const toggleMicGlobal = async (forceState = null) => {
    // ─── LOCAL AI MODE: Record mic locally and send to translate API ───
    if (localAIEnabled) {
      const next = forceState !== null ? forceState : !isRecording;
      console.log(`[MIC] toggleMicGlobal (localAI) → ${next ? 'START' : 'STOP'}`);
      if (next) {
        await startLocalRecording();
      } else {
        stopLocalRecording();
      }
      return;
    }

    const room = roomRef.current;
    // GUARD: never attempt to toggle mic when room is not connected
    if (!room || room.state !== ConnectionState.Connected) {
      console.warn('[Stage] Cannot toggle mic — room state:', room?.state);
      return;  // silently return — do not throw, do not crash
    }
    const next = forceState !== null ? forceState : !isMicEnabled;
    
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setIsMicEnabled(next);
      setIsTalking(next);
    } catch (e) {
      console.error('[Stage] Mic toggle failed:', e.name, e.message);
      
      // If it's a permissions issue, try getUserMedia first then retry
      if (e.name === 'NotAllowedError' || e.message?.includes('Permission') || e.message?.includes('permission')) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          await room.localParticipant.setMicrophoneEnabled(next);
          setIsMicEnabled(next);
          setIsTalking(next);
          return;
        } catch (retryErr) {
          toast.error("Please allow microphone access in your browser settings.");
          return;
        }
      }
      
      // For any other error, just try once more directly
      try {
        await room.localParticipant.setMicrophoneEnabled(next);
        setIsMicEnabled(next);
        setIsTalking(next);
      } catch (finalErr) {
        console.error('[Stage] Final mic retry failed:', finalErr.name, finalErr.message);
        toast.error(`Mic error: ${finalErr.message || 'Unknown error'}`);
      }
    }
  };

  const toggleCameraGlobal = async (forceState = null) => {
    if (isBroadcastListener) return;
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      console.warn('[Stage] Cannot toggle camera — room state:', room?.state);
      return;
    }
    const next = forceState !== null ? forceState : !isCameraEnabled;
    try {
      // setCameraEnabled returns the LocalTrackPublication — use it directly.
      const pub = await room.localParticipant.setCameraEnabled(next);
      setIsCameraEnabled(next);
      if (pub?.track) {
        // Use the publication returned by setCameraEnabled — most reliable path.
        syncLocalVideoTrack(pub);
      } else {
        // Publication track not immediately available; poll until it appears.
        syncLocalVideoTrack();
        setTimeout(() => syncLocalVideoTrack(), 300);
        setTimeout(() => syncLocalVideoTrack(), 800);
        setTimeout(() => syncLocalVideoTrack(), 1500);
        setTimeout(() => syncLocalVideoTrack(), 3000);
      }
    } catch (e) {
      console.error('[Stage] Camera toggle failed:', e?.message || e);
      setIsCameraEnabled(false); // Camera didn't start — clear the flag so no stuck spinner
    }
  };

  const handleActivateAI = async () => {
    // ─── TOGGLE OFF: If already active, deactivate ───
    if (localAIEnabled) {
      console.log('[AI] 🔴 Deactivating local AI translation mode');
      setLocalAIEnabled(false);
      setBotState('inactive');
      setAiReady(false);
      setAiStatus('inactive');
      realtimeWorkletRef.current?.disconnect();
      realtimeMicStreamRef.current?.getTracks().forEach(t => t.stop());
      realtimeAudioCtxRef.current?.close().catch(() => {});
      realtimeWorkletRef.current = null;
      realtimeMicStreamRef.current = null;
      realtimeAudioCtxRef.current = null;
      if (realtimeWsRef.current) { try { realtimeWsRef.current.close(); } catch (_) {} realtimeWsRef.current = null; }
      setIsRecording(false);
      setIsMicEnabled(false);
      setIsTalking(false);
      toast.success('AI Translation deactivated');
      return;
    }

    // ─── ACTIVATE LOCAL AI: Record mic → Whisper → GPT-4 → TTS ───
    if (!roomDetails) {
      toast.error('Room details not loaded yet — please wait');
      return;
    }

    console.log('[AI] ═══════════════════════════════════════════');
    console.log('[AI] 🚀 Activating LOCAL AI Translation Mode');
    console.log(`[AI] Room ID: ${roomId}`);
    console.log(`[AI] Room Name: ${roomDetails.name || 'Unknown'}`);
    console.log(`[AI] Primary Language: ${roomDetails.primary_lang || 'en'}`);
    console.log(`[AI] Secondary Language: ${roomDetails.secondary_lang || 'es'}`);
    console.log('[AI] Pipeline: Mic → Whisper STT → GPT-4 Translation → TTS');
    console.log('[AI] ═══════════════════════════════════════════');

    // Test microphone permission
    setBotState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      console.log('[AI] ✓ Microphone permission granted');
    } catch (err) {
      console.error('[AI] ✗ Microphone permission denied:', err);
      toast.error('Microphone access is required for AI translation');
      setBotState('inactive');
      return;
    }

    setLocalAIEnabled(true);
    setBotState('active');
    setAiReady(true);
    setAiStatus('listening');
    console.log('[AI] ✓ Local AI mode ACTIVATED');
    console.log('[AI] 💡 Hold the mic button and speak to translate');
    toast.success('AI Active — Hold mic button to speak');
  };

  // ─── Fetch room details on mount (for pre-join screen — no connect) ────
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const details = await roomService.getRoom(roomId);
        setRoomDetails(details);
      } catch (e) {
        console.warn('[Stage] Could not prefetch room details:', e);
      }
    };

    if (isGuestSession) {
      if (resolvedGuestRoomDetails) {
        setRoomDetails(resolvedGuestRoomDetails);
      }
    } else if (user) {
      fetchDetails();
    }
  }, [roomId, user, isGuestSession, resolvedGuestRoomDetails]);

  // Cleanup: disconnect from LiveKit when leaving the page
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch (_) {}
        roomRef.current = null;
      }
      if (participantPollRef.current) {
        clearInterval(participantPollRef.current);
        participantPollRef.current = null;
      }
      try {
        if (sessionStorage.getItem('aytme_active_room_id') === String(roomId)) {
          sessionStorage.removeItem('aytme_active_room_id');
        }
      } catch (_) {}
      incomingAudioFramesRef.current.clear();
      connectedRef.current = false;
      connectingRef.current = false;
      setVideoTracks({});
      setIsCameraEnabled(false);
      if (botPollRef.current) clearInterval(botPollRef.current);
      if (usageFlushTimerRef.current) clearInterval(usageFlushTimerRef.current);
      realtimeWorkletRef.current?.disconnect();
      realtimeMicStreamRef.current?.getTracks().forEach(t => t.stop());
      realtimeAudioCtxRef.current?.close().catch(() => {});
      if (realtimeWsRef.current) { try { realtimeWsRef.current.close(); } catch (_) {} realtimeWsRef.current = null; }
    };
  }, []);

  // Mobile: Auto-reconnect when tab becomes visible after backgrounding
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      // Tab became visible — check if connection was lost while backgrounded
      const room = roomRef.current;
      const wasConnected = connectedRef.current === false && connection.state === 'disconnected';
      const roomDead = room && room.state !== ConnectionState.Connected;
      if ((wasConnected || roomDead) && !connectingRef.current) {
        console.warn('[Mobile] Tab visible, connection lost — auto-reconnecting...');
        connectingRef.current = true;
        // Clean up old room
        if (roomRef.current) {
          try { roomRef.current.disconnect(); } catch (_) {}
          roomRef.current = null;
        }
        connectedRef.current = false;
        setConnection({ state: 'reconnecting', status: 'Reconnecting...', error: null });
        setShowReconnectBanner(true);
        connectToRoom().finally(() => {
          connectingRef.current = false;
          setShowReconnectBanner(false);
        });
      }
      // Resume AudioContext if suspended (iOS requirement)
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connectToRoom, connection.state]);

  useEffect(() => { if (transcriptEndRef.current) transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [liveTranscripts]);

  // ─── AI STATUS INDICATOR ─────────────────────────────────────
  const AIStatusIndicator = ({ status, visible }) => {
    if (!visible) return null;

    const labels = {
      inactive:   { text: 'AI Standby',    pulse: false, color: 'bg-slate-400' },
      active:     { text: 'AI Listening',  pulse: true,  color: 'bg-emerald-500' },
      listening:  { text: 'AI Listening',  pulse: true,  color: 'bg-emerald-500' },
      processing: { text: 'AI Thinking',   pulse: true,  color: 'bg-amber-500' },
      speaking:   { text: 'AI Speaking',   pulse: true,  color: 'bg-indigo-500' },
    };
    const s = labels[status] || labels.listening;

    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="relative flex items-center justify-center">
            {s.pulse && (
               <motion.div 
                 animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                 transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                 className={`absolute w-2.5 h-2.5 rounded-full ${s.color}`}
               />
            )}
            <div className={`w-2 h-2 rounded-full ${s.color} relative z-10`} />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
           {s.text}
        </span>
      </div>
    );
  };

  // ─── PRE-JOIN SCREEN ─────────────────────────────────
  // Shown before user clicks "Join Room" — no room.connect() yet.
  // This ensures AudioContext creation happens inside a user gesture.
  if (connection.state === 'idle' || (connection.state === 'error' && !connectedRef.current)) {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 font-sans overflow-hidden">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8 max-w-md">
          
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="max-w-[200px] max-h-[52px] flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="AYTME" className="w-full h-full object-contain" />
            </div>
          </div>

          {/* Room info */}
          <div className="space-y-3">
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-slate-800">
              {roomDetails?.name || 'Conference Room'}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{roomId}</p>
            </div>
            {roomDetails?.primary_lang && (
              <p className="text-indigo-500 text-xs font-bold uppercase tracking-wider">
                {roomDetails.primary_lang} {roomDetails.secondary_lang ? `↔ ${roomDetails.secondary_lang}` : ''}
              </p>
            )}
          </div>

          {/* Error message */}
          {connection.state === 'error' && connection.error && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-rose-600 text-xs font-bold">{connection.error}</p>
            </div>
          )}

          {/* Join button — THIS is the user gesture that unlocks AudioContext */}
          <button
            onClick={handleJoinClick}
            disabled={connectingRef.current}
            className="group relative px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-300 hover:bg-indigo-700 hover:shadow-indigo-400 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-3">
              <PhoneCall size={18} className="group-hover:rotate-12 transition-transform" />
              Join Room
            </span>
          </button>

          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">
            Encrypted • Low Latency • Real-Time
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── CONNECTING STATE ─────────────────────────────────
  if (connection.state === 'connecting') {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 font-sans overflow-hidden">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
          <Loader2 className="mx-auto text-indigo-500 animate-spin" size={64} />
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-[0.5em] text-slate-400">{connection.status}</h2>
            <div className="flex items-center justify-center gap-2">
               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
               <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{roomId}</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── DISCONNECTED STATE (after having been connected — shows reconnect) ───
  if (connection.state === 'disconnected' || connection.state === 'reconnecting') {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 font-sans overflow-hidden">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
          {connection.state === 'reconnecting' ? (
            <Loader2 className="mx-auto text-amber-500 animate-spin" size={64} />
          ) : (
            <XCircle className="mx-auto text-rose-400" size={64} />
          )}
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-[0.5em] text-slate-400">{connection.status}</h2>
            {disconnectReason && (
              <p className="text-slate-400 text-[10px] font-bold">Reason: {String(disconnectReason)}</p>
            )}
          </div>
          {connection.state === 'disconnected' && (
            <button onClick={handleManualReconnect} className="px-10 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 transition-all">
              Reconnect
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── PARTICIPANT PANEL (shared between desktop sidebar and mobile drawer) ─────
  const ParticipantList = () => (
    <div className="space-y-3">
      {participants.map((p, i) => (
        <motion.div key={p.identity + i} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${p.isSpeaking ? 'bg-indigo-50 border-indigo-200 shadow-md' : 'bg-white border-slate-200 opacity-70'}`}>
           <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-[10px] ${p.isBot ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {p.isBot ? <Sparkles size={14} /> : p.identity.slice(0,2).toUpperCase()}
           </div>
           <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black truncate text-slate-700">
                {p.isLocal ? (user?.full_name?.split(' ')[0] || 'Me') : p.identity}
              </p>
               <p className="text-[8px] uppercase font-bold text-slate-400">
                 {p.isBot ? 'Interpreter'
                   : intentMode === 'broadcast'
                     ? (p.isLocal && isHost ? 'Speaker' : 'Listener')
                     : (p.isLocal ? (isHost ? 'Host' : 'Guest') : 'Guest')}
               </p>
           </div>
           {p.isSpeaking && <div className="flex gap-0.5 items-end h-2.5"><div className="w-1 h-2.5 bg-indigo-500 rounded-full animate-bounce" /><div className="w-1 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75" /></div>}
        </motion.div>
      ))}
    </div>
  );

  // ─── TRANSCRIPT PANEL (shared between desktop sidebar and mobile drawer) ─────
  const TranscriptPanel = () => (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 custom-scrollbar">
      {liveTranscripts.length === 0 && !partialCaption ? (
        <div className="h-full flex flex-col items-center justify-center opacity-20">
          <Zap size={48} className="mb-4 text-slate-400" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Standby</p>
        </div>
      ) : (
        <>
          {liveTranscripts.map(t => <TranscriptItem key={t.id} transcript={t} />)}
          {/* Foggy/live partial caption — pulsing italic text while STT processes */}
          {partialCaption && (
            <div className="px-4 py-3 rounded-xl bg-blue-50/60 border border-blue-100 animate-pulse">
              <p className="text-[10px] font-bold text-blue-400 mb-1 uppercase tracking-wider">
                🎤 {partialCaption.speaker} speaking...
              </p>
              <p className="text-sm italic text-slate-500/70 leading-relaxed">
                {partialCaption.text}
              </p>
            </div>
          )}
          <div ref={transcriptEndRef} className="h-8" />
        </>
      )}
    </div>
  );

  // ─── Determine if AI button should be disabled ─────
  // Allow toggling when local AI is active (to deactivate), or when room is connected (to activate)
  const aiButtonDisabled = botState === 'starting' || (!isRoomConnected && !localAIEnabled);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden antialiased select-none font-sans">

      {/* ═══════════ RECONNECT BANNER (in-room — only shows when room was connected then dropped) ═══════════ */}
      {showReconnectBanner && connection.state === 'disconnected' && (
        <div className="flex-shrink-0 px-4 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between z-50">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-rose-500" />
            <span className="text-xs font-bold text-rose-700">Connection lost</span>
            {disconnectReason && <span className="text-[10px] text-rose-400 font-medium">({String(disconnectReason)})</span>}
          </div>
          <button onClick={handleManualReconnect} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow">
            Reconnect
          </button>
        </div>
      )}
      {showReconnectBanner && connection.state === 'reconnecting' && (
        <div className="flex-shrink-0 px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-center gap-2 z-50">
          <Loader2 size={14} className="text-amber-600 animate-spin" />
          <span className="text-xs font-bold text-amber-700">Reconnecting...</span>
        </div>
      )}
      
      {/* ═══════════ HEADER ═══════════ */}
      <header className="flex-shrink-0 px-4 md:px-8 h-14 md:h-16 flex items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur-xl z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center">
           <div className="max-w-[120px] max-h-[34px] flex items-center justify-start overflow-hidden">
              <img src="/logo.png" alt="AYTME" className="w-full h-full object-contain object-left" />
           </div>
           <div className="hidden sm:block">
              <h1 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-slate-800">
                 AYTME <span className="opacity-20">|</span> <span className="text-indigo-600">{roomDetails?.name || 'STAGE'}</span>
              </h1>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">Encrypted Real-Time Pipeline</p>
           </div>
           {/* Mobile-only title */}
           <span className="sm:hidden text-xs font-black uppercase tracking-wider text-indigo-600">{roomDetails?.name || 'Stage'}</span>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3">
           {/* Connection status dot */}
           <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
              <div className={`w-2 h-2 rounded-full ${isRoomConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                {isRoomConnected ? 'Live' : connection.state}
              </span>
           </div>

           {/* AI Status Pulsing Dot */}
           <AIStatusIndicator status={aiStatus} visible={botState === 'active'} />

           {/* Mobile: Participants toggle */}
           <button 
             onClick={() => { setShowParticipants(true); setShowRelay(false); }} 
             className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
           >
              <Users size={14} />
              <span className="text-[10px] font-black">{participants.filter(p => !p.isBot).length}</span>
           </button>
           
           {/* Desktop: Participant count (excluding bots) */}
           <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200">
              <Users size={12} className="text-indigo-600" />
               <span className="text-[10px] font-black text-slate-700">{participants.filter(p => !p.isBot).length}</span>
           </div>
           
           {/* AI Activate button — disabled when room not connected */}
           <button 
             onClick={handleActivateAI} 
             disabled={aiButtonDisabled}
             className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 border
              ${botState === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                : botState === 'starting' ? 'bg-amber-50 text-amber-600 border-amber-200' 
                : aiButtonDisabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 shadow-lg shadow-indigo-200'}
           `}>
             {botState === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
             <span className="hidden sm:inline">{botState === 'active' ? 'AI Active' : botState === 'starting' ? 'Starting...' : 'Activate AI'}</span>
           </button>
           
           {/* Leave button */}
           <button onClick={async () => {
              if (isHost && roomRef.current?.localParticipant) {
                // Broadcast session_ended to all participants
                try {
                  const encoded = new TextEncoder().encode(JSON.stringify({ type: 'session_ended' }));
                  await roomRef.current.localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
                  console.log('[Stage] Broadcasted session_ended to all participants');
                  await new Promise(resolve => setTimeout(resolve, 500));
                } catch (e) { console.warn('[Stage] Failed to broadcast session_ended:', e); }
              }
              await flushSessionUsage(true);
              if (roomRef.current) { try { roomRef.current.disconnect(); } catch(_){} }
              navigate('/dashboard');
            }} className="p-2 md:p-2.5 bg-slate-100 text-slate-400 rounded-xl border border-slate-200 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all">
              <LogOut size={16} />
            </button>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        
        {/* Desktop Sidebar: Left (Participants) — hidden on mobile, toggle available */}
        <section className="hidden xl:flex flex-col w-64 border-r border-slate-200 bg-white p-5 overflow-y-auto custom-scrollbar">
           <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-5 flex items-center gap-2">
              <ShieldCheck size={14} className="text-indigo-500" /> Participants
           </h3>
           <ParticipantList />
        </section>

        {/* Central Engine Area */}
        <section className="flex-1 flex flex-col items-center justify-center relative p-4 md:p-8">
           {/* Background glow */}
           <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-100/50 blur-[100px] rounded-full" />
           </div>
           
            {/* Video tiles: combined local (LiveKit or fallback) + remote LiveKit tracks */}
            {videoTiles.length > 0 ? (
             <div className={`relative z-10 w-full grid gap-4 auto-rows-max ${videoTiles.length === 1 ? 'max-w-2xl grid-cols-1' : 'max-w-5xl grid-cols-1 sm:grid-cols-2'}`}>
              {videoTiles.map(tile => (
                <div key={tile.identity} className="relative rounded-3xl overflow-hidden border border-slate-200 bg-slate-900/20 shadow-xl aspect-video">
                 {tile.type === 'fallback' ? (
                   <LocalCameraFallback />
                 ) : (
                   <VideoTrack track={tile.track} isLocal={tile.isLocal} />
                 )}
                 <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
                 <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-slate-950/70 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                  {tile.isLocal && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  {tile.isLocal ? 'You' : tile.identity}
                 </div>
                </div>
              ))}
             </div>
            ) : (
             <div className="relative z-10 flex flex-col items-center text-center">
              {/* Voice visualizer orb */}
              <motion.div 
                animate={isTalking ? { scale: [1, 1.05, 1], rotate: [0, 1, -1, 0] } : {}}
                className="w-32 h-32 md:w-48 md:h-48 rounded-full border-2 border-indigo-200 flex items-center justify-center bg-white/80 backdrop-blur-xl relative shadow-xl shadow-indigo-100"
              >
                <div className="absolute inset-2 rounded-full border border-indigo-100 animate-pulse" />
                <div className="flex items-center gap-1.5 px-4">
                  {[...Array(6)].map((_, i) => (
                    <motion.div key={i} animate={isTalking ? { height: [10, i%2?32:52, 10] } : { height: 10 }} transition={{ repeat: Infinity, duration: 0.6 + i*0.1 }} className="w-1.5 md:w-2 bg-indigo-500 rounded-full" />
                  ))}
                </div>
              </motion.div>
               
              <div className="mt-8 md:mt-12 space-y-2">
                <div className="flex items-center justify-center gap-3 opacity-50">
                  <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-indigo-400" />
                  <h2 className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-indigo-500">Voice Pipeline</h2>
                  <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-indigo-400" />
                </div>
                <p className="text-slate-400 text-[8px] md:text-[10px] font-bold uppercase tracking-widest">
                  {isTalking ? 'Active • Streaming' : 'System Ready • Subscribed'}
                </p>
              </div>
             </div>
            )}
        </section>

        {/* Desktop Sidebar: Right (Transcripts / Live Relay) — hidden on mobile */}
        <section className="hidden lg:flex flex-col w-[320px] xl:w-[380px] border-l border-slate-200 bg-white overflow-hidden z-20">
           <header className="flex-shrink-0 p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                 <MessageSquare size={14} className="text-indigo-500" /> Live Relay
              </h3>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
           </header>
           <TranscriptPanel />
        </section>
      </main>

      {/* ═══════════ FOOTER CONTROLS — always visible ═══════════ */}
      <footer className="flex-shrink-0 px-3 md:px-8 py-3 md:py-4 flex items-center justify-between border-t border-slate-200 bg-white/95 backdrop-blur-xl z-40" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
         
         {/* Left: Status (desktop only) */}
         <div className="hidden lg:flex items-center gap-3 opacity-40">
            <Activity size={14} className="text-indigo-500" />
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">HD Low Latency</span>
         </div>

         {/* Center: Main Controls — always visible */}
         <div className="flex items-center gap-2 md:gap-4 mx-auto lg:mx-0 flex-wrap justify-center">
            {/* Primary Mic — hidden for broadcast listeners */}
            {/* Broadcast mode: toggle (click on/off). Other modes: hold-to-speak (PTT) */}
            {!isBroadcastListener && (
            <ControlButton 
              icon={Mic} 
              label={
                intentMode === 'broadcast'
                  ? (isMicEnabled ? 'Speaking' : 'Speak')
                  : isPTT ? (window.innerWidth < 640 ? 'Hold' : 'Hold to talk') : 'Mic'
              } 
              isActive={activeMic === 'primary' || (isMicEnabled && activeMic === 'primary')} 
              isPTT={intentMode !== 'broadcast' && isPTT} 
              isDisabled={!isRoomConnected && !localAIEnabled}
              isLoading={isProcessing && activeMicRef.current === 'primary'}
              onToggle={() => { activeMicRef.current = 'primary'; setActiveMic('primary'); toggleMicGlobal(); }} 
              onDown={() => { activeMicRef.current = 'primary'; setActiveMic('primary'); toggleMicGlobal(true); }} 
              onUp={() => { setActiveMic(null); toggleMicGlobal(false); }} 
            />
            )}

            {!isBroadcastListener && (
              <ControlButton
                icon={isCameraEnabled ? Video : VideoOff}
                label={isCameraEnabled ? 'Camera' : 'Cam Off'}
                isActive={isCameraEnabled}
                isDisabled={!isRoomConnected}
                onToggle={() => toggleCameraGlobal()}
              />
            )}

            {/* Streaming indicator — shows partial STT text while recording */}
            {isRecording && (
              <div className="flex items-center ml-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">Streaming</span>
                    </div>
                    {streamingText && (
                      <div className="text-[11px] text-slate-500 font-medium ml-1 max-w-[200px] truncate italic">
                        "{streamingText.slice(-40)}..."
                      </div>
                    )}
              </div>
            )}
            
            {/* Secondary Mic (if secondary language exists) — hidden for broadcast listeners */}
            {!isBroadcastListener && roomDetails?.secondary_lang && (
                 <ControlButton 
                   icon={Mic} 
                   label={
                     intentMode === 'broadcast'
                       ? (isMicEnabled ? roomDetails.secondary_lang : roomDetails.secondary_lang || 'Target')
                       : isPTT ? (window.innerWidth < 640 ? roomDetails.secondary_lang : `Hold ${roomDetails.secondary_lang}`) : roomDetails.secondary_lang || 'Target'
                   } 
                   activeColor="bg-emerald-600" 
                   isActive={activeMic === 'secondary' || (isMicEnabled && activeMic === 'secondary')} 
                   isPTT={intentMode !== 'broadcast' && isPTT} 
                   isDisabled={!isRoomConnected && !localAIEnabled}
                   isLoading={isProcessing && activeMicRef.current === 'secondary'}
                   onToggle={() => { activeMicRef.current = 'secondary'; setActiveMic('secondary'); toggleMicGlobal(); }}
                   onDown={() => { activeMicRef.current = 'secondary'; setActiveMic('secondary'); toggleMicGlobal(true); }} 
                   onUp={() => { setActiveMic(null); toggleMicGlobal(false); }} 
                 />
            )}

            {/* Transcript toggle */}
            <div className="flex flex-col gap-1.5">
               {/* Mobile: Transcript button — always visible on mobile */}
               <button 
                 onClick={() => { setShowRelay(true); setShowParticipants(false); }} 
                 className="lg:hidden px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border border-indigo-200 hover:bg-indigo-100 transition-all"
               >
                 <MessageSquare size={12} /> Transcripts
               </button>
            </div>
         </div>

         {/* Right: Share */}
         <div className="flex items-center gap-3">
            <button 
              onClick={async () => {
                try {
                  // Reuse cached invite token for this room
                  if (cachedInviteTokenRef.current) {
                    const url = buildInviteLink(cachedInviteTokenRef.current);
                    setShareUrl(url);
                    setShowShareModal(true);
                    return;
                  }
                  const { invitationService } = await import('../services/api');
                  const inviteRole = intentMode === 'broadcast' ? 'listener' : 'speaker';
                  const inv = await invitationService.createInvite(roomId, inviteRole, 100, 72);
                  const token = inv.token || inv.id;
                  cachedInviteTokenRef.current = token; // Cache for reuse
                  const url = buildInviteLink(token);
                  setShareUrl(url);
                  setShowShareModal(true);
                } catch (err) {
                  console.error('Share link error:', err);
                  toast.error('Failed to generate invite link');
                }
              }}
              className="p-3 bg-slate-100 text-slate-400 rounded-xl border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              title="Share room link"
            ><Share2 size={16} /></button>
         </div>
      </footer>

      {/* ═══════════ HIDDEN AUDIO TRACKS ═══════════ */}
      <div className="fixed opacity-0 pointer-events-none">{audioTracks.map((t, i) => <AudioTrack key={i} track={t} />)}</div>

      {/* ═══════════ MOBILE DRAWER: Participants ═══════════ */}
      <AnimatePresence>
         {showParticipants && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] lg:hidden">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowParticipants(false)} />
              {/* Drawer */}
              <motion.div 
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} 
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute left-0 top-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
              >
                 <header className="flex-shrink-0 h-14 px-5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                      <Users size={16} className="text-indigo-500" /> Participants ({participants.length})
                    </h3>
                    <button onClick={() => setShowParticipants(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600">
                      <X size={18} />
                    </button>
                 </header>
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <ParticipantList />
                 </div>
              </motion.div>
           </motion.div>
         )}
      </AnimatePresence>

      {/* ═══════════ MOBILE DRAWER: Transcripts ═══════════ */}
      <AnimatePresence>
         {showRelay && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] lg:hidden">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowRelay(false)} />
              {/* Drawer slides up from bottom */}
              <motion.div 
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} 
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute left-0 right-0 bottom-0 h-[75dvh] bg-white rounded-t-3xl shadow-2xl flex flex-col"
              >
                 {/* Handle bar */}
                 <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                 </div>
                 <header className="flex-shrink-0 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                      <MessageSquare size={16} className="text-indigo-500" /> Live Relay
                    </h3>
                    <button onClick={() => setShowRelay(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600">
                      <X size={18} />
                    </button>
                 </header>
                 <TranscriptPanel />
              </motion.div>
           </motion.div>
         )}
      </AnimatePresence>

      {/* Quota Modal */}
      <AnimatePresence>
         {quotaModal.open && <QuotaLimitModal isOpen={quotaModal.open} onClose={() => setQuotaModal({ open: false, info: null })} quotaInfo={quotaModal.info} />}
      </AnimatePresence>

      {/* Caption Test Mode */}
      <CaptionTestMode 
        isOpen={showTestMode}
        onClose={() => setShowTestMode(false)}
        onInjectCaption={handleInjectCaption}
      />

      {/* ═══════════ SHARE MODAL ═══════════ */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Share2 size={28} className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Share Room</h3>
                <p className="text-slate-400 text-sm mt-1">Invite others to join this session</p>
              </div>

              {/* Copy Link */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6">
                <span className="text-xs text-slate-500 truncate flex-1 font-mono">{shareUrl}</span>
                <button onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }} className="p-2 hover:bg-indigo-50 rounded-lg transition-all">
                  {shareCopied ? <CheckCheck size={18} className="text-emerald-500" /> : <Copy size={18} className="text-indigo-600" />}
                </button>
              </div>

              {/* Share Buttons */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <a href={`https://wa.me/?text=${encodeURIComponent(`Join my AYTME translation session: ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all cursor-pointer">
                  <MessageCircle size={24} className="text-emerald-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">WhatsApp</span>
                </a>
                <a href={`sms:?body=${encodeURIComponent(`Join my AYTME translation session: ${shareUrl}`)}`} className="flex flex-col items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all cursor-pointer">
                  <Phone size={24} className="text-blue-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-700">SMS</span>
                </a>
                <a href={`https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Join my AYTME Session')}&body=${encodeURIComponent(`Join my real-time AI translation session on AYTME:\n\n${shareUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all cursor-pointer">
                  <Mail size={24} className="text-rose-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-rose-700">Gmail</span>
                </a>
              </div>

              <button onClick={() => setShowShareModal(false)} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StageWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <Stage {...props} />
    </ErrorBoundary>
  );
}
