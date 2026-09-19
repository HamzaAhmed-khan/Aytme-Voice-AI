import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { BarChart2, TrendingUp, Users, Building2, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { motion } from 'framer-motion';

function StatCard({ icon: Icon, label, value, sub, color = 'indigo', trend }) {
    const colorMap = {
        indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return (
        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 group hover:border-white/10 transition-all overflow-hidden relative">
            <div className="flex items-center gap-4 relative z-10">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-110 ${colorMap[color]}`}>
                    <Icon size={22} />
                </div>
                <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-xl sm:text-2xl font-black truncate">{value ?? '—'}</p>
                        {trend && (
                            <span className={`flex items-center text-[9px] font-bold ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                {Math.abs(trend)}%
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {sub && <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase tracking-widest">{sub}</p>}
        </div>
    );
}

export default function AdminUsage() {
    const [orgs, setOrgs] = useState([]);
    const [revenue, setRevenue] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            adminService.listOrganizations().catch(() => []),
            adminService.getRevenue().catch(() => null),
        ]).then(([orgsData, rev]) => {
            setOrgs(Array.isArray(orgsData) ? orgsData : []);
            setRevenue(rev);
        }).finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, []);

    const chartData = orgs
        .sort((a, b) => (b.minutes_used || 0) - (a.minutes_used || 0))
        .slice(0, 8)
        .map(o => ({
            name: o.name?.slice(0, 10) || 'Org',
            minutes: o.minutes_used || 0,
        }));

    return (
        <div className="space-y-6 sm:space-y-10 text-white animate-in fade-in duration-500 pb-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Usage Analytics</h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1">Global Consumption & Intelligence</p>
                </div>
                <button 
                    onClick={loadData} 
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Stream
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                <StatCard icon={Building2} label="Organizations" value={orgs.length} color="indigo" trend={12} />
                <StatCard icon={Users} label="Total Users" value={orgs.reduce((s, o) => s + (o.member_count || 0), 0)} color="indigo" />
                <StatCard icon={Activity} label="AI Minutes" value={orgs.reduce((s, o) => s + (o.minutes_used || 0), 0).toLocaleString()} color="emerald" trend={24} />
                <StatCard icon={DollarSign} label="MRR" value={revenue?.mrr ? `$${revenue.mrr.toLocaleString()}` : '$0'} color="amber" sub="Real-time Revenue" />
            </div>

            {/* Per-Org Usage Chart */}
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 relative overflow-hidden group hover:border-white/10 transition-all">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[60px] -mr-32 -mt-32 pointer-events-none" />
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-slate-400">
                    <BarChart2 size={16} className="text-indigo-400" /> Top Consumption Nodes
                </h3>
                <div className="h-[250px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="6 6" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: 900, textAnchor: 'middle' }}
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#475569', fontSize: 9, fontWeight: 900 }}
                            />
                            <Tooltip 
                                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                contentStyle={{ 
                                    background: '#020617', 
                                    border: '1px solid rgba(255,255,255,0.1)', 
                                    borderRadius: 16, 
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', 
                                    padding: '12px 16px' 
                                }} 
                                itemStyle={{ color: '#818cf8', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}
                                labelStyle={{ color: '#64748b', fontWeight: 900, fontSize: 9, textTransform: 'uppercase', marginBottom: 4 }}
                            />
                            <Bar dataKey="minutes" radius={[6, 6, 0, 0]} barSize={32}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? '#818cf8' : '#312e81'} fillOpacity={0.8} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Per-Org Table */}
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px] overflow-hidden">
                <div className="px-6 sm:px-8 py-5 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-slate-400">Node Performance Breakdown</h3>
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500 bg-white/5 px-2 py-1 rounded-md">Total Count: {orgs.length}</span>
                </div>
                <div className="overflow-x-auto h-full scrollbar-thin scrollbar-thumb-white/10">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                <th className="px-6 py-4">Organization</th>
                                <th className="px-6 py-4 hidden sm:table-cell text-center">Plan</th>
                                <th className="px-6 py-4 hidden md:table-cell text-center">Population</th>
                                <th className="px-6 py-4 text-center">Consumption</th>
                                <th className="px-6 py-4 text-right">State</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs sm:text-sm">
                            {loading && orgs.length === 0 ? (
                                [1, 2, 3].map(i => <tr key={i}><td colSpan={5} className="px-6 py-12"><div className="h-4 bg-white/5 rounded animate-pulse w-full"/></td></tr>)
                            ) : orgs.map((o, i) => (
                                <tr key={o.id || i} className="hover:bg-white/[0.02] group transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-black group-hover:text-indigo-400 transition-colors truncate max-w-[120px] sm:max-w-none">{o.name}</p>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">Global Node</p>
                                    </td>
                                    <td className="px-6 py-4 hidden sm:table-cell text-center">
                                        <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-tighter">{o.plan_name || 'Free'}</span>
                                    </td>
                                    <td className="px-6 py-4 hidden md:table-cell text-center font-bold text-slate-400">{o.member_count ?? '0'}</td>
                                    <td className="px-6 py-4 text-center">
                                        <p className="font-black text-indigo-400">{(o.minutes_used || 0).toLocaleString()} <span className="text-[10px] text-slate-500 ml-1">min</span></p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${o.is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'bg-slate-500/10 text-slate-500 border border-white/5'}`}>
                                            {o.is_active !== false ? 'Healthy' : 'Shutdown'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
