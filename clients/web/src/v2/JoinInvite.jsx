import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Link2, User, UserPlus, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { invitationService } from '../services/api';
import { useAuthStore } from '../store/authStore';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'wss://aytme-56n8aplm.livekit.cloud';

const normalizeMode = (rawMode) => {
  const mode = String(rawMode || '').toLowerCase().trim();
  if (!mode) return 'conversation';
  if (mode === 'group') return 'talk_together';
  return mode;
};

const guestRoomCacheKey = (roomId) => `aytme_guest_room_details_${roomId}`;

const buildGuestRoomUrl = ({ roomId, role, mode, livekitToken, livekitUrl }) => {
  const params = new URLSearchParams();
  params.set('guest', 'true');
  params.set('token', livekitToken);
  if (livekitUrl) params.set('livekit_url', livekitUrl);
  if (role) params.set('role', role);
  if (mode) params.set('mode', mode);
  return `/v2/room/${roomId}?${params.toString()}`;
};


export default function JoinInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();

  const [invite, setInvite] = useState(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isJoiningGuest, setIsJoiningGuest] = useState(false);
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const hasRedirected = useRef(false);

  const roomMode = useMemo(() => normalizeMode(invite?.mode), [invite?.mode]);

  useEffect(() => {
    if (user?.full_name && !guestName) {
      setGuestName(user.full_name);
    }
  }, [user, guestName]);

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link.');
      setIsValidating(false);
      return;
    }

    const validate = async () => {
      setIsValidating(true);
      setError('');
      try {
        const data = await invitationService.validateToken(token);
        setInvite(data);
      } catch (err) {
        console.error('[JoinInvite] Invite validation failed:', err);
        setError(err?.response?.data?.detail || 'This invite link is invalid or expired.');
      } finally {
        setIsValidating(false);
      }
    };

    validate();
  }, [token]);

  useEffect(() => {
    if (authLoading || isValidating || !invite || !isAuthenticated || hasRedirected.current) return;
    hasRedirected.current = true;

    const mode = normalizeMode(invite.mode);
    const isOwner = user?.id && invite.owner_id && String(invite.owner_id) === String(user.id);
    if (isOwner) {
      const params = new URLSearchParams();
      if (mode) params.set('mode', mode);
      params.set('role', 'speaker');
      params.set('auto_join', '1');
      navigate(`/v2/room/${invite.room_id}?${params.toString()}`, { replace: true });
      return;
    }
    sessionStorage.setItem('aytme_last_invite', JSON.stringify({
      token,
      room_id: invite.room_id,
      role: invite.role,
      mode,
      room_name: invite.room_name,
      primary_lang: invite.primary_lang,
      secondary_lang: invite.secondary_lang,
      joined_as: 'authenticated',
      timestamp: Date.now()
    }));

    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    // If the authenticated user is the room owner, always join as speaker (host)
    const effectiveRole = isOwner ? 'speaker' : (invite.role || 'speaker');
    params.set('role', effectiveRole);
    navigate(`/v2/room/${invite.room_id}?${params.toString()}`, { replace: true });
  }, [authLoading, invite, isAuthenticated, isValidating, navigate, token, user]);

  const handleJoinAsGuest = async () => {
    if (!invite?.room_id || !token) return;

    const displayName = guestName.trim();
    if (!displayName) {
      toast.error('Please enter a display name to continue.');
      return;
    }

    setIsJoiningGuest(true);
    try {
      const joinData = await invitationService.joinWithToken(token, displayName);
      const mode = normalizeMode(joinData.mode || invite.mode);
      const roomId = joinData.room_id || invite.room_id;
      const role = joinData.role || invite.role || 'listener';
      const livekitToken = joinData.token;
      const livekitUrl = joinData.livekit_url || LIVEKIT_URL;

      if (!livekitToken) {
        throw new Error('Invite join did not return a LiveKit token.');
      }

      const guestRoomDetails = {
        id: roomId,
        owner_id: null,
        name: joinData.room_name || invite.room_name || 'Conference Room',
        mode,
        primary_lang: joinData.primary_lang || invite.primary_lang || null,
        secondary_lang: joinData.secondary_lang || invite.secondary_lang || null,
      };

      sessionStorage.setItem(guestRoomCacheKey(roomId), JSON.stringify(guestRoomDetails));
      sessionStorage.setItem('aytme_last_invite', JSON.stringify({
        token,
        room_id: roomId,
        role,
        mode,
        room_name: guestRoomDetails.name,
        primary_lang: guestRoomDetails.primary_lang,
        secondary_lang: guestRoomDetails.secondary_lang,
        joined_as: 'guest',
        timestamp: Date.now()
      }));

      if (joinData.access_token) {
        sessionStorage.setItem('token', joinData.access_token);
      }

      navigate(buildGuestRoomUrl({
        roomId,
        role,
        mode,
        livekitToken,
        livekitUrl
      }), { replace: true });
    } catch (err) {
      console.error('[JoinInvite] Guest join failed:', err);
      toast.error(err?.response?.data?.detail || 'Unable to join room as guest.');
    } finally {
      setIsJoiningGuest(false);
    }
  };

  const handleCreateAccount = () => {
    const returnTo = `/invite/${token}`;
    navigate(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
  };

  if (authLoading || isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-v2-bg p-6">
        <div className="v2-card max-w-md w-full text-center space-y-5">
          <Loader2 className="mx-auto animate-spin text-v2-accent" size={36} />
          <div>
            <h1 className="text-2xl font-bold">Validating Invite</h1>
            <p className="text-v2-muted text-sm mt-1">Checking room access and preparing your join options.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-v2-bg p-6">
        <div className="v2-card max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
            <Link2 size={22} />
          </div>
          <h1 className="text-2xl font-bold">Invite Unavailable</h1>
          <p className="text-v2-muted text-sm">{error || 'This invite is no longer valid.'}</p>
          <button onClick={() => navigate('/')} className="v2-btn w-full">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v2-bg flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-xl v2-card space-y-6 md:space-y-7">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-v2-accent/10 text-v2-accent flex items-center justify-center">
            <Link2 size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Join Session</h1>
          <p className="text-v2-muted text-sm md:text-base">You were invited to a live translation room.</p>
        </div>

        <div className="rounded-xl border border-v2-border bg-v2-header/60 p-4 space-y-2">
          <h2 className="text-lg font-bold text-v2-text">{invite.room_name || 'Conference Room'}</h2>
          <div className="text-xs text-v2-muted uppercase tracking-widest font-bold">Mode: {roomMode.replace('_', ' ')}</div>
          <div className="text-sm text-v2-text">
            {invite.primary_lang || 'Unknown'}
            {invite.secondary_lang ? ` to ${invite.secondary_lang}` : ''}
          </div>
        </div>

        {!isAuthenticated && (
          <div className="space-y-3">
            <label className="v2-label">Join as Guest</label>
            <div className="relative">
              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" />
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Enter your display name"
                className="v2-input pl-12"
                maxLength={64}
              />
            </div>
            <button
              onClick={handleJoinAsGuest}
              disabled={isJoiningGuest}
              className="v2-btn w-full flex items-center justify-center gap-2"
            >
              {isJoiningGuest ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {isJoiningGuest ? 'Joining...' : 'Join as Guest'}
            </button>
          </div>
        )}

        {!isAuthenticated && (
          <button
            onClick={handleCreateAccount}
            className="w-full py-3.5 border border-v2-border rounded-xl font-bold text-v2-text hover:bg-v2-header transition-all flex items-center justify-center gap-2"
          >
            <UserPlus size={18} />
            Create Account
          </button>
        )}

        {isAuthenticated && (
          <p className="text-center text-v2-muted text-sm">Account recognized. Redirecting you to the room...</p>
        )}
      </div>
    </div>
  );
}
