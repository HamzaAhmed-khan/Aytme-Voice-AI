import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import { Cpu, Play, Square, RefreshCw, Activity, Clock, Zap, AlertCircle, Server, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const STATUS_STYLE = {
    running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    idle: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    stopped: 'bg-red-500/10 text-red-400 border-red-500/20',
    error: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function AdminWorkers() {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adminService.listWorkers();
            setWorkers(Array.isArray(data) ? data : []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [load]);

    const doAction = async (workerId, action) => {
        setActionLoading(p => ({ ...p, [workerId + action]: true }));
        try {
            await adminService[action](workerId);
            toast.success(`Worker action initiated`);
            load();
        } catch {
            toast.error(`Worker action failed`);
        } finally {
            setActionLoading(p => ({ ...p, [workerId + action]: false }));
        }
    };

    const metricCards = [
        { label: 'Total Workers', value: workers.length, icon: Server, color: 'text-indigo-400' },
        { label: 'Running', value: workers.filter(w => w.status === 'running').length, icon: Activity, color: 'text-emerald-400' },
        { label: 'Idle', value: workers.filter(w => w.status === 'idle').length, icon: Clock, color: 'text-slate-400' },
        { label: 'Error', value: workers.filter(w => w.status === 'error').length, icon: AlertCircle, color: 'text-rose-400' },
    ];

    return (
        <div className="space-y-6 sm:space-y-10 text-white animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Worker Cluster</h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1">Real-time Media Orchestration</p>
                </div>
                <button onClick={load} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                {metricCards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 flex items-center gap-4 group hover:border-white/10 transition-all">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                            <Icon size={18} className={color} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
                            <p className="text-lg sm:text-2xl font-black truncate">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Workers Table/List */}
            {loading && workers.length === 0 ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 border border-white/5 rounded-[24px] sm:rounded-[32px] animate-pulse" />)}
                </div>
            ) : workers.length === 0 ? (
                <div className="py-20 sm:py-32 text-center bg-slate-900/40 border border-white/5 rounded-[32px] sm:rounded-[48px] backdrop-blur-3xl">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5 transition-transform hover:scale-110">
                        <Server size={32} className="text-slate-700" />
                    </div>
                    <p className="text-slate-200 font-black uppercase tracking-widest text-xs sm:text-sm">No Active Clusters</p>
                    <p className="text-slate-500 text-[10px] sm:text-xs mt-2 font-bold uppercase tracking-tighter">Workers appear here when the media service connects</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {workers.map((w, i) => (
                        <motion.div
                            key={w.id || i} 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ delay: i * 0.05 }}
                            className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 hover:border-white/10 rounded-[28px] sm:rounded-[40px] p-5 sm:p-8 transition-all group overflow-hidden relative"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full -mr-16 -mt-16 pointer-events-none" />
                            
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-8">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-12 h-12 bg-slate-950 rounded-[20px] flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform">
                                        <Cpu size={22} className="text-indigo-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-black text-sm sm:text-base truncate break-all max-w-[150px] sm:max-w-none">{w.id || w.worker_id || 'Media-Node-01'}</p>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${STATUS_STYLE[w.status] || STATUS_STYLE.idle}`}>
                                                {w.status || 'offline'}
                                            </span>
                                        </div>
                                        <p className="text-slate-500 text-[10px] sm:text-xs mt-1 font-bold uppercase tracking-widest truncate">
                                            ROOM: {w.current_room_id ? <span className="text-indigo-400 font-mono tracking-tighter">{w.current_room_id}</span> : 'IDLE'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 sm:gap-8 w-full sm:w-auto">
                                    <div className="flex-1 sm:flex-none flex items-center gap-6 sm:gap-10">
                                        {w.latency_ms != null && (
                                            <div className="shrink-0">
                                                <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-widest font-black mb-1">Latency</p>
                                                <p className="font-black text-emerald-400 text-xs sm:text-sm">{w.latency_ms}ms</p>
                                            </div>
                                        )}
                                        {w.cpu_usage != null && (
                                            <div className="shrink-0">
                                                <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-widest font-black mb-1">CPU</p>
                                                <div className="flex items-center gap-3">
                                                    <p className="font-black text-xs sm:text-sm">{w.cpu_usage}%</p>
                                                    <div className="hidden sm:block w-16 h-1.5 bg-slate-950 rounded-full border border-white/5 p-0.5 shrink-0">
                                                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${w.cpu_usage}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto shrink-0 transition-opacity">
                                        <button 
                                            onClick={() => doAction(w.id, 'startWorker')} 
                                            disabled={actionLoading[w.id + 'startWorker'] || w.status === 'running'}
                                            className="flex-1 sm:flex-none flex items-center justify-center p-3 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl sm:rounded-2xl transition-all border border-white/5 disabled:opacity-30 active:scale-95 group/btn"
                                            title="Start"
                                        >
                                            {actionLoading[w.id + 'startWorker'] ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />}
                                        </button>
                                        <button 
                                            onClick={() => doAction(w.id, 'stopWorker')} 
                                            disabled={actionLoading[w.id + 'stopWorker'] || w.status === 'stopped'}
                                            className="flex-1 sm:flex-none flex items-center justify-center p-3 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 rounded-xl sm:rounded-2xl transition-all border border-white/5 disabled:opacity-30 active:scale-95"
                                            title="Stop"
                                        >
                                            {actionLoading[w.id + 'stopWorker'] ? <RefreshCw size={14} className="animate-spin" /> : <Square size={14} className="fill-current" />}
                                        </button>
                                        <button 
                                            onClick={() => doAction(w.id, 'restartWorker')} 
                                            disabled={actionLoading[w.id + 'restartWorker']}
                                            className="flex-1 sm:flex-none flex items-center justify-center p-3 bg-white/5 hover:bg-amber-500/10 hover:text-amber-400 rounded-xl sm:rounded-2xl transition-all border border-white/5 disabled:opacity-30 active:scale-95"
                                            title="Restart"
                                        >
                                            {actionLoading[w.id + 'restartWorker'] ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
