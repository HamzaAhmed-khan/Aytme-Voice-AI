import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { ScrollText, AlertCircle, Info, AlertTriangle, RefreshCw, Filter, ShieldCheck, ShieldAlert, Cpu, Layers, Activity, User, Box } from 'lucide-react';
import { motion } from 'framer-motion';

const OUTCOME_STYLES = {
    success: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    failure: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    pending: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
};

const ACTOR_ICONS = {
    user: User,
    system: ShieldCheck,
    worker: Cpu,
};

function HealthCard({ label, status, icon: Icon }) {
    const ok = status === 'ok' || status === 'healthy' || status === true || status === 'up';
    return (
        <div className={`bg-slate-900/40 backdrop-blur-3xl border rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 transition-all group hover:scale-[1.02] ${ok ? 'border-emerald-500/20 hover:border-emerald-500/40 shadow-lg shadow-emerald-500/5' : 'border-rose-500/20 hover:border-rose-500/40 shadow-lg shadow-rose-500/5'}`}>
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl ${ok ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                    {Icon ? <Icon size={18} className={ok ? 'text-emerald-400' : 'text-rose-400'} /> : (ok ? <ShieldCheck size={18} className="text-emerald-400" /> : <ShieldAlert size={18} className="text-rose-400" />)}
                </div>
                <div className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]'} animate-pulse`} />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
            <p className={`text-base sm:text-lg font-black mt-1 ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ok ? 'Healthy' : 'Degraded'}
            </p>
        </div>
    );
}

export default function AdminSystemLogs() {
    const [logs, setLogs] = useState([]);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const loadData = () => {
        setLoading(true);
        Promise.all([
            adminService.getSystemLogs({ limit: 100 }),
            adminService.getSystemHealth(),
        ]).then(([logsData, healthData]) => {
            setLogs(Array.isArray(logsData) ? logsData : []);
            setHealth(healthData);
        }).catch(err => {
            console.error('Failed to load system data:', err);
        }).finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    const filtered = outcomeFilter === 'all' ? logs : logs.filter(l => (l.outcome || 'success').toLowerCase() === outcomeFilter);

    return (
        <div className="space-y-6 sm:space-y-10 text-white animate-in fade-in duration-500 overflow-hidden pb-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">System Console</h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1">Infrastructure Health & Telemetry</p>
                </div>
                <button 
                    onClick={loadData} 
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Telemetry
                </button>
            </div>

            {/* System Health Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
                <HealthCard label="API Engine" status="ok" />
                <HealthCard label="Redis Stream" status={health?.services?.redis} icon={Layers} />
                <HealthCard label="PostgreSQL" status={health?.services?.database} icon={Cpu} />
                <HealthCard label="Worker Pool" status={health?.services?.workers} icon={Box} />
            </div>

            {/* Console View */}
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px] p-4 sm:p-8 relative overflow-hidden flex flex-col min-h-[500px]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[50px] -mr-32 -mt-32 pointer-events-none" />
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 pb-6 border-b border-white/5 relative z-10">
                    <div className="flex items-center gap-4 scroll-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                        <Filter size={14} className="text-slate-500 shrink-0" />
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            {['all', 'success', 'failure'].map(s => (
                                <button
                                    key={s} 
                                    onClick={() => setOutcomeFilter(s)}
                                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${outcomeFilter === s
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                            : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                                        }`}
                                >{s}</button>
                            ))}
                        </div>
                    </div>
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500 bg-white/5 px-2 py-1 rounded-md">Event Stream: {filtered.length} entries</span>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-2 font-mono scrollbar-thin scrollbar-thumb-white/10 pr-2">
                    {loading && filtered.length === 0 ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-white/5 border border-white/5 rounded-xl animate-pulse" />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                                <ScrollText size={24} className="text-slate-700" />
                            </div>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs">No matching system flags</p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map((log, i) => {
                                const outcome = (log.outcome || 'success').toLowerCase();
                                const style = OUTCOME_STYLES[outcome] || OUTCOME_STYLES.success;
                                const ActorIcon = ACTOR_ICONS[log.actor_type] || Activity;
                                return (
                                    <motion.div
                                        key={log.id || i} 
                                        initial={{ opacity: 0, x: -5 }} 
                                        animate={{ opacity: 1, x: 0 }} 
                                        transition={{ delay: i * 0.01 }}
                                        className={`flex items-start gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-[10px] sm:text-xs group hover:bg-white/[0.02] transition-colors ${style}`}
                                    >
                                        <div className="mt-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <ActorIcon size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                                            <span className="font-black uppercase tracking-tighter shrink-0 opacity-50">[{log.actor_type || 'SYS'}]</span>
                                            <div className="flex flex-wrap items-center gap-2 text-slate-200/90 leading-relaxed font-bold">
                                                <span className="text-indigo-400 uppercase tracking-widest text-[9px]">{log.action || 'EVENT'}</span>
                                                <span className="text-slate-500">→</span>
                                                <span>{log.resource_type || 'System'}</span>
                                                {log.resource_id && <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5 font-mono opacity-60 truncate max-w-[100px]">{log.resource_id}</span>}
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-1">
                                            <span className="text-slate-500 text-[8px] sm:text-[9px] font-black group-hover:text-slate-400 tracking-tighter">
                                                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'LIVE'}
                                            </span>
                                            <span className={`text-[7px] font-black uppercase tracking-[0.2em] ${outcome === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>{outcome === 'success' ? 'OK' : 'FAIL'}</span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
