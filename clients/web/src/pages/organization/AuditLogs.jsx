import React, { useState, useEffect } from 'react';
import { organizationService, auditLogService } from '../../services/api';
import { Activity, Clock, User as UserIcon, Shield, Info, ArrowLeft, X } from 'lucide-react';

export default function AuditLogs({ orgId, onBack }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [orgId]);

    const fetchLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await auditLogService.list(orgId);
            setLogs(data.map(log => ({
                id: log.id,
                action: log.action,
                actor: log.actor_name || 'System',
                resource: log.resource_type === 'organization' ? 'Organization' : (log.payload?.name || log.resource_id),
                timestamp: log.timestamp
            })));
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to fetch audit logs');
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action) => {
        if (action.includes('create')) return <Activity size={14} className="text-emerald-400" />;
        if (action.includes('member')) return <UserIcon size={14} className="text-indigo-400" />;
        if (action.includes('plan')) return <Shield size={14} className="text-amber-400" />;
        return <Info size={14} className="text-slate-400" />;
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                        <X size={20} />
                    </button>
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">Audit Logs</h2>
                        <p className="text-slate-400 mt-1">Traceability and security events for your organization</p>
                    </div>
                </div>
                <button
                    onClick={fetchLogs}
                    className="p-2.5 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl text-slate-300 border border-slate-700/50"
                >
                    Refresh
                </button>
            </header>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-bold">
                    <Info className="w-5 h-5 shrink-0" /> {error}
                    <button onClick={() => setError('')} className="ml-auto text-slate-500 hover:text-white"><X size={14} /></button>
                </div>
            )}

            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 overflow-hidden shadow-2xl">
                <table className="w-full text-left font-medium">
                    <thead className="bg-slate-800/30 border-b border-slate-800/50">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Event</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Actor</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Description</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {loading ? (
                            [1, 2, 3, 4].map(i => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-24"></div></td>
                                    <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-32"></div></td>
                                    <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-48"></div></td>
                                    <td className="px-6 py-5 text-right"><div className="h-4 bg-slate-800 rounded w-16 ml-auto"></div></td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center opacity-40">
                                        <Clock size={48} className="mb-4" />
                                        <p className="text-lg font-bold">No logs yet</p>
                                        <p className="text-sm">Activity events will appear here as they happen.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2.5">
                                            {getActionIcon(log.action)}
                                            <span className="font-bold uppercase tracking-wider text-xs">{log.action.replace(/_/g, ' ')}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2 text-slate-300">
                                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] uppercase font-black">
                                                {log.actor.substring(0, 1)}
                                            </div>
                                            <span className="text-sm">{log.actor}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-sm text-slate-400 italic">Target: </span>
                                        <span className="text-sm font-bold text-slate-200">{log.resource}</span>
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono text-xs text-slate-500">
                                        {new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
