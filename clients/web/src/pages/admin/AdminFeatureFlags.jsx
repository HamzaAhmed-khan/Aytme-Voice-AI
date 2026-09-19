import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { Flag, RefreshCw, ToggleLeft, ToggleRight, Zap, FlaskConical, Cpu, ShieldAlert, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const FLAG_ICONS = {
    new_ai_models: Cpu,
    beta_translation: FlaskConical,
    experimental_latency: Zap,
};

const BUILTIN_FLAGS = [
    { key: 'new_ai_models', label: 'Next-Gen Models', description: 'Unlock access to GPT-4o-realtime and advanced LLM pipelines for translation.', enabled: false },
    { key: 'beta_translation', label: 'Flow Architecture', description: 'Enable the new streaming audio pipeline for ultra-low latency processing.', enabled: false },
    { key: 'experimental_latency', label: 'Turbo Latency', description: 'Activate reduced-buffer streaming. Accuracy may vary depending on network.', enabled: false },
];

export default function AdminFeatureFlags() {
    const [flags, setFlags] = useState(BUILTIN_FLAGS);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState({});

    const loadFlags = () => {
        setLoading(true);
        adminService.listFeatureFlags()
            .then(data => {
                if (Array.isArray(data)) {
                    setFlags(BUILTIN_FLAGS.map(bf => {
                        const api = data.find(d => d.key === bf.key);
                        return api ? { ...bf, enabled: api.enabled } : bf;
                    }));
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadFlags();
    }, []);

    const handleToggle = async (flagKey) => {
        const current = flags.find(f => f.key === flagKey);
        if (!current) return;
        setToggling(p => ({ ...p, [flagKey]: true }));
        const newVal = !current.enabled;
        
        // Optimistic update
        setFlags(p => p.map(f => f.key === flagKey ? { ...f, enabled: newVal } : f));
        
        try {
            await adminService.toggleFeatureFlag(flagKey, newVal);
            toast.success(`${current.label} updated`);
        } catch {
            // Revert
            setFlags(p => p.map(f => f.key === flagKey ? { ...f, enabled: !newVal } : f));
            toast.error('Sync failed');
        } finally {
            setToggling(p => ({ ...p, [flagKey]: false }));
        }
    };

    return (
        <div className="space-y-6 sm:space-y-10 text-white animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Feature Flags</h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1">Platform Logic & Experimental Gates</p>
                </div>
                <button 
                    onClick={loadFlags} 
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Gateways
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {loading && (flags.length === 0 || loading) ? (
                    [1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-900/40 border border-white/5 rounded-[32px] animate-pulse" />)
                ) : flags.map((flag, i) => {
                    const Icon = FLAG_ICONS[flag.key] || Flag;
                    const isActive = flag.enabled;
                    return (
                        <motion.div
                            key={flag.key} 
                            initial={{ opacity: 0, y: 15 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ delay: i * 0.08 }}
                            className={`relative overflow-hidden group p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] border transition-all duration-500 ${isActive 
                                ? 'bg-indigo-500/10 border-indigo-500/30 shadow-2xl shadow-indigo-500/10' 
                                : 'bg-slate-900/40 border-white/5 hover:border-white/10 backdrop-blur-3xl'}`}
                        >
                            {/* Decorative logic lines */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full -mr-16 -mt-16 pointer-events-none" />
                            
                            <div className="flex justify-between items-start mb-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110 ${isActive ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                    <Icon size={24} />
                                </div>
                                <button
                                    onClick={() => handleToggle(flag.key)}
                                    disabled={toggling[flag.key]}
                                    className={`relative w-12 h-6 rounded-full transition-colors duration-300 outline-none focus:ring-2 focus:ring-indigo-500/20 ${isActive ? 'bg-indigo-500' : 'bg-slate-800'}`}
                                >
                                    <motion.div 
                                        animate={{ x: isActive ? 24 : 2 }}
                                        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-lg"
                                    />
                                </button>
                            </div>

                            <div className="space-y-3 min-h-[100px]">
                                <h3 className={`font-black text-lg transition-colors ${isActive ? 'text-white' : 'text-slate-400'}`}>{flag.label}</h3>
                                <p className="text-slate-500 text-[10px] sm:text-xs font-bold leading-relaxed">{flag.description}</p>
                            </div>

                            <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-400' : 'text-slate-600'}`}>
                                        {isActive ? 'Active' : 'Standby'}
                                    </span>
                                </div>
                                {isActive && <Sparkles size={12} className="text-indigo-400 animate-bounce" />}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] flex flex-col sm:flex-row items-center gap-6 group hover:border-amber-500/20 transition-all">
                <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 text-amber-500 shrink-0 shadow-lg shadow-amber-500/5 group-hover:scale-110 transition-transform">
                    <ShieldAlert size={24} />
                </div>
                <div>
                    <h4 className="font-black text-xs sm:text-sm uppercase tracking-widest text-slate-300 mb-2">Global System Impact</h4>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold leading-relaxed">
                        These switches influence core application logic across all user instances. 
                        Enabling unstable flags may cause localized latency spikes or temporary translation degradations. 
                        Monitor <span className="text-indigo-400">System Telemetry</span> after making changes.
                    </p>
                </div>
            </div>
        </div>
    );
}
