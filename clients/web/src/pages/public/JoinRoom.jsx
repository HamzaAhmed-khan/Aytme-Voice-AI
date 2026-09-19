import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Radio, 
  ArrowRight, 
  Languages, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

const JoinRoom = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [identity, setIdentity] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const response = await fetch(`/api/v1/rooms/join/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setRoom(data);
        } else {
          setError('Room not found or link expired.');
        }
      } catch (err) {
        setError('Failed to load room details.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoom();
  }, [slug]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!identity) return;
    setIsJoining(true);

    try {
      const response = await fetch(`/api/v1/rooms/join/${slug}?identity=${encodeURIComponent(identity)}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        // Store guest token
        sessionStorage.setItem('guest_token', data.access_token);
        sessionStorage.setItem('lk_token', data.livekit_token);
        
        // Navigate to specialized room page based on mode
        if (room.mode === 'broadcast') {
          navigate(`/public/broadcast/${slug}`);
        } else {
          navigate(`/public/conference/${slug}`);
        }
      } else {
        setError('Failed to join room.');
      }
    } catch (err) {
      setError('Connection error.');
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Unavailable</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl"
          >
            Back Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 lg:p-12 backdrop-blur-3xl overflow-hidden relative"
        >
          {/* Accent decoration */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <header className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6">
                {room.mode === 'broadcast' ? (
                  <Radio className="w-8 h-8 text-orange-500" />
                ) : (
                  <Users className="w-8 h-8 text-blue-500" />
                )}
              </div>
              <h1 className="text-3xl font-bold mb-2">{room.name}</h1>
              <p className="text-gray-400 uppercase tracking-widest text-xs font-semibold">
                {room.mode} Mode
              </p>
            </header>

            {room.mode === 'broadcast' && (
              <div className="mb-10 p-6 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center text-sm font-medium text-gray-300 mb-4">
                  <Languages className="w-4 h-4 mr-2" />
                  Live Interpretation Available
                </div>
                <div className="flex flex-wrap gap-2">
                  {room.available_langs?.map(lang => (
                    <span key={lang} className="px-3 py-1 bg-white/10 rounded-full text-xs text-gray-400">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest ml-1">
                  Your Display Name
                </label>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Enter your name..."
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-gray-700"
                />
              </div>

              <button
                type="submit"
                disabled={!identity || isJoining}
                className="w-full group bg-white text-black font-bold py-5 rounded-2xl text-lg flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {isJoining ? 'Joining...' : 'Enter Room'}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <footer className="mt-10 pt-10 border-t border-white/5 text-center">
              <div className="flex items-center justify-center text-xs text-gray-500 uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4 mr-2 text-green-500" />
                Secure End-to-End Session
              </div>
            </footer>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinRoom;
