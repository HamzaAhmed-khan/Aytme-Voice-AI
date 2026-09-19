import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, VideoPresets, DataPacket_Kind } from 'livekit-client';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { safeOn, safeOff } from '../../utils/eventUtils';
import { useOrganizationStore } from '../../store/organizationStore';
import { useRoomStore } from '../../store/roomStore';
import { useTranscriptStore } from '../../store/transcriptStore';
import { useAgentStore } from '../../store/agentStore';
import { roomService, participantService, transcriptService } from '../../services/api';
import {
    MicOff, MessageSquare, Activity,
    Shield, Download, X, VolumeX, Sparkles, ArrowRight,
    Globe, Zap, User as UserIcon, Radio, Headphones
} from 'lucide-react';
import { motion, AnimatePresence as FramerAnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// New Modular Components
import ConferenceHeader from '../../components/conference/ConferenceHeader';
import ParticipantGrid from '../../components/conference/ParticipantGrid';
import TranscriptFeed from '../../components/conference/TranscriptFeed';
import AgentControlPanel from '../../components/conference/AgentControlPanel';
import ParticipantSidebar from '../../components/conference/ParticipantSidebar';
import ActivationModal from '../../components/conference/ActivationModal';
import SettingsModal from '../../components/conference/SettingsModal';

const LANGUAGES = [
    { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' }, { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' }, { code: 'ar', label: 'Arabic' },
    { code: 'ur', label: 'Urdu' }, { code: 'hi', label: 'Hindi' },
    { code: 'ja', label: 'Japanese' }, { code: 'zh', label: 'Chinese' },
];

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "wss://aytme-56n8aplm.livekit.cloud";

const ListenerVideo = ({ track }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (!track || !videoRef.current) return;
        try { track.attach(videoRef.current); } catch (e) {}
        return () => {
            try { track.detach(videoRef.current); } catch (e) {}
        };
    }, [track]);
    if (!track) return null;
    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
        />
    );
};

