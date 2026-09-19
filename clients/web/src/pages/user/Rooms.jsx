import React, { useState, useEffect } from 'react';
import {
    Plus, Video, Clock, ArrowRight, Link2, Search, Filter, Trash2, Pencil,
    Globe, Users, Mic, Radio, RefreshCw, MoreVertical, Copy, CheckCheck,
    ChevronDown, Sparkles, Shield, Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRoomStore } from '../../store/roomStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { invitationService } from '../../services/api';
import { buildInviteLink } from '../../utils/shareLinks';
import toast from 'react-hot-toast';

const LANGUAGES = [
    { code: 'af', label: 'Afrikaans' }, { code: 'am', label: 'Amharic' }, { code: 'ar', label: 'Arabic' },
    { code: 'bn', label: 'Bengali' }, { code: 'bg', label: 'Bulgarian' }, { code: 'zh', label: 'Chinese (Simplified)' },
    { code: 'zh-TW', label: 'Chinese (Traditional)' }, { code: 'cs', label: 'Czech' }, { code: 'da', label: 'Danish' },
    { code: 'nl', label: 'Dutch' }, { code: 'en', label: 'English' }, { code: 'fi', label: 'Finnish' },
    { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'el', label: 'Greek' },
    { code: 'gu', label: 'Gujarati' }, { code: 'ha', label: 'Hausa' }, { code: 'he', label: 'Hebrew' },
    { code: 'hi', label: 'Hindi' }, { code: 'hu', label: 'Hungarian' }, { code: 'ig', label: 'Igbo' },
    { code: 'id', label: 'Indonesian' }, { code: 'it', label: 'Italian' }, { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }, { code: 'ms', label: 'Malay' }, { code: 'mr', label: 'Marathi' },
    { code: 'ne', label: 'Nepali' }, { code: 'no', label: 'Norwegian' }, { code: 'fa', label: 'Persian (Farsi)' },
    { code: 'pl', label: 'Polish' }, { code: 'pt', label: 'Portuguese' }, { code: 'pa', label: 'Punjabi' },
    { code: 'ro', label: 'Romanian' }, { code: 'ru', label: 'Russian' }, { code: 'si', label: 'Sinhala' },
    { code: 'sk', label: 'Slovak' }, { code: 'es', label: 'Spanish' }, { code: 'sw', label: 'Swahili' },
    { code: 'sv', label: 'Swedish' }, { code: 'tl', label: 'Tagalog (Filipino)' }, { code: 'ta', label: 'Tamil' },
    { code: 'te', label: 'Telugu' }, { code: 'th', label: 'Thai' }, { code: 'tr', label: 'Turkish' },
    { code: 'uk', label: 'Ukrainian' }, { code: 'ur', label: 'Urdu' }, { code: 'vi', label: 'Vietnamese' },
    { code: 'yo', label: 'Yoruba' }, { code: 'zu', label: 'Zulu' },
];

