import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Mic2,
  Radio,
  ArrowRight,
  Check,
  Languages,
  Shield,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const modes = [
  {
    id: 'conversation',
    title: 'Conversation',
    description: 'Basic video/audio conference with team members. Fast, reliable, no AI overhead.',
    icon: Users,
    color: 'from-blue-500 to-indigo-600',
    features: ['HD Video/Audio', 'Screen Sharing', 'Low Latency']
  },
  {
    id: 'talk_together',
    title: 'Talk Together',
    description: 'Two people on one device. Connect two microphones for real-time local translation.',
    icon: Mic2,
    color: 'from-purple-500 to-pink-600',
    features: ['Physical 2-Mic Support', 'Low Price ($0.08/min)', 'Local Interpretation']
  },
  {
    id: 'broadcast',
    title: 'Broadcast',
    description: 'Host a call for thousands. One host speaks, listeners select their preferred AI voice.',
    icon: Radio,
    color: 'from-orange-500 to-red-600',
    features: ['Unlimited Listeners', 'Multi-Language Fan-out', 'Host Dashboard']
  }
];

const NewRoomPage = () => {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [micALang, setMicALang] = useState('English');
  const [micBLang, setMicBLang] = useState('Spanish');
  const [availableLangs, setAvailableLangs] = useState(['English', 'Spanish', 'French', 'Urdu', 'Arabic']);

  const handleCreateRoom = async () => {
    if (!roomName) return;
    setIsLoading(true);

    try {
      const payload = {
        name: roomName,
        mode: selectedMode,
        visibility: 'public',
        primary_lang: micALang,
        secondary_lang: micBLang,
        mic_a_lang: micALang,
        mic_b_lang: micBLang,
        available_langs: availableLangs
      };

      const response = await fetch('/api/v1/rooms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const room = await response.json();
        // Route to specialized page if Talk Together
        if (selectedMode === 'talk_together') {
          navigate(`/user/talk-together/${room.slug}`);
        } else {
          navigate(`/user/conference/${room.slug}`);
        }
      }
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl lg:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400"
          >
            Create New Session
          </motion.h1>
          <p className="text-gray-400 text-lg">Select the platform mode that fits your needs.</p>
        </header>

        {/* Mode Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {modes.map((mode, idx) => (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedMode(mode.id)}
              className={`relative cursor-pointer group p-8 rounded-3xl border transition-all duration-300 ${selectedMode === mode.id
                  ? 'bg-white/10 border-white/40 shadow-[0_0_40px_-15px_rgba(255,255,255,0.3)]'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
            >
              <div className={`w-14 h-14 rounded-2xl mb-6 flex items-center justify-center bg-gradient-to-br ${mode.color}`}>
                <mode.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">{mode.title}</h3>
              <p className="text-gray-400 mb-6 leading-relaxed">{mode.description}</p>

              <ul className="space-y-3">
                {mode.features.map(f => (
                  <li key={f} className="flex items-center text-sm text-gray-300">
                    <Check className="w-4 h-4 mr-2 text-green-400" />
                    {f}
                  </li>
                ))}
              </ul>

              {selectedMode === mode.id && (
                <motion.div
                  layoutId="active-ring"
                  className="absolute inset-0 rounded-3xl border-2 border-white/50 pointer-events-none"
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Setup Form */}
        <AnimatePresence mode="wait">
          {selectedMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 rounded-3xl p-8 lg:p-12 border border-white/10 backdrop-blur-xl"
            >
              <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold mb-8 flex items-center">
                  Session Details
                  <div className="ml-4 px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-gray-400 border border-white/10 uppercase tracking-widest">
                    {selectedMode.replace('_', ' ')}
                  </div>
                </h2>

                <div className="space-y-8">
                  <div className="group">
                    <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">Room Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Weekly Strategy Sync"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-gray-600"
                    />
                  </div>

                  {selectedMode === 'talk_together' && (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">Mic A Language</label>
                        <select
                          value={micALang}
                          onChange={(e) => setMicALang(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none"
                        >
                          {availableLangs.map(l => <option key={l} value={l} className="bg-neutral-900">{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">Mic B Language</label>
                        <select
                          value={micBLang}
                          onChange={(e) => setMicBLang(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none"
                        >
                          {availableLangs.map(l => <option key={l} value={l} className="bg-neutral-900">{l}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleCreateRoom}
                    disabled={!roomName || isLoading}
                    className="w-full group relative overflow-hidden bg-white text-black font-bold py-5 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="relative z-10 flex items-center justify-center text-lg">
                      {isLoading ? 'Creating...' : 'Launch Room'}
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NewRoomPage;