export default function Conference({ selectedRoom: initialRoom }) {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // Stores
    const { user: currentUser, isAuthenticated } = useAuthStore();
    const { activeRoom } = useRoomStore();
    const { liveTranscripts, addLiveTranscript, clearLiveTranscripts, setTranscripts: setHistoricalTranscripts } = useTranscriptStore();
    const setAgentStatus = useAgentStore(state => state.setAgentStatus);
    const resetAgent = useAgentStore(state => state.resetAgent);

    const [selectedRoom, setSelectedRoom] = useState(() => {
        if (initialRoom) return initialRoom;
        const queryParams = new URLSearchParams(window.location.search);
        if (queryParams.get('token')) {
            return { id: roomId, name: "Joint Guest Session" };
        }
        return activeRoom;
    });

    const [room, setRoom] = useState(null);
    const [isBotActive, setIsBotActive] = useState(false);
    const [startingBot, setStartingBot] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [isMicEnabled, setIsMicEnabled] = useState(true);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [showParticipants, setShowParticipants] = useState(false);
    const [showTranscripts, setShowTranscripts] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [isSpeechActive, setIsSpeechActive] = useState(false);
    const [artifactReady, setArtifactReady] = useState(null);
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [primaryLang, setPrimaryLang] = useState('English');
    const [secondaryLang, setSecondaryLang] = useState('Spanish');
    const [muteAI, setMuteAI] = useState(false);
    const [currentSpeaker, setCurrentSpeaker] = useState(null);
    const [prefetchedToken, setPrefetchedToken] = useState(null);
    const [prefetchedLkUrl, setPrefetchedLkUrl] = useState(null);
    const [needsJoinGesture, setNeedsJoinGesture] = useState(true);
    const [isBotSpeaking, setIsBotSpeaking] = useState(false);
    const [videoTracks, setVideoTracks] = useState({});

    // 🟢 BROADCAST STATE
    const isHost = (
        (selectedRoom?.owner_id && currentUser?.id && String(selectedRoom.owner_id) === String(currentUser.id)) ||
        (currentUser?.role && String(currentUser.role).toLowerCase() === 'admin')
    );
    const isBroadcastMode = selectedRoom?.mode === 'broadcast';

    const roomRef = useRef(null);
    const wsRef = useRef(null);
    const startingBotTimeoutRef = useRef(null);
    const isConnectingRef = useRef(false);
    const participantPollRef = useRef(null);
    const isMountedRef = useRef(false);
    const attachedAudioSidsRef = useRef(new Set());

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (participantPollRef.current) {
                clearInterval(participantPollRef.current);
                participantPollRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedRoom && roomId) {
            roomService.getRoom(roomId)
                .then(setSelectedRoom)
                .catch(err => {
                    console.error("Failed to fetch room", err);
                    setStatus("Room Not Found");
                });
        }
    }, [roomId, selectedRoom]);

    useEffect(() => {
        if (selectedRoom?.id && !prefetchedToken && !isConnectingRef.current) {
            const fetchToken = async () => {
                try {
                    const result = await roomService.getToken(selectedRoom.id);
                    const token = typeof result === 'string' ? result : result?.token;
                    const lkUrl = result?.url || LIVEKIT_URL;
                    if (isMountedRef.current) {
                        setPrefetchedToken(token);
                        setPrefetchedLkUrl(lkUrl);
                    }
                } catch (err) {
                    console.error("[Conference] Failed to pre-fetch token:", err);
                }
            };
            fetchToken();
        }
    }, [selectedRoom, prefetchedToken]);

    const updateParticipants = useCallback(() => {
        const r = roomRef.current;
        if (!r || !isMountedRef.current) return;

        const localIdentity = String(r.localParticipant?.identity || '');
        const parts = [{
            identity: localIdentity || 'Me',
            rawIdentity: localIdentity || 'local',
            isLocal: true,
            metadata: r.localParticipant?.metadata
        }];

        const remoteMap = r.remoteParticipants || r.participants;
        const remotes = remoteMap ? Array.from(remoteMap.values()) : [];

        remotes.forEach((p) => {
            const identity = String(p?.identity || p?.sid || '');
            if (!identity || identity === localIdentity) return;
                let metadataObj = {};
                try {
                    if (p.metadata) {
                        metadataObj = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
                    }
                } catch (e) { }

            const identityLower = identity.toLowerCase();
            const isBot = (metadataObj.role === 'interpreter') || identityLower.startsWith('bot_') || identityLower.startsWith('bot-');

            parts.push({
                identity: isBot ? "Neural Relay" : identity,
                rawIdentity: identity,
                isLocal: false,
                metadata: metadataObj,
                isBot
            });
        });

        const botFound = parts.some(p => p.isBot);
        setIsBotActive(botFound);
        if (botFound) setStartingBot(false);
        setAgentStatus(botFound ? 'connected' : (startingBot ? 'connecting' : 'idle'));
        setParticipants(parts);
    }, [startingBot, setAgentStatus]);

    const attachTrack = useCallback((track) => {
        if (track.kind !== 'audio') return;
        if (attachedAudioSidsRef.current.has(track.sid)) return;

        attachedAudioSidsRef.current.add(track.sid);
        const element = track.attach();
        element.setAttribute('data-track-id', track.sid);
        element.setAttribute('autoplay', 'true');
        element.setAttribute('playsinline', 'true');

        document.body.appendChild(element);
        element.play().catch(() => {
            setAudioBlocked(true);
        });
    }, []);

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

    const syncLocalVideoTrack = useCallback(() => {
        const room = roomRef.current;
        if (!room?.localParticipant) return;
        const identity = String(room.localParticipant.identity || 'local');
        const pubs = Array.from(room.localParticipant.videoTrackPublications.values());
        const pub = pubs.find(p => p.track);
        setVideoTrackForIdentity(identity, pub?.track || null);
    }, [setVideoTrackForIdentity]);

    const handleConnect = useCallback(async (explicitToken, explicitUrl) => {
        try {
            if (!isMountedRef.current || !selectedRoom?.id) return;
            if (isConnectingRef.current || (roomRef.current && roomRef.current.state === 'connected')) return;

            isConnectingRef.current = true;
            setStatus('Connecting...');

            const apiUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin + '/api/v1';
            const wsBase = apiUrl.replace('http', 'ws').replace('/api/v1', '');
            const wsUrl = `${wsBase}/ws/${selectedRoom.id}`;

            if (wsRef.current) wsRef.current.close();
            wsRef.current = new WebSocket(wsUrl);

            let token = explicitToken || prefetchedToken || sessionStorage.getItem('lk_token');
            let lkUrl = explicitUrl || prefetchedLkUrl || LIVEKIT_URL;

            const newRoom = new Room({
                publishDefaults: { audioBitrate: 32000 },
                adaptiveStream: true,
                dynacast: true,
            });

            await newRoom.connect(lkUrl, token);
            roomRef.current = newRoom;
            setRoom(newRoom);
            setStatus('Connected');

            newRoom.startAudio().catch(() => setAudioBlocked(true));

            safeOn(newRoom, RoomEvent.TrackSubscribed, (track, publication, participant) => {
                if (track.kind === 'audio') {
                    attachTrack(track);
                }
                if (track.kind === 'video') {
                    const identity = String(participant?.identity || '');
                    setVideoTrackForIdentity(identity, track);
                }
                updateParticipants();
            });
            safeOn(newRoom, RoomEvent.TrackUnsubscribed, (track) => {
                if (track.kind === 'video') {
                    removeVideoTrackBySid(track.sid);
                }
                updateParticipants();
            });
            safeOn(newRoom, RoomEvent.ParticipantConnected, updateParticipants);
            safeOn(newRoom, RoomEvent.ParticipantDisconnected, updateParticipants);
            safeOn(newRoom, RoomEvent.ActiveSpeakersChanged, (speakers) => {
                const active = speakers?.[0]?.identity || null;
                setCurrentSpeaker(active);
                updateParticipants();
            });
            safeOn(newRoom, RoomEvent.LocalTrackPublished, syncLocalVideoTrack);
            safeOn(newRoom, RoomEvent.LocalTrackUnpublished, syncLocalVideoTrack);

            safeOn(newRoom, RoomEvent.DataReceived, (payload, participant) => {
                try {
                    const str = new TextDecoder().decode(payload);
                    const data = JSON.parse(str);
                    if (data.type === 'caption') {
                        addLiveTranscript({
                            id: `msg-${Date.now()}`,
                            speaker: data.is_ai ? "AYTME CORE" : (data.speaker || "Speaker"),
                            text: data.source_text,
                            timestamp: new Date(),
                            is_ai: data.is_ai,
                            is_final: true,
                        });
                    }
                } catch (e) { }
            });

            updateParticipants();
            if (participantPollRef.current) {
                clearInterval(participantPollRef.current);
            }
            participantPollRef.current = setInterval(() => {
                updateParticipants();
            }, 2000);

            // 🟢 Role specific: Hosts should enable mic, Listeners should be muted (Echo Suppression)
            if (isBroadcastMode && !isHost) {
                await newRoom.localParticipant.setMicrophoneEnabled(false);
                setIsMicEnabled(false);
                await newRoom.localParticipant.setCameraEnabled(false);
                setIsCameraEnabled(false);
            } else {
                await newRoom.localParticipant.setMicrophoneEnabled(true);
                setIsMicEnabled(true);
                setIsCameraEnabled(false);
            }
            syncLocalVideoTrack();

        } catch (err) {
            console.error('[Conference] Connection failed:', err);
            setAudioBlocked(true);
        } finally {
            isConnectingRef.current = false;
        }
    }, [selectedRoom, prefetchedToken, isHost, isBroadcastMode]);

    const handleToggleCamera = useCallback(async (nextState) => {
        const room = roomRef.current;
        if (!room) return;
        if (isBroadcastMode && !isHost) return;
        const next = nextState !== undefined ? nextState : !isCameraEnabled;
        try {
            await room.localParticipant.setCameraEnabled(next);
            setIsCameraEnabled(next);
            syncLocalVideoTrack();
        } catch (err) {
            console.error('[Conference] Camera toggle failed:', err);
        }
    }, [isCameraEnabled, isBroadcastMode, isHost, syncLocalVideoTrack]);

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setPrimaryLang(newLang);

        // 🟢 Broadcast: Send demand to worker via Data Packet
        if (room && isBroadcastMode) {
            const payload = JSON.stringify({ type: "change_language", language: newLang });
            room.localParticipant.publishData(new TextEncoder().encode(payload), DataPacket_Kind.RELIABLE);
            toast.success(`Switching to ${newLang} interpretation...`, { icon: '🌐' });
        }
    };

    if (needsJoinGesture) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent">
                <h1 className="text-6xl font-black text-white mb-6 uppercase italic tracking-tighter">Neural Sync</h1>
                <p className="text-slate-500 mb-12 uppercase tracking-[0.3em]">Ready to link with "{selectedRoom?.name}"</p>
                <button
                    onClick={() => {
                        setNeedsJoinGesture(false);
                        handleConnect();
                    }}
                    className="px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-lg transition-all flex items-center gap-6 border border-indigo-400/30 uppercase tracking-[0.2em]"
                >
                    Establish Link
                    <ArrowRight size={24} />
                </button>
            </div>
        );
    }

    const primaryVideoTrack = currentSpeaker ? videoTracks[currentSpeaker] : null;
    const visibleBroadcastVideoTrack = primaryVideoTrack || Object.values(videoTracks)[0] || null;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-50 overflow-hidden relative">
            {/* BACKGROUND ACCENTS */}
            <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

            {/* BROADCAST LISTENER VIEW */}
            {isBroadcastMode && !isHost ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 z-10">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center shadow-2xl relative">
                        <div className="absolute inset-0 bg-indigo-500/10 blur-xl animate-pulse rounded-full" />
                        <Headphones className="w-16 h-16 text-indigo-400 relative" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black mb-2">{selectedRoom.name}</h2>
                        <p className="text-gray-500 uppercase tracking-widest text-xs font-bold">Currently Listening Live</p>
                    </div>

                    {visibleBroadcastVideoTrack && (
                        <div className="w-full max-w-4xl aspect-video overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/40 shadow-2xl">
                            <ListenerVideo track={visibleBroadcastVideoTrack} />
                        </div>
                    )}

                    <div className="w-full max-w-sm bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-3xl">
                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Your AI Interpreter</label>
                        <select
                            value={primaryLang}
                            onChange={handleLanguageChange}
                            className="w-full bg-black border border-white/10 rounded-2xl px-6 py-4 text-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        >
                            {LANGUAGES.map(l => <option key={l.code} value={l.label}>{l.label}</option>)}
                        </select>
                        <p className="mt-4 text-xs text-gray-400 italic">Target language audio will play automatically.</p>
                    </div>

                    <div className="w-full max-w-lg h-48 overflow-y-auto pr-4 scroll-smooth">
                        <TranscriptFeed transcripts={liveTranscripts} />
                    </div>
                </div>
            ) : (
                <>
                    <ConferenceHeader
                        roomName={selectedRoom.name}
                        isBotActive={isBotActive}
                        onActivateAI={() => setShowActivationModal(true)}
                        onBack={() => navigate('/dashboard')}
                    />

                    <main className="flex-1 flex overflow-hidden z-10 relative">
                        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950/20 relative">
                            <ParticipantGrid participants={participants} videoTracks={videoTracks} />

                            {/* BROADCAST STAT OVERLAY (HOST) */}
                            {isBroadcastMode && isHost && (
                                <div className="absolute top-8 left-8 p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl backdrop-blur-xl flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                                        <Radio className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-orange-400 tracking-wider">Live Broadcast</p>
                                        <p className="text-sm font-bold text-white">0 Listeners</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {showTranscripts && (
                            <aside className="hidden lg:flex flex-col w-[450px] border-l border-white/5 bg-slate-900/40 backdrop-blur-3xl">
                                <TranscriptFeed transcripts={liveTranscripts} />
                            </aside>
                        )}
                    </main>

                    <AgentControlPanel
                        isMicEnabled={isMicEnabled}
                        isCameraEnabled={isCameraEnabled}
                        isBotActive={isBotActive}
                        onToggleMic={handleToggleMic}
                        onToggleCamera={handleToggleCamera}
                        isCameraDisabled={isBroadcastMode && !isHost}
                        onActivateAI={() => setShowActivationModal(true)}
                        onLanguageChange={handleLanguageChange}
                    />
                </>
            )}

            <ActivationModal
                isOpen={showActivationModal}
                onClose={() => setShowActivationModal(false)}
                onConfirm={handleConfirmActivation}
                primaryLang={primaryLang}
                setPrimaryLang={setPrimaryLang}
                secondaryLang={secondaryLang}
                setSecondaryLang={setSecondaryLang}
                languages={LANGUAGES}
            />
        </div>
    );
}