function CreateRoomModal({ onClose, onCreated, orgId }) {
    const [form, setForm] = useState({
        name: '', description: '', primary_language: 'en',
        target_languages: ['ar'], max_participants: 50,
        privacy: 'private', auto_record: false,
        enable_transcripts: true, enable_ai: true,
    });
    const [saving, setSaving] = useState(false);
    const createRoom = useRoomStore(s => s.createRoom);

    const toggle = (key) => setForm(p => ({ ...p, [key]: !p[key] }));
    const handleLang = (code) => setForm(p => ({
        ...p,
        target_languages: p.target_languages.includes(code)
            ? p.target_languages.filter(l => l !== code)
            : [...p.target_languages, code],
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { toast.error('Room name is required'); return; }
        setSaving(true);
        try {
            const room = await createRoom({ ...form, org_id: orgId });
            toast.success('Room created!');
            onCreated(room);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create room');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 30 }}
                className="bg-slate-900/40 border border-white/10 rounded-[48px] p-8 md:p-12 w-full max-w-2xl shadow-[0_0_100px_rgba(79,70,229,0.15)] overflow-y-auto max-h-[90vh] relative overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-500" />
                
                <header className="mb-10 text-center sm:text-left">
                    <h2 className="text-4xl font-black tracking-tight mb-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Create Room</h2>
                    <p className="text-slate-500 text-sm font-medium">Configure your new meeting space</p>
                </header>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Name */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Room Name</label>
                        <input
                            autoFocus
                            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Engineering Standup"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 text-white placeholder-slate-700 transition-all hover:bg-white/[0.08]"
                        />
                    </div>

                    {/* Primary Config */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Host Language</label>
                            <div className="relative">
                                <select
                                    value={form.primary_language}
                                    onChange={e => setForm(p => ({ ...p, primary_language: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm appearance-none text-white hover:bg-white/[0.08] transition-all"
                                >
                                    {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-950">{l.label}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Max People</label>
                            <div className="relative">
                                <Users size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="number" min={2} max={500}
                                    value={form.max_participants}
                                    onChange={e => setForm(p => ({ ...p, max_participants: parseInt(e.target.value) }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm text-white hover:bg-white/[0.08] transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Target Languages */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Translations</label>
                        <div className="flex flex-wrap gap-2 p-4 bg-slate-950/50 rounded-3xl border border-white/5">
                            {LANGUAGES.filter(l => l.code !== form.primary_language).map(l => (
                                <button
                                    key={l.code} type="button" onClick={() => handleLang(l.code)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${form.target_languages.includes(l.code)
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/20'
                                            : 'bg-white/5 border-white/5 text-slate-500 hover:text-white hover:border-white/20'
                                        }`}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Security & Features */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         {[
                            { key: 'privacy', val: 'private', label: 'Private', icon: Shield },
                            { key: 'privacy', val: 'public', label: 'Public', icon: Globe },
                            { key: 'enable_ai', label: 'AI Assistant', icon: Sparkles },
                        ].map((item) => {
                            const isToggle = item.key !== 'privacy';
                            const isActive = isToggle ? form[item.key] : form.privacy === item.val;
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => isToggle ? toggle(item.key) : setForm(p => ({ ...p, privacy: item.val }))}
                                    className={`flex flex-col items-center justify-center p-5 rounded-[28px] border transition-all active:scale-95 ${isActive
                                            ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400 shadow-xl'
                                            : 'bg-white/[0.02] border-white/5 text-slate-600 hover:border-white/20'
                                        }`}
                                >
                                    <Icon size={20} className="mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
                                    <div className={`w-1 h-1 rounded-full mt-2 ${isActive ? 'bg-indigo-400 animate-pulse' : 'bg-slate-800'}`} />
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit" disabled={saving}
                            className="flex-1 py-5 bg-white text-slate-950 rounded-3xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl"
                        >
                            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
                            {saving ? 'Creating...' : 'Create Room'}
                        </motion.button>
                        <button
                            type="button" onClick={onClose}
                            className="px-10 py-5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-3xl font-black uppercase tracking-widest text-[11px] transition-all border border-white/5"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

function EditRoomModal({ room, onClose, onUpdated }) {
    const [name, setName] = useState(room.name);
    const [maxParticipants, setMaxParticipants] = useState(room.max_participants || 50);
    const [privacy, setPrivacy] = useState(room.visibility || 'private');
    const [saving, setSaving] = useState(false);
    const updateRoom = useRoomStore(s => s.updateRoom);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updated = await updateRoom(room.id, {
                name, max_participants: maxParticipants, visibility: privacy,
            });
            toast.success('Configuration updated!');
            onUpdated(updated);
            onClose();
        } catch {
            toast.error('Failed to update room');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-slate-900 border border-white/10 rounded-[48px] p-8 md:p-12 w-full max-w-lg shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <header className="mb-10">
                    <h2 className="text-3xl font-black tracking-tight mb-2">Edit Room</h2>
                    <p className="text-slate-500 text-sm">Update meeting room settings</p>
                </header>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Room Name</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 text-white transition-all shadow-inner"
                        />
                    </div>
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Max People</label>
                        <input
                            type="number" min={2} max={500} value={maxParticipants}
                            onChange={e => setMaxParticipants(parseInt(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 text-white shadow-inner"
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Privacy</label>
                        <div className="flex gap-3">
                            {['private', 'public'].map(v => (
                                <button key={v} type="button" onClick={() => setPrivacy(v)}
                                    className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${privacy === v ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-slate-500'
                                        }`}
                                >{v}</button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-6">
                        <button type="submit" disabled={saving}
                            className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                        >{saving ? 'Saving...' : 'Save Changes'}</button>
                        <button type="button" onClick={onClose}
                            className="px-8 py-5 bg-white/5 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all hover:bg-white/10 text-slate-400"
                        >Cancel</button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

export default function Rooms() {
    const navigate = useNavigate();
    const rooms = useRoomStore(s => s.rooms);
    const fetchRooms = useRoomStore(s => s.fetchRooms);
    const deleteRoom = useRoomStore(s => s.deleteRoom);
    const isLoading = useRoomStore(s => s.isLoading);
    const org = useOrganizationStore(s => s.currentOrg);
    const orgs = useOrganizationStore(s => s.organizations);
    const fetchOrgs = useOrganizationStore(s => s.fetchOrganizations);
    const setOrg = useOrganizationStore(s => s.setCurrentOrg);

    const [showCreate, setShowCreate] = useState(false);
    const [editRoom, setEditRoom] = useState(null);
    const [search, setSearch] = useState('');
    const [inviteModal, setInviteModal] = useState(null);
    const [inviteLoading, setInviteLoading] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchOrgs().then((orgsData) => {
            const currentOrg = org || (orgsData?.length ? orgsData[0] : null);
            if (currentOrg) fetchRooms(currentOrg.id);
        });
    }, []);

    useEffect(() => {
        if (org) fetchRooms(org.id);
    }, [org?.id]);

    const filtered = rooms.filter(r =>
        r.name?.toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = async (roomId) => {
        if (!window.confirm('Delete this room? This action cannot be undone.')) return;
        try {
            await deleteRoom(roomId);
            toast.success('Room deleted');
        } catch {
            toast.error('Failed to delete room');
        }
    };

    const handleInvite = async (room) => {
        const roomId = room?.id || room;
        const mode = String(room?.mode || room?.policy?.intent_mode || '').toLowerCase();
        const inviteRole = mode === 'broadcast' ? 'listener' : 'speaker';
        setInviteLoading(roomId);
        try {
            const inv = await invitationService.createInvite(roomId, inviteRole, 100, 24);
            const token = inv.token || inv.id;
            const url = buildInviteLink(token);
            setInviteModal({ roomId, url });
        } catch {
            toast.error('Failed to generate invite link');
        } finally {
            setInviteLoading(null);
        }
    };

    const copyInvite = () => {
        navigator.clipboard.writeText(inviteModal?.url || '');
        setCopied(true);
        toast.success('Copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-12 text-white pb-24">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full w-fit"
                    >
                        <Radio size={12} className="text-indigo-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Live Infrastructure</span>
                    </motion.div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-slate-500 bg-clip-text text-transparent">
                        Rooms
                    </h1>
                    <p className="text-slate-500 text-xs md:text-sm font-medium max-w-md leading-relaxed">
                        Manage your global communication hubs with real-time AI translation and intelligent routing.
                    </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                    {orgs.length > 1 && (
                        <div className="relative group">
                            <Building2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                            <select
                                value={org?.id || ''}
                                onChange={e => setOrg(orgs.find(o => o.id === e.target.value))}
                                className="pl-11 pr-10 py-4 bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none appearance-none hover:border-indigo-500/30 transition-all text-white cursor-pointer min-w-[180px]"
                            >
                                {orgs.map(o => <option key={o.id} value={o.id} className="bg-slate-950 text-white">{o.name}</option>)}
                            </select>
                        </div>
                    )}

                </div>
            </header>

            {/* Utility Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search rooms..."
                        className="w-full pl-14 pr-6 py-4 bg-transparent text-sm font-bold outline-none placeholder-slate-700 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2 p-1">
                    <button className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-slate-500 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest">
                        <Filter size={14} />
                        <span className="hidden sm:inline">Filters</span>
                    </button>
                    <button className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-500 hover:text-white hover:bg-white/10 transition-all">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-slate-900/50 rounded-[40px] border border-white/5 animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-32 bg-slate-900/20 backdrop-blur-sm border border-white/5 rounded-[60px] text-center px-10"
                >
                    <div className="w-24 h-24 bg-indigo-500/10 rounded-[40px] flex items-center justify-center mb-8 border border-indigo-500/20">
                        <Video size={40} className="text-indigo-400 opacity-50" />
                    </div>
                    <h3 className="text-3xl font-black text-white mb-3">No Rooms Found</h3>
                    <p className="text-slate-500 text-sm max-w-sm mb-10 leading-relaxed">
                        Start your first meeting and experience real-time translation across 100+ languages.
                    </p>
                    <button
                        onClick={() => navigate('/functions')}
                        className="flex items-center gap-3 px-10 py-5 bg-white text-slate-950 hover:bg-indigo-50 rounded-[28px] font-black uppercase tracking-widest text-xs transition-all shadow-2xl"
                    >
                        <Plus size={18} /> Initialize a Mode
                    </button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filtered.map((room, idx) => (
                        <motion.div
                            key={room.id}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05, duration: 0.5 }}
                            className="group relative bg-slate-900/30 backdrop-blur-3xl border border-white/5 hover:border-indigo-500/40 rounded-[48px] p-8 sm:p-10 transition-all duration-500 hover:bg-white/[0.04] shadow-2xl flex flex-col min-h-[340px] overflow-hidden"
                        >
                            {/* Animated Background Orbs */}
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/5 blur-[80px] rounded-full group-hover:bg-indigo-500/15 transition-all duration-700 pointer-events-none" />
                            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-600/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-all duration-700 pointer-events-none" />

                            {/* Card Header */}
                            <div className="flex items-start justify-between mb-10 relative z-10">
                                <div className="w-16 h-16 bg-slate-950 rounded-3xl flex items-center justify-center border border-white/5 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 transition-all duration-500 shadow-inner overflow-hidden">
                                    <Video className="text-slate-600 group-hover:text-indigo-400 transition-all duration-500" size={24} />
                                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] rounded-full border shadow-sm ${
                                        room.visibility === 'public' 
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5' 
                                            : 'bg-slate-500/10 text-slate-400 border-slate-500/10 shadow-slate-500/5'
                                    }`}>
                                        {room.visibility || 'Private'}
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Online</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card Content */}
                            <div className="flex-1 relative z-10">
                                <h3 className="text-2xl sm:text-3xl font-black text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-indigo-300 transition-all duration-500 truncate mb-3">
                                    {room.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-5">
                                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-400 transition-colors">
                                        <Clock size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{new Date(room.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-400 transition-colors">
                                        <Users size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{room.max_participants || 50} Max</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between gap-4 relative z-10">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleInvite(room)}
                                        disabled={inviteLoading === room.id}
                                        title="Generate Invite"
                                        className="p-3.5 bg-slate-950/80 border border-white/5 hover:border-indigo-500/30 rounded-2xl transition-all text-slate-600 hover:text-indigo-400 shadow-inner group/btn"
                                    >
                                        {inviteLoading === room.id ? <RefreshCw size={18} className="animate-spin text-indigo-400" /> : <Link2 size={18} className="group-hover/btn:rotate-12 transition-transform" />}
                                    </button>
                                    <button
                                        onClick={() => setEditRoom(room)}
                                        title="Edit Room"
                                        className="p-3.5 bg-slate-950/80 border border-white/5 hover:border-indigo-500/30 rounded-2xl transition-all text-slate-600 hover:text-indigo-400 shadow-inner group/btn"
                                    >
                                        <Pencil size={18} className="group-hover/btn:scale-110 transition-transform" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(room.id)}
                                        title="Delete Room"
                                        className="p-3.5 bg-slate-950/80 border border-white/5 hover:border-rose-500/40 rounded-2xl transition-all text-slate-600 hover:text-rose-400 shadow-inner group/btn"
                                    >
                                        <Trash2 size={18} className="group-hover/btn:rotate-12 transition-transform" />
                                    </button>
                                </div>
                                    <motion.button
                                    whileHover={{ x: 5 }}
                                    onClick={() => navigate(`/room/${room.id}`)}
                                    className="flex items-center gap-3 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/10 active:scale-95 border border-indigo-400/30"
                                >
                                    Join Room <ArrowRight size={16} />
                                </motion.button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {showCreate && (
                    <CreateRoomModal
                        orgId={org?.id}
                        onClose={() => setShowCreate(false)}
                        onCreated={() => { }}
                    />
                )}
                {editRoom && (
                    <EditRoomModal
                        room={editRoom}
                        onClose={() => setEditRoom(null)}
                        onUpdated={() => setEditRoom(null)}
                    />
                )}
                {inviteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl" onClick={() => setInviteModal(null)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-slate-900 border border-white/10 rounded-[40px] p-10 w-full max-w-lg shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-2xl font-black mb-2">Invite Link</h3>
                            <p className="text-slate-500 text-sm mb-8">Share this link to invite participants to your room.</p>
                            <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-5 py-4">
                                <span className="text-xs text-slate-400 truncate flex-1 font-mono">{inviteModal.url}</span>
                                <button onClick={copyInvite} className="p-2 hover:bg-white/10 rounded-xl transition-all text-indigo-400">
                                    {copied ? <CheckCheck size={18} className="text-emerald-400" /> : <Copy size={18} />}
                                </button>
                            </div>
                            <button onClick={() => setInviteModal(null)} className="w-full mt-4 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-xs transition-all">
                                Close
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
