import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import {
    LayoutDashboard, Building2, Users, Cpu, BarChart2, CreditCard, ScrollText, Flag,
    TrendingUp, Activity, AlertCircle, RefreshCw, Plus, Trash2, Shield,
    Search, MoreVertical, Ban, Key, ChevronRight, Menu, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import AdminWorkers from './AdminWorkers';
import AdminUsage from './AdminUsage';
import AdminSystemLogs from './AdminSystemLogs';
import AdminBillingAdmin from './AdminBillingAdmin';
import AdminFeatureFlags from './AdminFeatureFlags';

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'orgs', label: 'Organizations', icon: Building2 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'workers', label: 'Workers', icon: Cpu },
    { id: 'usage', label: 'Usage', icon: BarChart2 },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'logs', label: 'System Logs', icon: ScrollText },
    { id: 'flags', label: 'Feature Flags', icon: Flag },
];

function OverviewTab({ orgs, users }) {
    const cards = [
        { label: 'Total Organizations', value: orgs.length, icon: Building2, color: 'text-indigo-400' },
        { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-400' },
        { label: 'AI Minutes (All Time)', value: orgs.reduce((s, o) => s + (o.minutes_used || 0), 0).toLocaleString(), icon: Activity, color: 'text-emerald-400' },
        { label: 'Active Meetings', value: '—', icon: TrendingUp, color: 'text-amber-400' },
    ];

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {cards.map(({ label, value, icon: Icon, color }) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={label} 
                        className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 flex items-center gap-4 group hover:border-white/10 transition-all"
                    >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Icon size={18} className={color} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
                            <p className="text-xl sm:text-2xl font-black truncate">{value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
            
            <div className="p-6 sm:p-8 bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px]">
                <h3 className="font-black uppercase tracking-widest text-xs sm:text-sm mb-6 text-slate-400 flex items-center gap-2">
                    <Shield size={16} className="text-indigo-400" /> System Health
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {['LiveKit', 'OpenAI', 'Redis', 'Workers'].map(s => (
                        <div key={s} className="bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl p-4 text-center group hover:bg-white/10 transition-all">
                            <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 truncate">{s}</p>
                            <span className="inline-flex px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">Online</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function OrgsTab({ orgs, onRefresh }) {
    const [search, setSearch] = useState('');
    const [disabling, setDisabling] = useState(null);

    const filtered = orgs.filter(o =>
        o.name?.toLowerCase().includes(search.toLowerCase()) || 
        o.slug?.toLowerCase().includes(search.toLowerCase())
    );

    const handleDisable = async (orgId) => {
        if (!window.confirm('Disable this organization?')) return;
        setDisabling(orgId);
        try {
            await adminService.disableOrganization(orgId);
            toast.success('Organization disabled');
            onRefresh();
        } catch { toast.error('Failed to disable'); }
        finally { setDisabling(null); }
    };

    const handleDelete = async (orgId) => {
        if (!window.confirm('Permanently delete this organization? ALL DATA WILL BE LOST.')) return;
        try {
            await adminService.deleteOrganization(orgId);
            toast.success('Deleted');
            onRefresh();
        } catch { toast.error('Failed to delete'); }
    };

    return (
        <div className="space-y-5">
            <div className="relative max-w-sm">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    placeholder="Search organizations..."
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-slate-600 transition-all"
                />
            </div>
            
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[40px] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                <th className="px-6 py-4">Organization</th>
                                <th className="px-6 py-4 hidden sm:table-cell">Plan</th>
                                <th className="px-6 py-4 hidden md:table-cell">AI Minutes</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs sm:text-sm">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">No organizations found</td>
                                </tr>
                            ) : filtered.map((o, i) => (
                                <tr key={o.id || i} className="hover:bg-white/[0.02] group transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="max-w-[200px] sm:max-w-none">
                                            <p className="font-bold truncate">{o.name}</p>
                                            <p className="text-slate-500 text-[10px] sm:text-xs truncate">/{o.slug}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 hidden sm:table-cell">
                                        <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-black uppercase">{o.plan_name || 'Free'}</span>
                                    </td>
                                    <td className="px-6 py-4 font-black text-indigo-400 hidden md:table-cell">{(o.minutes_used || 0).toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-tighter ${o.is_active !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border border-white/5'}`}>
                                            {o.is_active !== false ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                                            <button 
                                                onClick={() => handleDisable(o.id)} 
                                                disabled={disabling === o.id}
                                                className="p-2 sm:p-2.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-400 transition-all active:scale-95" 
                                                title="Disable"
                                            >
                                                {disabling === o.id ? <RefreshCw size={12} className="animate-spin" /> : <Ban size={12} />}
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(o.id)}
                                                className="p-2 sm:p-2.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl text-rose-400 transition-all active:scale-95" 
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
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

function UsersTab({ users, onRefresh }) {
    const [search, setSearch] = useState('');
    const [suspending, setSuspending] = useState(null);

    const filtered = users.filter(u =>
        (u.full_name || u.email || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleSuspend = async (userId) => {
        if (!window.confirm('Suspend this user?')) return;
        setSuspending(userId);
        try {
            await adminService.suspendUser(userId);
            toast.success('User suspended');
            onRefresh();
        } catch { toast.error('Failed to suspend user'); }
        finally { setSuspending(null); }
    };

    const handleDelete = async (userId) => {
        if (!window.confirm('Permanently delete this user?')) return;
        try {
            await adminService.deleteUser(userId);
            toast.success('User deleted');
            onRefresh();
        } catch { toast.error('Failed to delete user'); }
    };

    const handleResetPassword = async (userId) => {
        const newPass = window.prompt('Enter new password:');
        if (!newPass) return;
        try {
            await adminService.resetUserPassword(userId, newPass);
            toast.success('Password reset');
        } catch { toast.error('Failed to reset password'); }
    };

    return (
        <div className="space-y-5">
            <div className="relative max-w-sm">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    placeholder="Search users..."
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-slate-600 transition-all"
                />
            </div>
            
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[40px] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4 hidden sm:table-cell">Role</th>
                                <th className="px-6 py-4 hidden md:table-cell">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs sm:text-sm">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">No users found</td>
                                </tr>
                            ) : filtered.map((u, i) => (
                                <tr key={u.id || i} className="hover:bg-white/[0.02] group transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white font-black text-xs shrink-0 shadow-lg">
                                                {(u.full_name || u.email || 'U').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold truncate">{u.full_name || 'User'}</p>
                                                <p className="text-slate-500 text-[10px] sm:text-xs truncate">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 hidden sm:table-cell">
                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-tighter ${u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-white/5 text-slate-500 border border-white/5'}`}>
                                            {u.role || 'user'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 hidden md:table-cell text-xs">
                                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                                            <button onClick={() => handleResetPassword(u.id)}
                                                className="p-2 sm:p-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl text-indigo-400 transition-all active:scale-95" title="Reset password">
                                                <Key size={12} />
                                            </button>
                                            <button onClick={() => handleSuspend(u.id)} disabled={suspending === u.id}
                                                className="p-2 sm:p-2.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-400 transition-all active:scale-95" title="Suspend">
                                                {suspending === u.id ? <RefreshCw size={12} className="animate-spin" /> : <Ban size={12} />}
                                            </button>
                                            <button onClick={() => handleDelete(u.id)}
                                                className="p-2 sm:p-2.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl text-rose-400 transition-all active:scale-95" title="Delete">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
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

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('overview');
    const [orgs, setOrgs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [o, u] = await Promise.all([
                adminService.listOrganizations().catch(() => []),
                adminService.listUsers().catch(() => []),
            ]);
            setOrgs(Array.isArray(o) ? o : []);
            setUsers(Array.isArray(u) ? u : []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const activeTabLabel = TABS.find(t => t.id === activeTab)?.label || 'Menu';

    return (
        <div className="space-y-6 sm:space-y-10 text-white pb-24 p-4 sm:p-0">
            {/* Header */}
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl sm:text-5xl font-black tracking-tighter bg-gradient-to-r from-white to-slate-500 bg-clip-text text-transparent">Admin Panel</h1>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1 sm:mt-2">Platform Control Center</p>
                </div>
                <button 
                    onClick={loadAll}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                >
                    <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''} text-indigo-400`} /> Refresh System
                </button>
            </header>

            {/* Mobile Tab Selector */}
            <div className="lg:hidden relative">
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="w-full flex items-center justify-between p-4 bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
                >
                    <div className="flex items-center gap-3 text-indigo-400">
                        {TABS.find(t => t.id === activeTab)?.icon && React.createElement(TABS.find(t => t.id === activeTab).icon, { size: 16 })}
                        <span className="text-white">{activeTabLabel}</span>
                    </div>
                    {isMenuOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
                
                <AnimatePresence>
                    {isMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-3xl"
                        >
                            <div className="p-2 space-y-1">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { setActiveTab(tab.id); setIsMenuOpen(false); }}
                                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5'
                                        }`}
                                    >
                                        <tab.icon size={16} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden lg:flex flex-wrap gap-2 p-1.5 bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] shadow-2xl">
                {TABS.map(tab => (
                    <button
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2.5 px-6 py-3.5 rounded-[18px] font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${
                            activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20 scale-105'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="min-h-[400px]"
                >
                    {activeTab === 'overview' && <OverviewTab orgs={orgs} users={users} />}
                    {activeTab === 'orgs' && <OrgsTab orgs={orgs} onRefresh={loadAll} />}
                    {activeTab === 'users' && <UsersTab users={users} onRefresh={loadAll} />}
                    {activeTab === 'workers' && <AdminWorkers />}
                    {activeTab === 'usage' && <AdminUsage />}
                    {activeTab === 'billing' && <AdminBillingAdmin />}
                    {activeTab === 'logs' && <AdminSystemLogs />}
                    {activeTab === 'flags' && <AdminFeatureFlags />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
