import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { roomService } from '../services/api';
import Stage from './Stage';
import Listener from './Listener';
import { Loader2 } from 'lucide-react';

const normalizeMode = (rawMode) => {
    const mode = String(rawMode || '').toLowerCase().trim();
    if (!mode) return null;
    if (mode === 'group') return 'talk_together';
    return mode;
};

const getGuestRoomDetails = (roomId) => {
    if (!roomId) return null;
    try {
        const raw = sessionStorage.getItem(`aytme_guest_room_details_${roomId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[V2RoomRouter] Failed to parse guest room details from session storage', err);
        return null;
    }
};

export default function V2RoomRouter() {
    const { roomId } = useParams();
    const location = useLocation();
    const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const roleFromQuery = query.get('role');
    const modeFromQuery = normalizeMode(query.get('mode'));

    const isGuestFlag = query.get('guest') === 'true';
    const guestLkToken = query.get('token');
    const guestLkUrl = query.get('livekit_url');
    const isGuestJoin = isGuestFlag && !!guestLkToken;
    const guestRoomDetails = useMemo(() => getGuestRoomDetails(roomId), [roomId]);

    // Legacy share links looked like /v2/room/:id?token=<invite_token>.
    // Redirect them to the new invite flow.
    const legacyInviteToken = !isGuestFlag && query.get('token');

    useEffect(() => {
        if (isGuestJoin) {
            setLoading(false);
            return;
        }

        if (!isAuthenticated) {
            setLoading(false);
            return;
        }

        const loadRoom = async () => {
            try {
                const data = await roomService.getRoom(roomId);
                setRoom(data);
            } catch (err) {
                console.error("Failed to load room in router", err);
            } finally {
                setLoading(false);
            }
        };
        loadRoom();
    }, [roomId, isAuthenticated, isGuestJoin]);

    if (authLoading || loading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-v2-background gap-4">
                <Loader2 size={40} className="text-v2-accent animate-spin" />
                <p className="text-v2-muted text-xs font-bold uppercase tracking-widest">Routing Session...</p>
            </div>
        );
    }

    // Determine if the current session is a Guest session (either via URL or identity prefix)
    const isGuest = isGuestJoin || (user && (user.role?.toLowerCase() === 'guest' || user.email?.includes('@guest.aytme')));

    if (legacyInviteToken && !query.get('livekit_url')) {
        return <Navigate to={`/invite/${legacyInviteToken}`} replace />;
    }

    // --- GUEST JOIN PATH ---
    // Guest joins are mode-aware: broadcast listeners go to Listener, others go to Stage.
    if (isGuestJoin) {
        const guestMode = modeFromQuery || normalizeMode(guestRoomDetails?.mode);
        const guestRole = roleFromQuery || 'listener';
        const guestProps = {
            roomId,
            guestLkToken,
            guestLkUrl,
            guestRoomDetails,
        };

        if (guestMode === 'broadcast' && guestRole !== 'speaker') {
            return <Listener {...guestProps} />;
        }
        return <Stage {...guestProps} />;
    }

    // --- AUTHENTICATED USER PATH ---
    if (!isAuthenticated) return <Navigate to="/login" />;
    
    // Render immersive components without layout to prevent mobile cutoff and layout interference
    const renderImmersive = (Component, props) => {
        return <Component {...props} />;
    };

    if (!room) {
        // If it's a guest session that lost its query params, don't send to dashboard!
        if (isGuest) return <Navigate to="/" />;
        return <Navigate to="/dashboard" />;
    }

    // Logic: Determine component based on mode + role.
    // - Broadcast mode: speakers → Stage, listeners → Listener
    // - Conversation & Talk Together: ALL participants → Stage (everyone needs mic + controls)
    const isOwner = room.owner_id === user?.id;
    const isAdmin = user?.role === 'admin';
    const inferredMode = modeFromQuery || normalizeMode(room.mode);
    const finalRole = roleFromQuery || (isOwner || isAdmin ? 'speaker' : 'speaker'); // Default to speaker for non-broadcast

    // Only broadcast listeners go to the passive Listener component
    if (inferredMode === 'broadcast' && finalRole === 'listener' && !(isOwner || isAdmin)) {
        return renderImmersive(Listener, { roomId });
    }

    // Everyone else (speakers, conversation participants, talk_together participants) → Stage
    return renderImmersive(Stage, { roomId });
}

