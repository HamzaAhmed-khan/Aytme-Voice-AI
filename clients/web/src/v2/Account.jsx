import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiTokenService } from '../services/api';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
 User, Key, Eye, EyeOff, Copy, Trash2, Plus, Loader2,
 ShieldCheck, Edit2, CheckCircle2, X, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SCOPES = ['room:read', 'room:write', 'org:read', 'org:write', 'billing:read'];

// ── Profile Section ──────────────────────────────────────────────
function ProfileSection({ user }) {
 const [fullName, setFullName] = useState(user?.full_name || '');
 const [saving, setSaving] = useState(false);

 const handleSave = async (e) => {
 e.preventDefault();
 setSaving(true);
 try {
 await api.patch('/users/me', { full_name: fullName });
 toast.success('Profile updated');
 // Update auth store by re-fetching
 const res = await api.get('/users/me');
 useAuthStore.getState().setUser(res.data);
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to update profile');
 } finally {
 setSaving(false);
 }
 };

 return (
 <div className="v2-card p-6">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-10 h-10 bg-v2-accent/10 rounded-md flex items-center justify-center">
 <User size={20} className="text-v2-accent" />
 </div>
 <div>
 <h2 className="text-lg font-bold">Profile</h2>
 <p className="text-xs text-v2-muted">Your personal information</p>
 </div>
 </div>

 {/* Avatar */}
 <div className="flex items-center gap-4 mb-6 p-4 bg-v2-header rounded-md">
 <div className="w-16 h-16 rounded-md bg-v2-accent text-white flex items-center justify-center text-2xl font-semibold">
 {(user?.full_name || user?.email || '?').slice(0, 2).toUpperCase()}
 </div>
 <div>
 <p className="font-bold text-v2-text">{user?.full_name || 'Anonymous'}</p>
 <p className="text-sm text-v2-muted">{user?.email}</p>
 <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${
 user?.role === 'admin' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
 }`}>{user?.role}</span>
 </div>
 </div>

 <form onSubmit={handleSave} className="space-y-4">
 <div>
 <label className="v2-label">Full Name</label>
 <input className="v2-input" value={fullName}
 onChange={e => setFullName(e.target.value)}
 placeholder="Your full name" />
 </div>
 <div>
 <label className="v2-label">Email</label>
 <input className="v2-input bg-gray-50 text-v2-muted cursor-not-allowed"
 value={user?.email || ''} readOnly />
 <p className="text-xs text-v2-muted mt-1">Email cannot be changed here</p>
 </div>
 <button type="submit" disabled={saving}
 className="v2-btn py-2.5 px-6 flex items-center gap-2">
 {saving && <Loader2 size={14} className="animate-spin" />}
 {saving ? 'Saving...' : 'Save Changes'}
 </button>
 </form>
 </div>
 );
}

// ── Change Password Section ──────────────────────────────────────
function PasswordSection() {
 const [form, setForm] = useState({ current: '', next: '', confirm: '' });
 const [show, setShow] = useState(false);
 const [saving, setSaving] = useState(false);

 const handleSave = async (e) => {
 e.preventDefault();
 if (form.next !== form.confirm) {
 toast.error('New passwords do not match');
 return;
 }
 if (form.next.length < 8) {
 toast.error('Password must be at least 8 characters');
 return;
 }
 setSaving(true);
 try {
 await api.post('/auth/change-password', {
 current_password: form.current,
 new_password: form.next,
 });
 toast.success('Password changed successfully');
 setForm({ current: '', next: '', confirm: '' });
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to change password');
 } finally {
 setSaving(false);
 }
 };

 return (
 <div className="v2-card p-6">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-10 h-10 bg-purple-50 rounded-md flex items-center justify-center">
 <Lock size={20} className="text-purple-500" />
 </div>
 <div>
 <h2 className="text-lg font-bold">Change Password</h2>
 <p className="text-xs text-v2-muted">Keep your account secure</p>
 </div>
 </div>
 <form onSubmit={handleSave} className="space-y-4">
 {['current', 'next', 'confirm'].map((field, i) => (
 <div key={field}>
 <label className="v2-label">
 {field === 'current' ? 'Current Password' : field === 'next' ? 'New Password' : 'Confirm New Password'}
 </label>
 <div className="relative">
 <input
 className="v2-input pr-10"
 type={show ? 'text' : 'password'}
 value={form[field]}
 onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
 required
 />
 {i === 0 && (
 <button type="button" onClick={() => setShow(s => !s)}
 className="absolute right-3 top-3 text-v2-muted hover:text-v2-text">
 {show ? <EyeOff size={16} /> : <Eye size={16} />}
 </button>
 )}
 </div>
 </div>
 ))}
 <button type="submit" disabled={saving}
 className="v2-btn py-2.5 px-6 flex items-center gap-2">
 {saving && <Loader2 size={14} className="animate-spin" />}
 {saving ? 'Changing...' : 'Change Password'}
 </button>
 </form>
 </div>
 );
}

// ── API Tokens Section ───────────────────────────────────────────
function ApiTokensSection() {
 const [tokens, setTokens] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showCreate, setShowCreate] = useState(false);
 const [newTokenName, setNewTokenName] = useState('');
 const [selectedScopes, setSelectedScopes] = useState(['room:read', 'room:write']);
 const [creating, setCreating] = useState(false);
 const [newTokenValue, setNewTokenValue] = useState(null);
 const [copied, setCopied] = useState(false);

 const loadTokens = useCallback(async () => {
 setLoading(true);
 try {
 const data = await apiTokenService.list();
 setTokens(Array.isArray(data) ? data : []);
 } catch { setTokens([]); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { loadTokens(); }, [loadTokens]);

 const handleCreate = async (e) => {
 e.preventDefault();
 if (!newTokenName) return;
 setCreating(true);
 try {
 const result = await apiTokenService.create(newTokenName, selectedScopes);
 setNewTokenValue(result.token || result.raw_token || result.key);
 toast.success('API token created. Copy it now — it will not be shown again.');
 loadTokens();
 setShowCreate(false);
 setNewTokenName('');
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to create token');
 } finally {
 setCreating(false);
 }
 };

 const handleRevoke = async (tokenId, name) => {
 if (!confirm(`Revoke token "${name}"? Any apps using it will stop working.`)) return;
 try {
 await apiTokenService.revoke(tokenId);
 toast.success('Token revoked');
 loadTokens();
 } catch { toast.error('Failed to revoke token'); }
 };

 const handleCopy = (text) => {
 navigator.clipboard.writeText(text).then(() => {
 setCopied(true);
 toast.success('Copied!');
 setTimeout(() => setCopied(false), 2000);
 });
 };

 const toggleScope = (scope) => {
 setSelectedScopes(prev =>
 prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
 );
 };

 return (
 <div className="v2-card p-6">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-amber-50 rounded-md flex items-center justify-center">
 <Key size={20} className="text-amber-500" />
 </div>
 <div>
 <h2 className="text-lg font-bold">API Tokens</h2>
 <p className="text-xs text-v2-muted">For programmatic access to the AYTME API</p>
 </div>
 </div>
 <button onClick={() => setShowCreate(s => !s)}
 className="v2-btn-secondary flex items-center gap-2 py-2 px-4 text-sm">
 <Plus size={14} /> New Token
 </button>
 </div>

 {/* New token value reveal */}
 <AnimatePresence>
 {newTokenValue && (
 <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
 className="mb-5 p-4 bg-green-50 border border-green-200 rounded-md">
 <div className="flex items-center gap-2 mb-2">
 <CheckCircle2 size={16} className="text-green-600" />
 <p className="text-sm font-bold text-green-700">Token created — copy it now!</p>
 </div>
 <div className="flex gap-2">
 <input className="v2-input font-mono text-xs bg-white flex-1"
 value={newTokenValue} readOnly />
 <button onClick={() => handleCopy(newTokenValue)}
 className="v2-btn-secondary px-3 flex items-center gap-1.5 text-sm">
 {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
 Copy
 </button>
 <button onClick={() => setNewTokenValue(null)} className="text-v2-muted hover:text-v2-text">
 <X size={18} />
 </button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Create form */}
 <AnimatePresence>
 {showCreate && (
 <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 onSubmit={handleCreate}
 className="mb-5 p-4 bg-v2-header rounded-md border border-v2-border space-y-4 overflow-hidden">
 <div>
 <label className="v2-label">Token Name</label>
 <input className="v2-input" value={newTokenName} placeholder="My Integration"
 onChange={e => setNewTokenName(e.target.value)} required />
 </div>
 <div>
 <label className="v2-label mb-2">Scopes</label>
 <div className="flex flex-wrap gap-2">
 {SCOPES.map(scope => (
 <button type="button" key={scope} onClick={() => toggleScope(scope)}
 className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
 selectedScopes.includes(scope)
 ? 'bg-v2-accent text-white border-transparent'
 : 'bg-white text-v2-muted border-v2-border hover:border-v2-accent'
 }`}>
 {scope}
 </button>
 ))}
 </div>
 </div>
 <div className="flex gap-3">
 <button type="submit" disabled={creating}
 className="v2-btn py-2 px-5 text-sm flex items-center gap-2">
 {creating && <Loader2 size={12} className="animate-spin" />}
 {creating ? 'Creating...' : 'Create Token'}
 </button>
 <button type="button" onClick={() => setShowCreate(false)}
 className="v2-btn-secondary py-2 px-4 text-sm">Cancel</button>
 </div>
 </motion.form>
 )}
 </AnimatePresence>

 {/* Token list */}
 {loading ? (
 <div className="flex justify-center py-8"><Loader2 className="animate-spin text-v2-accent" size={24} /></div>
 ) : tokens.length === 0 ? (
 <div className="text-center py-10 text-v2-muted">
 <Key size={36} className="mx-auto mb-3 opacity-20" />
 <p className="text-sm">No API tokens yet. Create one to get started.</p>
 </div>
 ) : (
 <div className="space-y-2">
 {tokens.map(t => (
 <div key={t.id} className="flex items-center gap-3 p-3.5 bg-white rounded-md border border-v2-border">
 <ShieldCheck size={16} className="text-v2-accent flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-sm text-v2-text">{t.name}</p>
 <p className="text-xs text-v2-muted mt-0.5">
 {t.scopes?.join(', ') || 'no scopes'} · Created {t.created_at ? new Date(t.created_at).toLocaleDateString() : 'recently'}
 </p>
 </div>
 <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${t.is_active !== false ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
 {t.is_active !== false ? 'Active' : 'Revoked'}
 </span>
 <button onClick={() => handleRevoke(t.id, t.name)}
 className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
 <Trash2 size={14} />
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

// ── Main Account Page ─────────────────────────────────────────────
export default function Account() {
 const { user } = useAuthStore();

 return (
 <div className="v2-app p-4 md:p-8 min-h-screen">
 <div className="mb-8">
 <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
 <User className="text-v2-accent" size={32} />
 Account Settings
 </h1>
 <p className="text-v2-muted mt-1">Manage your profile, password, and API access</p>
 </div>

 <div className="max-w-2xl space-y-6">
 <ProfileSection user={user} />
 <PasswordSection />
 {user?.role === 'admin' && <ApiTokensSection />}
 </div>
 </div>
 );
}
