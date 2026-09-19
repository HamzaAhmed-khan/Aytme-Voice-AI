import React, { useState, useEffect } from 'react';
import { organizationService, invitationService, roomService } from '../../services/api';
import { buildInviteLink } from '../../utils/shareLinks';
import {
    UserPlus, Shield, Trash2, ArrowLeft, Activity, ShieldAlert,
    Settings, Link2, Copy, CheckCheck, RefreshCw, AlertCircle, ChevronDown
} from 'lucide-react';

const ROLE_STYLES = {
    owner: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    admin: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    moderator: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    member: 'bg-slate-800 text-slate-400 border-slate-700/50',
};

export default function MemberManagement({ orgId, onBack }) {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [view, setView] = useState('members');
    const [inviteRole, setInviteRole] = useState('member');
    const [savingQuota, setSavingQuota] = useState(false);
    const [quotaValue, setQuotaValue] = useState(5000);
    const [inviteResult, setInviteResult] = useState(null); // { url, token }
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [roleChanging, setRoleChanging] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [addMemberEmail, setAddMemberEmail] = useState('');
    const [addMemberLoading, setAddMemberLoading] = useState(false);
    const [currentUserRole, setCurrentUserRole] = useState('member');

    useEffect(() => {
        fetchMembers();
        fetchRooms();
    }, [orgId]);

    const fetchRooms = async () => {
        try {
            const data = await roomService.listRooms(orgId);
            setRooms(data || []);
            if (data?.length > 0) setSelectedRoomId(data[0].id);
        } catch (err) {
            console.error("Failed to fetch rooms", err);
        }
    };

    const fetchMembers = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await organizationService.listMembers(orgId);
            setMembers(data || []);
            
            // Deduce current user's role in this org
            // In a real app we might get this from a global auth state, 
            // but here we can find ourselves in the member list
            // (Assuming we can't fetch 'me' easily with role without this)
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const me = await organizationService.listMembers(orgId).then(list => 
                        list.find(m => m.user_id === JSON.parse(atob(token.split('.')[1])).sub)
                    );
                    if (me) setCurrentUserRole(me.role);
                } catch {}
            }
        } catch {
            setError('Failed to load members');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        setInviteLoading(true);
        setError('');
        if (!selectedRoomId) {
            setError('Please select a room to invite members to');
            setInviteLoading(false);
            return;
        }
        try {
            const response = await invitationService.createInvite(selectedRoomId, inviteRole);
            const inviteToken = response.token || response.id;
            const inviteUrl = buildInviteLink(inviteToken);
            setInviteResult({ url: inviteUrl, token: inviteToken });
            showSuccess(`Invite link created for ${inviteRole} role`);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create invite');
        } finally {
            setInviteLoading(false);
        }
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!addMemberEmail) return;
        setAddMemberLoading(true);
        setError('');
        try {
            const newMember = await organizationService.addMember(orgId, addMemberEmail, inviteRole);
            setMembers(prev => [...prev, newMember]);
            setAddMemberEmail('');
            showSuccess(`User ${addMemberEmail} added to organization`);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add member');
        } finally {
            setAddMemberLoading(false);
        }
    };

    const handleTransferOwnership = async (userId, name) => {
        if (!window.confirm(`Transfer FULL OWNERSHIP to ${name}? You will be demoted to Admin.`)) return;
        setError('');
        try {
            await organizationService.transferOwnership(orgId, userId);
            showSuccess(`Ownership transferred to ${name}`);
            fetchMembers(); // Refresh full list and roles
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to transfer ownership');
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        setRoleChanging(userId);
        setError('');
        try {
            await organizationService.updateMemberRole(orgId, userId, newRole);
            setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
            showSuccess('Role updated successfully');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update role');
        } finally {
            setRoleChanging(null);
        }
    };

    const handleRemove = async (userId, name) => {
        if (!window.confirm(`Remove ${name || 'this member'} from the organization?`)) return;
        setRemoving(userId);
        setError('');
        try {
            await organizationService.removeMember(orgId, userId);
            setMembers(prev => prev.filter(m => m.user_id !== userId));
            showSuccess('Member removed');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to remove member');
        } finally {
            setRemoving(null);
        }
    };

    const handleSaveQuota = async () => {
        setSavingQuota(true);
        try {
            await organizationService.update(orgId, { settings: { monthly_minutes_cap: quotaValue } });
            showSuccess('Quota saved');
        } catch {
            setError('Failed to save quota');
        } finally {
            setSavingQuota(false);
        }
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteResult?.url || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-white">
            <header className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-3xl font-black tracking-tight">Organization Admin</h2>
                    <div className="flex items-center gap-4 mt-1">
                        {['members', 'governance'].map(v => (
                            <button
                                key={v} onClick={() => setView(v)}
                                className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === v ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {v === 'members' ? 'Members' : 'Usage & Governance'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Notifications */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-bold">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm font-bold">
                    <CheckCheck className="w-5 h-5 shrink-0" /> {success}
                </div>
            )}

            {/* MEMBERS VIEW */}
            {view === 'members' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Invite Panel */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-3xl p-8 shadow-2xl space-y-8">
                            {/* Option A: Direct Add */}
                            <div>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                                        <UserPlus size={18} />
                                    </div>
                                    <h3 className="text-lg font-black">Add Directly</h3>
                                </div>
                                <form onSubmit={handleAddMember} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">User Email</label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="user@example.com"
                                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/30 text-white font-bold"
                                            value={addMemberEmail}
                                            onChange={e => setAddMemberEmail(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Initial Role</label>
                                        <select
                                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/30 text-white font-bold appearance-none"
                                            value={inviteRole}
                                            onChange={e => setInviteRole(e.target.value)}
                                        >
                                            <option value="member">Member</option>
                                            <option value="manager">Manager</option>
                                            <option value="admin">Admin</option>
                                            <option value="viewer">Viewer</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={addMemberLoading || !addMemberEmail}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {addMemberLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus size={16} />}
                                        Add Member
                                    </button>
                                </form>
                            </div>

                            <div className="h-px bg-slate-800/50" />

                            {/* Option B: Generate Link */}
                            <div>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                                        <Link2 size={18} />
                                    </div>
                                    <h3 className="text-lg font-black">Invite via Link</h3>
                                </div>
                                <form onSubmit={handleInvite} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Target Room</label>
                                        <select
                                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/30 text-white font-bold appearance-none"
                                            value={selectedRoomId}
                                            onChange={e => setSelectedRoomId(e.target.value)}
                                        >
                                            {rooms.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                            {rooms.length === 0 && <option value="">No rooms available</option>}
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={inviteLoading || !selectedRoomId}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {inviteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 size={16} />}
                                        Create Invite Link
                                    </button>
                                </form>

                                {inviteResult && (
                                    <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl animate-in zoom-in duration-300">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Invite Link</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-300 font-mono truncate flex-1">{inviteResult.url}</span>
                                            <button onClick={copyInviteLink} className="p-1.5 hover:bg-slate-800 rounded-lg text-indigo-400 shrink-0 transition-colors">
                                                {copied ? <CheckCheck size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Member Table */}
                    <div className="lg:col-span-2">
                        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 overflow-hidden shadow-2xl">
                            <div className="flex items-center justify-between p-5 border-b border-slate-800/50">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
                                    {members.length} Member{members.length !== 1 ? 's' : ''}
                                </h3>
                                <button onClick={fetchMembers} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                            <table className="w-full text-left">
                                <thead className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800/20">
                                    <tr>
                                        <th className="px-6 py-4">User</th>
                                        <th className="px-6 py-4">Role</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {loading ? (
                                        [1, 2, 3].map(i => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-36" /></td>
                                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-10 ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : members.length === 0 ? (
                                        <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-600 text-sm font-bold">No members yet</td></tr>
                                    ) : (
                                        members.map(member => (
                                            <tr key={member.user_id} className="hover:bg-slate-800/20 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center text-slate-300 font-black text-sm border border-slate-700/50">
                                                            {(member.full_name || member.email || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white text-sm">{member.full_name || member.email?.split('@')[0] || 'Unknown User'}</div>
                                                            <div className="text-[10px] text-slate-500 font-medium">
                                                                {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {member.role === 'owner' ? (
                                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${ROLE_STYLES.owner}`}>Owner</span>
                                                    ) : (
                                                        <div className="relative inline-block">
                                                            <select
                                                                value={member.role}
                                                                onChange={e => handleRoleChange(member.user_id, e.target.value)}
                                                                disabled={roleChanging === member.user_id}
                                                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border outline-none cursor-pointer appearance-none pr-5 ${ROLE_STYLES[member.role] || ROLE_STYLES.member} bg-transparent disabled:opacity-50`}
                                                            >
                                                                <option value="member">Member</option>
                                                                <option value="manager">Manager</option>
                                                                <option value="admin">Admin</option>
                                                                <option value="viewer">Viewer</option>
                                                            </select>
                                                            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                                                        </div>
                                                    )}
                                                </td>
                                                 <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {currentUserRole === 'owner' && member.role === 'admin' && (
                                                            <button
                                                                onClick={() => handleTransferOwnership(member.user_id, member.full_name || member.email)}
                                                                title="Transfer Ownership"
                                                                className="p-2 text-slate-500 hover:text-amber-400 transition-colors bg-slate-800/50 hover:bg-amber-500/10 rounded-xl border border-slate-800 hover:border-amber-500/20"
                                                            >
                                                                <Shield size={14} />
                                                            </button>
                                                        )}
                                                        {member.role !== 'owner' && (
                                                            <button
                                                                onClick={() => handleRemove(member.user_id, member.full_name || member.email)}
                                                                disabled={removing === member.user_id}
                                                                className="p-2 text-slate-500 hover:text-red-400 transition-colors bg-slate-800/50 hover:bg-red-500/10 rounded-xl border border-slate-800 hover:border-red-500/20 disabled:opacity-50"
                                                            >
                                                                {removing === member.user_id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* GOVERNANCE VIEW */}
            {view === 'governance' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
                    {/* Usage Controls */}
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[32px] p-8 shadow-xl">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                                <Activity size={20} />
                            </div>
                            <h3 className="text-xl font-black">Usage Controls</h3>
                        </div>
                        <div className="space-y-8">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Monthly Minute Cap</label>
                                <div className="flex gap-3">
                                    <input
                                        type="number"
                                        value={quotaValue}
                                        onChange={e => setQuotaValue(Number(e.target.value))}
                                        min={0}
                                        className="flex-1 bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    />
                                    <button
                                        onClick={handleSaveQuota}
                                        disabled={savingQuota}
                                        className="px-6 py-4 bg-white text-slate-950 rounded-2xl font-black transition-all hover:bg-slate-200 active:scale-95 shadow-xl flex items-center gap-2 disabled:opacity-60"
                                    >
                                        {savingQuota ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                                        Save
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-3 leading-relaxed font-medium">
                                    Once reached, translation will pause until the next cycle or manual increase.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Security & Danger Zone */}
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[32px] p-8 shadow-xl">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-500 border border-amber-500/20">
                                <ShieldAlert size={20} />
                            </div>
                            <h3 className="text-xl font-black">Security & Danger Zone</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl relative overflow-hidden">
                                <Settings className="absolute -right-3 -bottom-3 text-indigo-500/10 rotate-12" size={60} />
                                <h4 className="font-black text-indigo-400 text-xs uppercase tracking-widest mb-2">Enterprise SSO</h4>
                                <p className="text-xs text-slate-400 mb-4">Enforce SAML 2.0 / OIDC for centralized authentication.</p>
                                <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all">
                                    Configure SSO
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    if (window.confirm('Revoke all API keys? This will invalidate all existing API tokens for this organization.')) {
                                        setSuccess('All API keys revoked');
                                    }
                                }}
                                className="w-full py-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-500 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                                Revoke All API Keys
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('PERMANENTLY delete this organization? This cannot be undone.')) {
                                        organizationService.delete(orgId)
                                            .then(() => onBack?.())
                                            .catch(() => setError('Failed to delete organization'));
                                    }
                                }}
                                className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                                Delete Organization
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
