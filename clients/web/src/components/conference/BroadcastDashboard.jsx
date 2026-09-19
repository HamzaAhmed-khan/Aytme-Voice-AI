import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  Globe, 
  BarChart3, 
  ShieldCheck, 
  Zap,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BroadcastDashboard({ roomId }) {
  const [stats, setStats] = useState({
    total_listeners: 0,
    active_pipelines: [],
    timestamp: null
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/v1/rooms/${roomId}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        // Silent error, stats are secondary
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [roomId]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-8 left-8 w-80 bg-slate-950/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl z-20 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[60px] rounded-full pointer-events-none" />
      
      <div className="relative">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-900/20">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white leading-none">Broadcast</h2>
              <p className="text-[10px] text-orange-400 font-bold uppercase tracking-[0.2em] mt-1">Live Engine</p>
            </div>
          </div>
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }} 
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,1)]" 
          />
        </header>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-3xl bg-white/5 border border-white/5 text-center">
            <Users className="w-4 h-4 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-black text-white">{stats.total_listeners}</p>
            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Listeners</p>
          </div>
          <div className="p-4 rounded-3xl bg-white/5 border border-white/5 text-center">
            <Activity className="w-4 h-4 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-black text-white">{stats.active_pipelines.length}</p>
            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Audio Tracks</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 px-1 text-[10px] uppercase font-black tracking-widest text-gray-500">
              <span className="flex items-center gap-2">
                <Globe size={12} className="text-orange-400" /> Active Translations
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {stats.active_pipelines.map(lang => (
                  <motion.span 
                    key={lang}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-[10px] font-bold text-orange-400 uppercase tracking-widest"
                  >
                    {lang}
                  </motion.span>
                ))}
              </AnimatePresence>
              {stats.active_pipelines.length === 0 && (
                <span className="text-[10px] text-gray-600 font-bold italic">No interpretation requested...</span>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">System Health</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Optimal</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
