import React, { useState, useEffect } from 'react';
import { organizationService } from '../../services/api';
import { Building2, Users, Shield, History, Settings, Plus, Trash2, LayoutGrid, UserPlus, RefreshCw, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrganizationStore } from '../../store/organizationStore';
import toast from 'react-hot-toast';

import OrgOverview from './OrgOverview';
import MemberManagement from './MemberManagement';
import AuditLogs from './AuditLogs';
import Roles from './Roles';
import OrgSettings from './OrgSettings';

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'logs', label: 'Audit Logs', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
];

function InviteMemberModal({ orgId, onClose, onInvited }) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('member');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim()) { toast.error('Email is required'); return; }
        setSaving(true);
        try {
            // We create an invite via the room invitation system tied to the org
            // If org-level invite API exists, use it:
            await organizationService.inviteMember(orgId, role);
            toast.success(`Invitation sent to ${email}`);
            onInvited?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to send invite');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-slate-900 border border-white/10 rounded-[40px] p-10 w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-2xl font-black tracking-tight mb-8">Invite Member</h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Email Address</label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="member@company.com"
                                className="w-full pl-11 pr-4 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Role</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['admin', 'manager', 'member', 'viewer'].map(r => (
                                <button key={r} type="button" onClick={() => setRole(r)}
                                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${role === r ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                >{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="submit" disabled={saving}
                            className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            {saving ? 'Sending...' : 'Send Invite'}
                        </button>
                        <button type="button" onClick={onClose}
                            className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
                        >Cancel</button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

export default function Organizations() {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgSlug, setNewOrgSlug] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [showInvite, setShowInvite] = useState(false);
    const { setCurrentOrg } = useOrganizationStore();

    const fetchOrgs = async () => {
        setError('');
        setLoading(true);
        try {
            const data = await organizationService.list();
            const list = data || [];
            setOrgs(list);
            if (!selectedOrg && list.length > 0) setSelectedOrg(list[0]);
        } catch {
            setError('Failed to fetch organizations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrgs(); }, []);

    const handleCreateOrg = async (e) => {
        e.preventDefault();
        const name = newOrgName.trim();
        const slug = newOrgSlug.trim();
        if (!name || !slug) { setError('Name and slug are required'); return; }
        setCreating(true); setError('');
        try {
            const org = await organizationService.create({ name, slug });
            setNewOrgName(''); setNewOrgSlug('');
            await fetchOrgs();
            setSelectedOrg(org);
            setCurrentOrg(org);
            toast.success('Workspace created!');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create organization');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteOrg = async (id) => {
        if (!window.confirm('Delete this workspace? This is irreversible.')) return;
        try {
            await organizationService.delete(id);
            toast.success('Workspace deleted');
            const remaining = orgs.filter(o => o.id !== id);
            setOrgs(remaining);
            setSelectedOrg(remaining[0] || null);
        } catch {
            toast.error('Failed to delete workspace');
        }
    };

    const handleOrgUpdated = (updated) => {
        setOrgs(p => p.map(o => o.id === updated.id ? { ...o, ...updated } : o));
        setSelectedOrg(prev => ({ ...prev, ...updated }));
    };

    const handleOrgDeleted = () => {
        const remaining = orgs.filter(o => o.id !== selectedOrg?.id);
        setOrgs(remaining);
        setSelectedOrg(remaining[0] || null);
    };

    return (
        <div className="space-y-8 text-white pb-20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                    <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-white to-slate-500 bg-clip-text text-transparent">Organization</h1>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mt-2">Manage your workspace, members and settings</p>
                </div>
            </header>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-bold">
                    <span>⚠</span> {error}
                    <button onClick={() => setError('')} className="ml-auto text-slate-500 hover:text-white">×</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                {/* Sidebar — Org List + Create */}
                <div className="space-y-4">
                    {/* Org List */}
                    {loading ? (
                        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-white/[0.02] border border-white/5 rounded-[28px] animate-pulse" />)}</div>
                    ) : (
                        <div className="space-y-2">
                            {orgs.map(org => (
                                <div
                                    key={org.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => { setSelectedOrg(org); setCurrentOrg(org); setActiveTab('overview'); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { setSelectedOrg(org); setCurrentOrg(org); setActiveTab('overview'); } }}
                                    className={`w-full text-left p-4 rounded-[28px] border transition-all group cursor-pointer ${selectedOrg?.id === org.id
                                            ? 'bg-indigo-500/10 border-indigo-500/30'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                            <Building2 size={18} className="text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-sm truncate">{org.name}</p>
                                            <p className="text-slate-500 text-xs">/{org.slug}</p>
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleDeleteOrg(org.id); }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-all"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Create Workspace Form */}
                    <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[28px] p-5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Plus size={12} /> New Workspace
                        </p>
                        <form onSubmit={handleCreateOrg} className="space-y-3">
                            <input
                                value={newOrgName}
                                onChange={e => { setNewOrgName(e.target.value); if (!newOrgSlug) setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }}
                                placeholder="Name"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-slate-600"
                            />
                            <input
                                value={newOrgSlug}
                                onChange={e => setNewOrgSlug(e.target.value)}
                                placeholder="slug"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-slate-600"
                            />
                            <button disabled={creating}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {creating ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Main Panel */}
                <div className="lg:col-span-3 space-y-6">
                    {!selectedOrg ? (
                        <div className="py-24 text-center bg-white/[0.02] border border-white/5 rounded-[40px]">
                            <Building2 size={48} className="text-slate-700 mx-auto mb-4" />
                            <p className="text-slate-400 font-bold">Select or create a workspace to get started</p>
                        </div>
                    ) : (
                        <>
                            {/* Tab Bar */}
                            <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl w-fit">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.id} onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === tab.id
                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                            }`}
                                    >
                                        <tab.icon size={14} /> {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab + selectedOrg.id}
                                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {activeTab === 'overview' && (
                                        <OrgOverview
                                            org={selectedOrg}
                                            onInvite={() => setShowInvite(true)}
                                        />
                                    )}
                                    {activeTab === 'members' && (
                                        <MemberManagement
                                            orgId={selectedOrg.id}
                                            onBack={() => setActiveTab('overview')}
                                        />
                                    )}
                                    {activeTab === 'roles' && (
                                        <Roles orgId={selectedOrg.id} />
                                    )}
                                    {activeTab === 'logs' && (
                                        <AuditLogs
                                            orgId={selectedOrg.id}
                                            onBack={() => setActiveTab('overview')}
                                        />
                                    )}
                                    {activeTab === 'settings' && (
                                        <OrgSettings
                                            org={selectedOrg}
                                            onUpdated={handleOrgUpdated}
                                            onDeleted={handleOrgDeleted}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showInvite && (
                    <InviteMemberModal
                        orgId={selectedOrg?.id}
                        onClose={() => setShowInvite(false)}
                        onInvited={() => { }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
