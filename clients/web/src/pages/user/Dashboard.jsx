import React, { useState, useEffect } from 'react';
import { roomService, organizationService, billingService, invitationService, analyticsService } from '../../services/api';
import { Plus, Video, Clock, ArrowRight, Shield, Activity, Trash2, Link2, Copy, CheckCheck, ChevronDown, Building2, Zap, Radio, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { useRoomStore } from '../../store/roomStore';
import { useAgentStore } from '../../store/agentStore';
import { buildInviteLink } from '../../utils/shareLinks';
import UsageChart from '../../components/UsageChart';
import InstallButton from '../../components/shared/InstallButton';
import toast from 'react-hot-toast';

const LANGUAGES = [
    { code: 'af', label: 'Afrikaans' }, { code: 'am', label: 'Amharic' }, { code: 'ar', label: 'Arabic' },
    { code: 'bn', label: 'Bengali' }, { code: 'bg', label: 'Bulgarian' }, { code: 'zh', label: 'Chinese (Simplified)' },
    { code: 'zt', label: 'Chinese (Traditional)' }, { code: 'cs', label: 'Czech' }, { code: 'da', label: 'Danish' },
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
    { code: 'yo', label: 'Yoruba' }, { code: 'zu', label: 'Zulu' }
];

export default function Dashboard() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Store Access
    const user = useAuthStore(state => state.user);
    const org = useOrganizationStore(state => state.currentOrg);
    const setOrg = useOrganizationStore(state => state.setCurrentOrg);
    const orgs = useOrganizationStore(state => state.organizations);
    const fetchOrgs = useOrganizationStore(state => state.fetchOrganizations);
    const rooms = useRoomStore(state => state.rooms);
    const fetchRooms = useRoomStore(state => state.fetchRooms);
    const setRooms = useRoomStore(state => state.setRooms);
    const setSubscription = useOrganizationStore(state => state.setSubscription);
    const updateUsage = useOrganizationStore(state => state.updateUsage);
    const subscription = useOrganizationStore(state => state.subscription);

    // State
    const [newRoomName, setNewRoomName] = useState('');
    const [primaryLang, setPrimaryLang] = useState('en');
    const [targetLangs, setTargetLangs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [inviteModal, setInviteModal] = useState(null);
    const [createModal, setCreateModal] = useState(false);
    const [inviteLoading, setInviteLoading] = useState(null);
    const [copied, setCopied] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
    const [botStatuses, setBotStatuses] = useState({});
    const [stats, setStats] = useState({ total_rooms: 0, active_now: 0, top_mode: 'N/A' });

    const loadData = async () => {
        setFetching(true);
        try {
            const organizations = await fetchOrgs();
            const currentOrg = org || (organizations?.length > 0 ? organizations[0] : null);

            if (currentOrg) {
                await Promise.all([
                    fetchRooms(currentOrg.id),
                    loadSubscription(currentOrg.id)
                ]);
            }
        } catch (err) {
            console.error('[Dashboard] loadData failed:', err);
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        if (!rooms || rooms.length === 0) return;
        let isMounted = true;
        
        const pollBotStatuses = async () => {
            if (document.hidden) return; // Don't poll if tab is inactive
            
            const statuses = {};
            await Promise.all(rooms.map(async (room) => {
                try {
                    const res = await roomService.getBotStatus(room.id);
                    if (isMounted) statuses[room.id] = res.bot_active;
                } catch { if (isMounted) statuses[room.id] = false; }
            }));
            if (isMounted) setBotStatuses(statuses);
        };
        
        pollBotStatuses();
        const interval = setInterval(pollBotStatuses, 5000); // Increased frequency to 5s for snappier status
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [rooms]);

    useEffect(() => {
        if (searchParams.get('session_id')) {
            setIsConfirmingPayment(true);
            setTimeout(() => {
                setIsConfirmingPayment(false);
                setSearchParams({});
                loadData();
                toast.success('Subscription activated!');
            }, 3000);
        }
    }, [searchParams]);

    const loadSubscription = async (orgId) => {
        try {
            const [sub, usage, analyticStats] = await Promise.all([
                billingService.getSubscription(orgId),
                billingService.getUsageSummary(orgId).catch(() => null),
                analyticsService.getStats(orgId).catch(() => ({ total_rooms: 0, active_now: 0, top_mode: 'N/A' }))
            ]);
            setSubscription(sub);
            setStats(analyticStats);
            
            // 🛡️ Data Integrity: Ensure we don't show phantom usage
            const minutesUsed = usage?.total_minutes || sub?.minutes_used || 0;
            const minutesTotal = sub.minutes_total || 60;
            
            const usageData = {
                minutes_used: minutesUsed,
                minutes_remaining: Math.max(0, minutesTotal - minutesUsed),
                quota_percent: Math.round((minutesUsed / minutesTotal) * 100)
            };
            
            updateUsage(usageData);
            localStorage.setItem('usage_cache', JSON.stringify(usageData));
            localStorage.setItem('subscription_cache', JSON.stringify(sub));
        } catch { setSubscription(null); }
    };

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        const name = newRoomName.trim();
        if (!name) { toast.error('Room name is required'); return; }
        setLoading(true);
        try {
            const room = await roomService.createRoom({
                name, 
                org_id: org?.id || null,
                primary_lang: LANGUAGES.find(l => l.code === primaryLang)?.label || "English",
                target_langs: targetLangs
            });
            setNewRoomName('');
            setPrimaryLang('en');
            setTargetLangs([]);
            setCreateModal(false);
            setRooms(prev => [room, ...prev]);
            toast.success('Room created successfully');
            navigate(`/room/${room.id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create room');
        } finally { setLoading(false); }
    };

    const handleTargetToggle = (code) => {
        setTargetLangs(prev => 
            prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code]
        );
    };

    const handleGenerateInvite = async (room) => {
        const roomId = room?.id || room;
        const mode = String(room?.mode || room?.policy?.intent_mode || '').toLowerCase();
        const inviteRole = mode === 'broadcast' ? 'listener' : 'speaker';
        setInviteLoading(roomId);
        try {
            const invite = await invitationService.createInvite(roomId, inviteRole, 100, 24);
            const tokenValue = invite.token || invite.id;
            const url = buildInviteLink(tokenValue);
            setInviteModal({ roomId, token: tokenValue, url });
        } catch (err) { toast.error('Failed to create invite link'); }
        finally { setInviteLoading(null); }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(inviteModal?.url || '');
        setCopied(true);
        toast.success('Link copied');
        setTimeout(() => setCopied(false), 2000);
    };

    const usage = useOrganizationStore(state => state.usage);
    const quota = subscription ? { used: usage.minutes_used || 0, total: subscription.minutes_total || 60 } : { used: 0, total: 60 };
    const quotaPct = usage.quota_percent || 0;
    const agentStatus = useAgentStore(s => s.agentStatus);
    const agentLatency = useAgentStore(s => s.latency);

    const agentStatusStyles = {
        connected: { cls: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5', dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' },
        connecting: { cls: 'text-amber-400 border-amber-500/20 bg-amber-500/5', dot: 'bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]' },
        error: { cls: 'text-rose-400 border-rose-500/20 bg-rose-500/5', dot: 'bg-rose-400' },
        idle: { cls: 'text-slate-500 border-white/5 bg-white/[0.02]', dot: 'bg-slate-600' },
    };
    const agSty = agentStatusStyles[agentStatus] || agentStatusStyles.idle;

    return (
        <div className="space-y-6 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 text-white pb-20 max-w-[100vw] overflow-x-hidden p-2 sm:p-0 smooth-render">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                <div className="space-y-1">
                    <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-slate-600 flex items-center gap-4">
                        Dashboard
                    </h1>
                    <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] sm:text-xs opacity-70">Manage your meetings and AI</p>
                </div>
                {orgs.length > 0 && (
                    <div className="relative group w-full sm:w-auto mt-2 sm:mt-0">
                        <div className="absolute inset-0 bg-indigo-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />
                        <select
                            className="w-full sm:w-auto relative pl-11 pr-12 py-4 bg-slate-900/60 border border-white/5 rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/30 appearance-none cursor-pointer backdrop-blur-md transition-all hover:bg-slate-900/80"
                            value={org?.id || ''}
                            onChange={(e) => {
                                const newOrg = orgs.find(o => o.id === e.target.value);
                                if (newOrg) {
                                    setOrg(newOrg);
                                    fetchRooms(newOrg.id);
                                    loadSubscription(newOrg.id);
                                }
                            }}
                        >
                            {orgs.map(o => <option key={o.id} value={o.id} className="bg-slate-950 font-bold">{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5 pointer-events-none z-10" />
                    </div>
                )}
                
                <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
                    <div className="sm:hidden">
                        <InstallButton isMobile={true} />
                    </div>
                    <div className="hidden sm:block">
                        <InstallButton isMobile={false} />
                    </div>
                    <button 
                        onClick={() => setCreateModal(true)}
                        className="w-full sm:w-auto px-8 py-4.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-2xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-95 text-[11px] uppercase tracking-widest border border-indigo-400/20"
                    >
                        <Plus size={20} /> Create Meeting
                    </button>
                </div>
            </header>

            {/* High-Impact Stat Grid: Optimized for Desktop and Mobile (3-Box Layout) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
                {/* Box 1: Total Sessions */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden group p-8 sm:p-10 bg-slate-900 border border-white/5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl transition-all hover:scale-[1.02] hover:-translate-y-2 hover:border-indigo-500/30"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex flex-col gap-6">
                        <div className="w-16 h-16 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xl group-hover:rotate-6">
                            <Clock size={28} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Total Sessions</p>
                            <h3 className="text-4xl sm:text-5xl font-black tracking-tighter text-white">{stats.total_rooms}</h3>
                        </div>
                        <div className="mt-2 text-[9px] font-black uppercase text-slate-600 bg-white/5 w-fit px-3 py-1.5 rounded-full border border-white/5 group-hover:border-indigo-500/20 group-hover:text-indigo-400 transition-colors">Lifetime Activity</div>
                    </div>
                </motion.div>

                {/* Box 2: Active Now */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="relative overflow-hidden group p-8 sm:p-10 bg-slate-900 border border-white/5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl transition-all hover:scale-[1.02] hover:-translate-y-2 hover:border-emerald-500/30"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex flex-col gap-6">
                        <div className="w-16 h-16 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-xl group-hover:-rotate-3">
                            <Activity size={28} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Active Now</p>
                            <div className="flex items-center gap-4">
                                <h3 className="text-4xl sm:text-5xl font-black tracking-tighter text-white">{stats.active_now}</h3>
                                {stats.active_now > 0 && <span className="flex w-3 h-3 rounded-full bg-emerald-500 animate-ping" />}
                            </div>
                        </div>
                        <div className="mt-2 text-[9px] font-black uppercase text-slate-600 bg-white/5 w-fit px-3 py-1.5 rounded-full border border-white/5 group-hover:border-emerald-500/20 group-hover:text-emerald-400 transition-colors">Real-time Stream</div>
                    </div>
                </motion.div>

                {/* Box 3: Top Mode Usage */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative overflow-hidden group p-8 sm:p-10 bg-slate-900 border border-white/5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl transition-all hover:scale-[1.02] hover:-translate-y-2 hover:border-indigo-500/30"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex flex-col gap-6">
                        <div className="w-16 h-16 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xl group-hover:scale-110">
                            <Radio size={28} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Top Mode Usage</p>
                            <h3 className="text-xl sm:text-2xl font-black tracking-tighter text-white truncate max-w-[200px]">{stats.top_mode || 'N/A'}</h3>
                        </div>
                        <div className="mt-2 text-[9px] font-black uppercase text-slate-600 bg-white/5 w-fit px-3 py-1.5 rounded-full border border-white/5 group-hover:border-indigo-500/20 group-hover:text-indigo-400 transition-colors">Most Frequent Setting</div>
                    </div>
                </motion.div>
            </div>

            {!fetching && orgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 sm:py-40 px-6 text-center bg-white/[0.01] border border-white/5 rounded-[40px] sm:rounded-[64px] shadow-2xl backdrop-blur-xl group relative overflow-hidden">
                    <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="w-24 h-24 sm:w-32 sm:h-32 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-8 sm:mb-10 border border-indigo-500/20 shadow-2xl relative z-10">
                        <Building2 size={40} className="text-indigo-400 sm:w-12 sm:h-12" />
                    </div>
                    <h2 className="text-3xl sm:text-5xl font-black mb-4 sm:mb-6 tracking-tight">Account Setup</h2>
                    <p className="text-slate-500 text-sm sm:text-lg max-w-lg mx-auto mb-10 sm:mb-12 font-bold uppercase tracking-widest leading-relaxed">Workspace required to start meetings</p>
                    <button
                        onClick={() => navigate('/organizations')}
                        className="px-10 py-5 bg-white text-black hover:bg-indigo-600 hover:text-white rounded-2xl font-black shadow-2xl hover:shadow-indigo-500/40 transition-all flex items-center gap-4 active:scale-95 text-xs sm:text-sm uppercase tracking-widest relative z-10"
                    >
                        <Plus size={20} /> Setup Workspace
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 items-start">
                    
                    {/* Room List Section */}
                    <div className="order-2 lg:order-1 lg:col-span-12 space-y-8 sm:space-y-12 w-full">
                        <div className="flex flex-col sm:flex-row items-center sm:justify-between bg-slate-900/40 border border-white/5 rounded-3xl p-6 sm:p-8 px-8 sm:px-10 hover:bg-slate-900/60 transition-all gap-6 backdrop-blur-md relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500/50" />
                            <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-500/10 rounded-2xl sm:rounded-3xl flex items-center justify-center text-indigo-400 shadow-inner shrink-0 border border-indigo-500/20">
                                    <Video size={24} className="sm:w-8 sm:h-8" />
                                </div>
                                <div className="space-y-0.5">
                                    <h2 className="text-xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
                                        Running Meetings
                                        {rooms.length > 0 && <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/20">{rooms.length}</span>}
                                    </h2>
                                    <p className="text-[10px] sm:text-xs text-slate-500 font-black uppercase tracking-[0.2em]">Active Meeting Rooms</p>
                                </div>
                            </div>
                            <button
                                onClick={loadData}
                                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 border border-white/10 transition-all active:scale-95 ${fetching ? 'animate-pulse' : ''}`}
                            >
                                <Activity size={14} className={fetching ? 'animate-spin' : ''} />
                                {fetching ? 'Syncing...' : 'Re-Sync'}
                            </button>
                        </div>

                        {fetching && rooms.length === 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-64 sm:h-72 bg-white/[0.01] rounded-[40px] border border-white/5 p-8 flex flex-col gap-6 animate-pulse">
                                        <div className="flex justify-between">
                                            <div className="w-14 h-14 bg-white/5 rounded-2xl" />
                                            <div className="w-24 h-8 bg-white/5 rounded-full" />
                                        </div>
                                        <div className="w-3/4 h-8 bg-white/5 rounded-xl" />
                                        <div className="w-full h-12 bg-white/5 rounded-2xl mt-auto" />
                                    </div>
                                ))}
                            </div>
                        ) : rooms.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-slate-900/10 border border-white/5 border-dashed rounded-[48px] p-20 sm:p-32 text-center backdrop-blur-sm"
                            >
                                <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white/[0.02] rounded-[40px] flex items-center justify-center mx-auto mb-10 shadow-2xl group transition-all hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/20">
                                    <Radio className="text-slate-700 group-hover:text-indigo-400 transition-all" size={32} />
                                </div>
                                <h3 className="text-2xl font-black text-slate-200 mb-4 tracking-tight">No Active Meetings</h3>
                                <p className="text-slate-500 text-xs sm:text-sm max-w-sm mx-auto font-bold uppercase tracking-widest opacity-60">Start a meeting to begin</p>
                            </motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                                {rooms.map((room, idx) => (
                                    <motion.div
                                        key={room.id}
                                        initial={{ opacity: 0, y: 30 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: idx * 0.05, duration: 0.5 }}
                                        whileHover={{ y: -8, transition: { duration: 0.2 } }}
                                        className="group bg-slate-900/40 backdrop-blur-md border border-white/5 hover:border-indigo-500/50 rounded-[40px] p-6 sm:p-8 transition-all hover:bg-slate-900/80 shadow-2xl relative overflow-hidden flex flex-col min-h-[260px] sm:min-h-[280px] w-full smooth-render"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[50px] rounded-full -mr-12 -mt-12 group-hover:bg-indigo-600/10 transition-colors pointer-events-none" />

                                        <div className="mb-6 sm:mb-10 flex justify-between items-start relative z-10">
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-950 rounded-2xl sm:rounded-3xl flex items-center justify-center border border-white/5 group-hover:border-indigo-500/40 group-hover:bg-indigo-500/10 transition-all shadow-2xl shrink-0">
                                                <Video className="text-slate-600 group-hover:text-indigo-400 transition-colors w-6 h-6 sm:w-8 sm:h-8" />
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {botStatuses[room.id] ? (
                                                    <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-indigo-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.3)] backdrop-blur-md">
                                                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                                        AI Active
                                                    </div>
                                                ) : (
                                                    <div className="px-3 py-1 bg-white/5 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/5">
                                                        Idle
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-indigo-400 transition-colors line-clamp-2 tracking-tighter mb-4">{room.name}</h3>

                                        <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2 text-slate-500 shrink-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">ID: {room.id.substring(0,6)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleGenerateInvite(room)}
                                                    className="p-3.5 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all border border-white/5 active:scale-90 group/btn"
                                                    title="Invite Guest"
                                                >
                                                    <Link2 size={16} className="group-hover/btn:rotate-12 transition-transform" />
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/room/${room.id}`)}
                                                    className="px-6 py-3.5 bg-white text-black hover:bg-indigo-600 hover:text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl active:scale-95 flex items-center gap-3"
                                                >
                                                    Join
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create Room Modal */}
            <AnimatePresence>
                {createModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-slate-900 border border-white/10 rounded-[32px] p-8 sm:p-12 w-full max-w-xl shadow-3xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] -mr-32 -mt-32 rounded-full pointer-events-none" />
                            
                            <div className="flex items-center gap-5 mb-10">
                                <div className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center shadow-2xl">
                                    <Plus size={28} className="font-black" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black tracking-tight">Create Room</h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Launch a new translation session</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreateRoom} className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Meeting Name</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Enter meeting name..."
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-6 py-5 focus:ring-2 focus:ring-indigo-500/30 outline-none text-white font-bold placeholder-slate-700 transition-all shadow-inner"
                                        value={newRoomName}
                                        onChange={e => setNewRoomName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block mb-2">Host Language</label>
                                    <select
                                        value={primaryLang}
                                        onChange={(e) => setPrimaryLang(e.target.value)}
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500/30 outline-none text-white font-bold transition-all shadow-inner appearance-none cursor-pointer"
                                    >
                                        {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-slate-900">{l.label}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block mb-3">Target Translations</label>
                                    <div className="flex flex-wrap gap-2 p-4 bg-slate-950/50 rounded-2xl border border-white/10 max-h-40 overflow-y-auto custom-scrollbar">
                                        {LANGUAGES.filter(l => l.code !== primaryLang).map(l => (
                                            <button
                                                key={l.code}
                                                type="button"
                                                onClick={() => handleTargetToggle(l.code)}
                                                className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                    targetLangs.includes(l.code)
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                                                        : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                                                }`}
                                            >
                                                {l.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setCreateModal(false)}
                                        className="flex-1 py-5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-2xl hover:bg-indigo-500 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60"
                                    >
                                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Start Meeting"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Invite Modal Refined */}
            <AnimatePresence>
                {inviteModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-xl"
                        onClick={() => setInviteModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-slate-900 border border-white/10 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 w-full max-w-lg shadow-3xl relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-indigo-500/10 blur-[40px] sm:blur-[60px] -mr-16 -mt-16 sm:-mr-24 sm:-mt-24 rounded-full pointer-events-none" />

                            <h3 className="text-2xl sm:text-3xl font-black mb-1 sm:mb-2 tracking-tight">Add Guests</h3>
                            <p className="text-slate-500 text-xs sm:text-sm mb-6 sm:mb-8 font-medium">Generate permissions-based access links for your session.</p>

                            <div className="space-y-4 sm:space-y-6">
                                <div className="space-y-2 sm:space-y-3">
                                    <label className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Access Level</label>
                                    <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 bg-indigo-600/10 border border-indigo-500/30 rounded-[24px] sm:rounded-[32px] shadow-lg">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-500 text-white rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                            <Zap size={16} className="sm:w-[18px] sm:h-[18px]" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white leading-tight block">Full Speaker Access</span>
                                            <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-tighter leading-tight mt-0.5">Voice & Audio Translation Enabled</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 sm:space-y-3">
                                    <label className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Meeting Link</label>
                                    <div className="flex items-center gap-2 sm:gap-3 bg-slate-950 border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-5 shadow-inner group">
                                        <span className="text-[10px] sm:text-xs text-slate-500 overflow-x-auto whitespace-nowrap scrollbar-hide flex-1 font-mono tracking-tighter">{inviteModal.url}</span>
                                        <button
                                            onClick={copyLink}
                                            className="p-1.5 sm:p-2 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl transition-colors text-indigo-400 shrink-0 border border-white/5 hover:border-indigo-500/30 active:scale-95"
                                        >
                                            {copied ? <CheckCheck size={16} className="text-emerald-400 sm:w-5 sm:h-5" /> : <Copy size={16} className="sm:w-5 sm:h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setInviteModal(null)}
                                    className="w-full py-4 sm:py-5 bg-white/5 hover:bg-white/10 rounded-[16px] sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] text-slate-300 transition-all focus:outline-none"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
