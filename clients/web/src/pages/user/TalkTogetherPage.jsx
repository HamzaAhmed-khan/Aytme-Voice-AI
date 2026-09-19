import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Mic2, 
  Settings, 
  Play, 
  Square, 
  User, 
  Languages, 
  Activity,
  History,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RealtimeTranslateSession as TalkTogetherSession } from '../../utils/RealtimeTranslateSession';

const TalkTogetherPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState(null);
  const [devices, setDevices] = useState([]);
  const [micA, setMicA] = useState('');
  const [micB, setMicB] = useState('');
  
  const [isSetup, setIsSetup] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState(null);

  const sessionRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      // 1. Fetch Room Details
      const res = await fetch(`/api/v1/rooms/join/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
      }

      // 2. Fetch Audio Devices
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs.filter(d => d.kind === 'audioinput'));
      } catch (err) {
        setError('Microphone access denied. Please allow permissions.');
      }
    };
    init();
  }, [slug]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  const startSession = async () => {
    if (!micA || !micB) return;
    
    try {
      const session = new TalkTogetherSession({
        micAId: micA,
        micBId: micB,
        langA: room.mic_a_lang || 'English',
        langB: room.mic_b_lang || 'Spanish',
        apiToken: localStorage.getItem('token'),
        onTranscript: (data) => {
          setTranscripts(prev => [...prev, { ...data, timestamp: new Date() }]);
        }
      });

      await session.start();
      sessionRef.current = session;
      setIsActive(true);
      setIsSetup(false);
    } catch (err) {
      setError('Failed to initialize session.');
    }
  };

  const stopSession = () => {
    sessionRef.current?.stop();
    setIsActive(false);
    setIsSetup(true);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
            <Mic2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg">{room?.name || 'Loading...'}</h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Talk Together Session</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isActive ? (
            <button 
              onClick={stopSession}
              className="flex items-center px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-lg shadow-red-900/20"
            >
              <Square className="w-4 h-4 mr-2 fill-current" /> Stop Session
            </button>
          ) : (
            <button className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
              <Settings className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center py-10 px-6">
        <AnimatePresence mode="wait">
          {isSetup ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="max-w-4xl w-full"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4">Device Setup</h2>
                <p className="text-gray-400">Assign physical microphones to each participant.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {/* Participant A */}
                <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <User className="w-24 h-24" />
                  </div>
                  <h3 className="text-xl font-bold mb-6 flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center mr-3 text-xs">A</div>
                    Participant One
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Microphone</label>
                      <select 
                        value={micA}
                        onChange={(e) => setMicA(e.target.value)}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Mic...</option>
                        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center text-sm text-gray-400 py-3 px-4 rounded-xl bg-white/5 border border-white/5">
                      <Languages className="w-4 h-4 mr-2 text-indigo-400" />
                      Speaks {room?.mic_a_lang || 'English'}
                    </div>
                  </div>
                </div>

                {/* Participant B */}
                <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <User className="w-24 h-24" />
                  </div>
                  <h3 className="text-xl font-bold mb-6 flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center mr-3 text-xs">B</div>
                    Participant Two
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Microphone</label>
                      <select 
                        value={micB}
                        onChange={(e) => setMicB(e.target.value)}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-pink-500 outline-none"
                      >
                        <option value="">Select Mic...</option>
                        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center text-sm text-gray-400 py-3 px-4 rounded-xl bg-white/5 border border-white/5">
                      <Languages className="w-4 h-4 mr-2 text-pink-400" />
                      Speaks {room?.mic_b_lang || 'Spanish'}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={startSession}
                disabled={!micA || !micB}
                className="w-full bg-white text-black font-bold py-6 rounded-[2rem] text-xl flex items-center justify-center hover:scale-[1.01] transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <Play className="w-6 h-6 mr-3 fill-current" /> Initialize Translation
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full max-w-6xl flex flex-col"
            >
              {/* Active Visualizer Space */}
              <div className="flex gap-4 mb-8 shrink-0">
                <div className="px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-bold flex items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                  PIPELINE ACTIVE
                </div>
                <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs font-bold flex items-center">
                  <Activity className="w-3 h-3 mr-2" />
                  LATENCY: ~1.2s
                </div>
              </div>

              {/* Transcript list */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-6 pr-4 scroll-smooth"
                style={{ scrollbarWidth: 'none' }}
              >
                {transcripts.map((t, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: t.micId === 'A' ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex ${t.micId === 'A' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`max-w-[80%] rounded-3xl p-6 ${
                      t.micId === 'A' 
                      ? 'bg-indigo-600/10 border border-indigo-500/30' 
                      : 'bg-pink-600/10 border border-pink-500/30'
                    }`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded ${
                          t.micId === 'A' ? 'bg-indigo-500 text-white' : 'bg-pink-500 text-white'
                        }`}>
                          Participant {t.micId}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">
                          {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm italic mb-2">「 {t.source} 」</p>
                      <p className="text-xl font-medium leading-relaxed">{t.translated}</p>
                    </div>
                  </motion.div>
                ))}
                {transcripts.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600">
                    <History className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Waiting for speech...</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default TalkTogetherPage;
