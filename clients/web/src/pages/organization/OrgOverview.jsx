import React, { useState, useEffect } from 'react';
import { organizationService } from '../../services/api';
import { useOrganizationStore } from '../../store/organizationStore';
import { Building2, Users, Video, Clock, Zap, TrendingUp, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

function StatCard({ icon: Icon, label, value, color = 'indigo' }) {
    const colors = {
        indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return (
        <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-7 flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${colors[color]}`}>
                <Icon size={22} />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-2xl font-black tracking-tighter">{value ?? '—'}</p>
            </div>
        </div>
    );
}

export default function OrgOverview({ org, onInvite }) {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const subscription = useOrganizationStore(s => s.subscription);

    useEffect(() => {
        if (!org?.id) return;
        setLoading(true);
        organizationService.listMembers(org.id)
            .then(data => setMembers(data || []))
            .catch(() => setMembers([]))
            .finally(() => setLoading(false));
    }, [org?.id]);

    if (!org) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <Building2 size={48} className="text-slate-700 mb-4" />
                <p className="text-slate-400 font-bold">No organization selected</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 text-white">
            {/* Org identity */}
            <div className="flex items-center gap-6 p-8 bg-white/[0.02] border border-white/5 rounded-[40px]">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[28px] flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                    <Building2 size={36} className="text-white" />
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-tight">{org.name}</h2>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            {subscription?.plan_name || org.plan || 'Free'} Plan
                        </span>
                        <span className="text-slate-500 text-xs font-medium">/{org.slug}</span>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard icon={Users} label="Members" value={members.length} color="indigo" />
                <StatCard icon={Zap} label="Plan" value={subscription?.plan_name || 'Free'} color="amber" />
                <StatCard icon={TrendingUp} label="Minutes Used" value={subscription?.minutes_used?.toLocaleString() || 0} color="emerald" />
                <StatCard icon={Clock} label="Joined" value={org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'} color="rose" />
            </div>

            {/* Members Preview */}
            <div className="bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden">
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
                    <h3 className="text-lg font-black uppercase tracking-tight">Team Members</h3>
                    <button
                        onClick={onInvite}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                    >
                        <UserPlus size={14} /> Invite
                    </button>
                </div>
                {loading ? (
                    <div className="divide-y divide-white/5">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="px-8 py-5 flex items-center gap-4">
                                <div className="w-10 h-10 bg-white/5 rounded-full animate-pulse" />
                                <div className="space-y-2">
                                    <div className="w-32 h-3 bg-white/5 rounded animate-pulse" />
                                    <div className="w-48 h-2 bg-white/5 rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : members.length === 0 ? (
                    <div className="py-16 text-center">
                        <Users size={32} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 font-bold text-sm">No members yet</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {members.slice(0, 5).map((m, i) => (
                            <motion.div
                                key={m.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                                className="px-8 py-5 flex items-center gap-4"
                            >
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0">
                                    {(m.full_name || m.email || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{m.full_name || m.email?.split('@')[0] || 'Unknown User'}</p>
                                    <p className="text-slate-500 text-xs truncate">{m.email}</p>
                                </div>
                                <span className="px-3 py-1 bg-white/5 border border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full shrink-0">
                                    {m.role || 'member'}
                                </span>
                            </motion.div>
                        ))}
                        {members.length > 5 && (
                            <div className="px-8 py-4 text-center text-slate-500 text-xs font-bold">
                                +{members.length - 5} more members
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
