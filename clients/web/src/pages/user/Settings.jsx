import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { apiTokenService } from '../../services/api';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
    User as UserIcon, Shield, Key, Lock, Mail, RefreshCw,
    Fingerprint, CheckCircle2, Copy, X, Trash2,
    Download, AlertTriangle, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'api-tokens', name: 'Access Tokens', icon: Key },
    { id: 'privacy', name: 'Privacy', icon: Lock },
];

export default function Settings() {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('profile');

    return (
        <div className="space-y-8 max-w-4xl">
            <header>
                <h1 className="text-4xl font-black tracking-tight">Settings</h1>
                <p className="text-slate-400 mt-1">Manage your account and security preferences</p>
            </header>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all
                            ${activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}
                        `}
                    >
                        <tab.icon size={16} />
                        {tab.name}
                    </button>
                ))}
            </div>

            <main className="bg-slate-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl min-h-[400px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'profile' && <ProfileSection user={user} />}
                        {activeTab === 'security' && <SecuritySection />}
                        {activeTab === 'api-tokens' && <ApiTokensSection />}
                        {activeTab === 'privacy' && <PrivacySection />}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}

function ProfileSection({ user }) {
    const [name, setName] = useState(user?.full_name || '');
    const [saving, setSaving] = useState(false);
    const validateSession = useAuthStore(state => state.validateSession);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/users/me', { full_name: name });
            await validateSession();
            toast.success('Profile updated successfully!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Full Name</label>
                    <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all font-bold"
                        />
                    </div>
                </div>
                <div className="space-y-4">
                    <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            value={user?.email || ''}
                            disabled
                            className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl opacity-50 cursor-not-allowed font-bold"
                        />
                    </div>
                </div>
            </div>
            <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:opacity-60"
            >
                {saving && <RefreshCw size={16} className="animate-spin" />}
                Save Changes
            </button>
        </div>
    );
}

function SecuritySection() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <Lock size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold">Change Password</h3>
                        <p className="text-sm text-slate-400">Update your account password regularly</p>
                    </div>
                </div>
                <button className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold transition-all">
                    Update
                </button>
            </div>

            <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                        <Fingerprint size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold">Two-Factor Authentication</h3>
                        <p className="text-sm text-slate-400">Add an extra layer of security</p>
                    </div>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-black uppercase tracking-widest">Coming Soon</span>
            </div>
        </div>
    );
}

const AVAILABLE_SCOPES = ['room:read', 'room:write', 'admin:all'];

function ApiTokensSection() {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState(['room:read', 'room:write']);
    const [newTokenSecret, setNewTokenSecret] = useState(null);
    const [copied, setCopied] = useState(false);

    const loadTokens = async () => {
        setLoading(true);
        try {
            const data = await apiTokenService.list();
            setTokens(data || []);
        } catch {
            toast.error('Failed to load API tokens');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadTokens(); }, []);

    const handleCreate = async () => {
        if (!newTokenName.trim()) { toast.error('Token name is required'); return; }
        setCreating(true);
        try {
            const result = await apiTokenService.create(newTokenName.trim(), selectedScopes);
            setNewTokenSecret(result.token);
            setShowCreate(false);
            setNewTokenName('');
            loadTokens();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create token');
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (tokenId) => {
        if (!window.confirm('Revoke this token? It will stop working immediately.')) return;
        try {
            await apiTokenService.revoke(tokenId);
            toast.success('Token revoked');
            loadTokens();
        } catch {
            toast.error('Failed to revoke token');
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(newTokenSecret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleScope = (scope) => {
        setSelectedScopes(prev =>
            prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
                <h3 className="text-lg font-black italic tracking-tight">API Access Tokens</h3>
                <p className="text-slate-400 text-sm mt-1">
                    Create scoped tokens for server-to-server integrations. The secret is shown{' '}
                    <span className="text-amber-400 font-bold">only once</span>.
                </p>
            </div>

            {/* New token secret banner */}
            {newTokenSecret && (
                <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3">
                    <p className="text-amber-400 font-black text-sm uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={16} /> Token Created — Save it Now!
                    </p>
                    <div className="flex items-center gap-3">
                        <code className="flex-1 text-xs bg-black/40 rounded-xl px-4 py-3 font-mono break-all text-slate-300">{newTokenSecret}</code>
                        <button onClick={handleCopy} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all" title="Copy">
                            {copied ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                        <button onClick={() => setNewTokenSecret(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-500">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Create form */}
            {showCreate ? (
                <div className="p-6 border border-indigo-500/20 bg-indigo-500/5 rounded-2xl space-y-4">
                    <h4 className="font-black text-sm uppercase tracking-widest">New Access Token</h4>
                    <input
                        placeholder="Token name (e.g. my-backend-server)"
                        value={newTokenName}
                        onChange={e => setNewTokenName(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Scopes</p>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_SCOPES.map(scope => (
                                <button
                                    key={scope}
                                    type="button"
                                    onClick={() => toggleScope(scope)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${selectedScopes.includes(scope)
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
                                >
                                    {scope}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-60"
                        >
                            {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                            Create Token
                        </button>
                        <button onClick={() => setShowCreate(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-all">
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-6 py-3 border border-dashed border-white/10 hover:border-indigo-500/40 rounded-xl font-bold text-sm text-slate-400 hover:text-white transition-all"
                >
                    <Plus size={16} /> New API Token
                </button>
            )}

            {/* Token list */}
            {loading ? (
                <div className="flex items-center gap-3 text-slate-500 text-sm py-8 justify-center">
                    <RefreshCw size={16} className="animate-spin" /> Loading tokens…
                </div>
            ) : tokens.length === 0 ? (
                <div className="py-12 text-center text-slate-600">
                    <Key size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="font-bold text-sm">No API tokens yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tokens.map(token => (
                        <div key={token.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                            <div>
                                <p className="font-black text-sm">{token.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Scopes: <span className="text-indigo-400">{token.scopes?.join(', ')}</span>
                                    {' · '}Created {new Date(token.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                onClick={() => handleRevoke(token.id)}
                                className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                title="Revoke token"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function PrivacySection() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="space-y-4">
                <h3 className="text-lg font-black italic tracking-tight">Your Data</h3>
                <p className="text-slate-400 text-sm">Download your account data and transcript history as a single archive.</p>
                <button className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold transition-all">
                    <Download size={18} />
                    Export All Data
                </button>
            </div>

            <div className="pt-8 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-rose-400">
                    <AlertTriangle size={20} />
                    <h3 className="text-lg font-black italic tracking-tight uppercase">Danger Zone</h3>
                </div>
                <p className="text-slate-400 text-sm">Deleting your account is permanent. All transcripts and data will be wiped from our secure storage immediately.</p>
                <button className="flex items-center gap-2 px-6 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl font-bold transition-all">
                    <Trash2 size={18} />
                    Delete Account
                </button>
            </div>
        </div>
    );
}
