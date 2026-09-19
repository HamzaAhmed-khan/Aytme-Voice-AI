import React, { useState, useEffect } from 'react';
import { orgRolesService } from '../../services/api';
import { Shield, Check, X, Info, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const ROLE_COLORS = {
    owner:   { color: 'from-amber-500 to-orange-600',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-400' },
    admin:   { color: 'from-indigo-500 to-blue-600',    border: 'border-indigo-500/30',  bg: 'bg-indigo-500/10',  text: 'text-indigo-400' },
    manager: { color: 'from-emerald-500 to-teal-600',   border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    member:  { color: 'from-sky-500 to-cyan-600',       border: 'border-sky-500/30',     bg: 'bg-sky-500/10',     text: 'text-sky-400' },
    viewer:  { color: 'from-slate-400 to-slate-500',    border: 'border-slate-500/30',   bg: 'bg-slate-500/10',   text: 'text-slate-400' },
};

const PERMISSION_LABELS = {
    create_rooms: 'Create Rooms',
    manage_members: 'Manage Members',
    billing_access: 'Billing Access',
    start_ai_agent: 'Start AI Agent',
    view_transcripts: 'View Transcripts',
    join_rooms: 'Join Rooms',
    transfer_ownership: 'Transfer Ownership',
};

export default function Roles({ orgId }) {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            setLoading(true);
            try {
                const data = await orgRolesService.list(orgId);
                setRoles(Array.isArray(data) ? data : []);
            } catch {
                // Fallback: show nothing on error (endpoint may not be deployed yet)
                setRoles([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [orgId]);

    // All unique permission keys from the roles
    const allPermissions = roles.length > 0
        ? Object.keys(roles[0]?.permissions || {})
        : Object.keys(PERMISSION_LABELS);

    return (
        <div className="space-y-8 text-white">
            {/* Header */}
            <div>
                <h3 className="text-2xl font-black tracking-tight">Roles & Permissions</h3>
                <p className="text-slate-500 text-sm mt-1">
                    Understanding what each role can do in your organization
                </p>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-4 p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-[28px]">
                <Info size={20} className="text-indigo-400 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-indigo-300">Built-in Role System</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Roles are assigned when adding members. Go to the <strong>Members</strong> tab to change a member's role.
                        Each role has a fixed set of permissions shown below.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <RefreshCw size={24} className="animate-spin text-slate-500" />
                </div>
            ) : (
                <>
                    {/* Role Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roles.map((role, i) => {
                            const colors = ROLE_COLORS[role.slug] || ROLE_COLORS.member;
                            return (
                                <motion.div
                                    key={role.slug}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06 }}
                                    className={`p-6 bg-white/[0.02] border ${colors.border} rounded-[28px] transition-all hover:border-white/20`}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`w-10 h-10 bg-gradient-to-br ${colors.color} rounded-xl flex items-center justify-center`}>
                                            <Shield size={18} className="text-white" />
                                        </div>
                                        <div>
                                            <p className="font-black text-sm">{role.name}</p>
                                            <p className="text-[10px] font-mono text-slate-600">{role.slug}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">{role.description}</p>

                                    {/* Inline permission badges */}
                                    <div className="flex flex-wrap gap-1.5 mt-4">
                                        {Object.entries(role.permissions || {}).filter(([, v]) => v).map(([key]) => (
                                            <span
                                                key={key}
                                                className={`px-2 py-0.5 ${colors.bg} border ${colors.border} ${colors.text} text-[9px] font-black uppercase tracking-widest rounded-md`}
                                            >
                                                {PERMISSION_LABELS[key] || key}
                                            </span>
                                        ))}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Full Permission Matrix Table */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden">
                        <div className="px-8 py-5 border-b border-white/5">
                            <h4 className="font-black uppercase tracking-widest text-sm">Permission Matrix</h4>
                            <p className="text-slate-600 text-xs mt-1">Complete overview of role capabilities</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                        <th className="px-6 py-3">Permission</th>
                                        {roles.map(r => {
                                            const colors = ROLE_COLORS[r.slug] || ROLE_COLORS.member;
                                            return (
                                                <th key={r.slug} className="px-6 py-3 text-center">
                                                    <span className={colors.text}>{r.name}</span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-xs">
                                    {allPermissions.map(permKey => (
                                        <tr key={permKey} className="hover:bg-white/[0.02]">
                                            <td className="px-6 py-3 font-bold text-slate-300">
                                                {PERMISSION_LABELS[permKey] || permKey}
                                            </td>
                                            {roles.map(role => (
                                                <td key={role.slug} className="px-6 py-3 text-center">
                                                    {role.permissions?.[permKey]
                                                        ? <Check size={14} className="text-emerald-400 mx-auto" />
                                                        : <X size={14} className="text-slate-700 mx-auto" />
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
