import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { roomService } from '../services/api';
import { useRoomStore } from '../store/roomStore';
import { useOrganizationStore } from '../store/organizationStore';
import { Activity, Radio, Users, MessageSquare, Plus, Clock, Video, ArrowRight, Trash2, AlertTriangle, X } from 'lucide-react';
import InstallButton from '../components/shared/InstallButton';
import toast from 'react-hot-toast';
import QuotaLimitModal from '../components/QuotaLimitModal';
import { AnimatePresence, motion } from 'framer-motion';

export default function DashboardHome() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const { deleteRoom } = useRoomStore();

    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [quotaModal, setQuotaModal] = useState({ open: false, info: null });
    const [showExpiryBanner, setShowExpiryBanner] = useState(true);



    const isRestricted = useOrganizationStore(s => s.isRestricted);
    const subscription = useOrganizationStore(s => s.subscription);

    const checkRestrictedAction = (callback) => {
        if (isRestricted()) {
            setQuotaModal({
                open: true,
                info: {
                    type: subscription?.status === 'trialing' ? 'trial_ended' : 'subscription_expired',
                    limit: subscription?.minutes_total || 60,
                    current: subscription?.minutes_used || 0
                }
            });
            return false;
        }
        callback();
        return true;
    };

    const fetchDashboardData = async () => {
        try {
            const data = await roomService.listRooms();
            setRooms(data || []);
        } catch (err) {
            console.warn('Dashboard metrics load failed:', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const handleDeleteRoom = async (e, roomId) => {
        e.stopPropagation();
        if (!window.confirm('Delete this room session?')) return;
        try {
            await deleteRoom(roomId);
            toast.success('Room deleted');
            fetchDashboardData(); // Refresh
        } catch (err) {
            toast.error('Failed to delete room');
        }
    };

    const activeSessions = rooms.filter(r => r.policy?.current_mode && !r.ended_at).length;
    const totalSessions = rooms.length;

    const modeCounts = rooms.reduce((acc, r) => {
        const m = r.policy?.current_mode || 'unknown';
        acc[m] = (acc[m] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="v2-page space-y-8 pb-20 animate-in fade-in duration-700">
            {/* Header */}
            <header className="space-y-1">
                <div className="flex items-center gap-2 text-v2-accent font-bold uppercase tracking-[0.2em] text-[10px]">
                    <Activity size={12} strokeWidth={3} />
                    Overview
                </div>
                <h1 className="text-4xl font-semibold text-v2-text tracking-tighter uppercase">
                    Welcome back, <span className="text-v2-accent">{user?.full_name?.split(' ')[0] || 'User'}</span>
                </h1>
                <p className="text-v2-muted text-sm max-w-2xl font-medium pt-1">
                    Monitor your translation activity, review past sessions, and launch new real-time rooms instantly.
                </p>
                <div className="pt-4">
                    <InstallButton />
                </div>
            </header>

            <AnimatePresence>
                {subscription?.is_expiring_soon && showExpiryBanner && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700"
                    >
                        <AlertTriangle size={16} className="shrink-0 text-amber-500" />
                        <p className="text-sm font-medium flex-1">
                            Your plan expires in <strong>{subscription.days_remaining} day{subscription.days_remaining !== 1 ? 's' : ''}</strong>.{' '}
                            <button onClick={() => navigate('/billing')} className="underline font-bold hover:text-amber-900">Renew now</button> to avoid service interruption.
                        </p>
                        <button onClick={() => setShowExpiryBanner(false)} className="text-amber-500 hover:text-amber-700 ml-2 shrink-0">
                            <X size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="flex items-center justify-center p-20">
                    <Activity size={32} className="text-v2-accent animate-spin" />
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Metrics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="v2-card group hover:border-v2-accent/40 transition-all">
                            <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Total Sessions</p>
                            <p className="text-4xl font-semibold tracking-tighter text-v2-text">{totalSessions}</p>
                            <p className="text-[10px] text-v2-muted mt-2">Historical rooms processed</p>
                        </div>
                        <div className="v2-card group hover:border-emerald-500/40 transition-all">
                            <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Active Now</p>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-4xl font-semibold tracking-tighter text-emerald-500">{activeSessions}</p>
                            </div>
                            <p className="text-[10px] text-v2-muted mt-2">Currently translating</p>
                        </div>
                        <div className="v2-card group hover:border-blue-500/40 transition-all">
                            <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Top Mode Usage</p>
                            <p className="text-2xl font-semibold tracking-tighter text-blue-500 uppercase mt-1">
                                {Object.keys(modeCounts).sort((a, b) => modeCounts[b] - modeCounts[a])[0] || 'N/A'}
                            </p>
                            <p className="text-[10px] text-v2-muted mt-2 truncate">Most frequently used environment</p>
                        </div>
                    </div>

                    {/* Quick Start Actions */}
                    <div>
                        <h2 className="text-lg font-semibold uppercase tracking-widest text-v2-text mb-4 flex items-center gap-2">
                            <Plus size={16} className="text-v2-accent" />
                            Launch New Session
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                            <button
                                onClick={() => checkRestrictedAction(() => navigate('/mode/conversation'))}
                                className="v2-card text-left hover:border-v2-accent/50 hover:bg-v2-accent/5 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-v2-accent/10 rounded-full blur-2xl group-hover:bg-v2-accent/20 transition-all" />
                                <div className="w-12 h-12 bg-v2-accent/10 rounded-lg flex items-center justify-center text-v2-accent mb-6 group-hover:scale-110 transition-transform">
                                    <MessageSquare size={24} />
                                </div>
                                <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text mb-2">Conversation</h3>
                                <p className="text-sm text-v2-muted font-medium pr-4">1-on-1 private translated conversations with two-way voice processing.</p>
                            </button>

                            <button
                                onClick={() => checkRestrictedAction(() => navigate('/mode/group'))}
                                className="v2-card text-left hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
                                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                                    <Users size={24} />
                                </div>
                                <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text mb-2">Talk Together</h3>
                                <p className="text-sm text-v2-muted font-medium pr-4">Use one device to one speaker one listener. Take turns speaking and listening. Ideal for asking directions or having a quick and short conversation.</p>
                            </button>

                            <button
                                onClick={() => checkRestrictedAction(() => navigate('/mode/broadcast'))}
                                className="v2-card text-left hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
                                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-500 mb-6 group-hover:scale-110 transition-transform">
                                    <Radio size={24} />
                                </div>
                                <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text mb-2">Broadcast</h3>
                                <p className="text-sm text-v2-muted font-medium pr-4">One speaker, massive audience. Live translated subtitles streamed globally.</p>
                            </button>
                        </div>
                    </div>

                    {/* Recent Rooms */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold uppercase tracking-widest text-v2-text flex items-center gap-2">
                                <Clock size={16} className="text-v2-muted" />
                                Recent Rooms
                            </h2>
                            <button onClick={() => navigate('/v2/rooms')} className="text-[10px] font-bold uppercase tracking-widest text-v2-accent hover:underline">Manage All Rooms</button>
                        </div>
                        <div className="v2-card overflow-hidden p-0">
                            {rooms.length === 0 ? (
                                <div className="p-8 text-center text-v2-muted text-sm font-medium">No recent sessions found.</div>
                            ) : (
                                <div className="divide-y divide-v2-border/30">
                                    {rooms.slice(0, 5).map(room => (
                                        <div
                                            key={room.id}
                                            onClick={() => checkRestrictedAction(() => navigate(`/v2/room/${room.id}?role=speaker${room.policy?.intent_mode ? `&mode=${room.policy.intent_mode}` : ''}`))}
                                            className="flex items-center justify-between p-4 hover:bg-v2-header/30 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-md bg-v2-header flex items-center justify-center text-v2-muted group-hover:text-v2-accent transition-colors">
                                                    <Video size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold tracking-tight text-v2-text group-hover:text-v2-accent transition-colors">{room.name}</p>
                                                    <p className="text-[10px] text-v2-muted font-mono uppercase mt-0.5 flex items-center gap-2">
                                                        {room.policy?.current_mode || 'Auto'}
                                                        {!room.ended_at && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-[10px] font-bold text-v2-text">{new Date(room.created_at).toLocaleDateString()}</p>
                                                    <p className="text-[9px] text-v2-muted uppercase tracking-widest font-black">{room.visibility || 'Private'}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => handleDeleteRoom(e, room.id)}
                                                        className="p-2 text-v2-muted hover:text-rose-500 transition-colors"
                                                        title="Delete Room"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    <div className="p-2 text-v2-muted group-hover:text-v2-accent group-hover:translate-x-1 transition-all">
                                                        <ArrowRight size={18} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                <QuotaLimitModal
                    isOpen={quotaModal.open}
                    onClose={() => setQuotaModal({ open: false, info: null })}
                    quotaInfo={quotaModal.info}
                />
            </AnimatePresence>


        </div>
    );
}
