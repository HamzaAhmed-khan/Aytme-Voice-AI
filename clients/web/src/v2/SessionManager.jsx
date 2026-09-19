import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useOrganizationStore } from '../store/organizationStore';
import { roomService, adminService, invitationService } from '../services/api';
import { buildInviteLink } from '../utils/shareLinks';
import toast from 'react-hot-toast';
import { Activity, TrendingUp, Zap, Shield, Users, DollarSign } from 'lucide-react';
import { LANGUAGES } from './languages';

export default function SessionManager() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState('Translation Session');
  const [primaryLang, setPrimaryLang] = useState('English');
  const [secondaryLang, setSecondaryLang] = useState('Spanish');
  const [speakerId, setSpeakerId] = useState('speaker1');
  const [listenerId, setListenerId] = useState('listener1');
  const [rooms, setRooms] = useState([]);
  const [links, setLinks] = useState({ speaker: '', listener: '' });
  const [loading, setLoading] = useState(false);
  const [adminStats, setAdminStats] = useState(null);

  const { currentOrg, fetchOrganizations } = useOrganizationStore();

  useEffect(() => {
    if (!currentOrg) {
      fetchOrganizations();
    }
    fetchRooms();
    if (user?.role?.toLowerCase().trim() === 'admin') {
      fetchAdminStats();
    }
  }, [currentOrg, user]);

  const fetchAdminStats = async () => {
    try {
      const [rev, health] = await Promise.all([
        adminService.getRevenue(),
        adminService.getSystemHealth()
      ]);
      setAdminStats({ revenue: rev, health });
    } catch (error) {
      console.error('Failed to fetch admin stats', error);
    }
  };

  const fetchRooms = async () => {
    try {
      const data = await roomService.listRooms();
      setRooms(data || []);
      if (data?.length > 0) {
        const latest = data[0];
        setSessionName(latest.name);
        updateLinks(latest.id);
      }
    } catch (error) {
      console.error('Failed to fetch rooms', error);
    }
  };

  const updateLinks = async (id) => {
    try {
      const [speakerInv, listenerInv] = await Promise.all([
        invitationService.createInvite(id, 'speaker', 10, 72),
        invitationService.createInvite(id, 'listener', 100, 72),
      ]);
      setLinks({
        speaker: buildInviteLink(speakerInv.token || speakerInv.id),
        listener: buildInviteLink(listenerInv.token || listenerInv.id),
      });
    } catch (err) {
      console.warn('[SessionManager] Invite generation failed, using fallback URLs:', err);
      const origin = window.location.origin;
      setLinks({
        speaker: `${origin}/v2/room/${id}?role=speaker`,
        listener: `${origin}/v2/room/${id}?role=listener`,
      });
    }
  };

  const handleOpenBilling = () => {
    navigate('/v2/billing');
  };

  const handleCreateUpdate = async () => {
    if (!currentOrg) {
      toast.error('No organization selected');
      return;
    }
    setLoading(true);
    try {
      // Check if room already exists by name
      const existing = rooms.find(r => r.name === sessionName);
      
      if (existing) {
        // UPDATE existing room
        await roomService.updateRoom(existing.id, {
          primary_lang: primaryLang,
          secondary_lang: secondaryLang
        });
        toast.success('Session settings updated');
      } else {
        // CREATE new room
        const newRoom = await roomService.createRoom({
          name: sessionName,
          org_id: currentOrg.id,
          primary_lang: primaryLang,
          secondary_lang: secondaryLang
        });
        updateLinks(newRoom.id);
        toast.success('New session created');
      }
      fetchRooms();
    } catch (error) {
      console.error('Failed to save session:', error);
      toast.error('Failed to save session settings');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="v2-app p-4 md:p-8">
      <header className="v2-header">
        <h1 className="text-4xl font-bold">Translation Session Manager</h1>
        <p className="text-v2-muted">Create reusable speaker + listener links</p>
        <div className="flex gap-4 mt-4">
          <span className="v2-badge v2-badge-active">Repeat: Always available</span>
          <span className="v2-badge">Speaker-only billing</span>
        </div>
      </header>

      {/* Admin Quick Metrics */}
      {user?.role?.toLowerCase().trim() === 'admin' && adminStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-v2-header border border-v2-border p-4 rounded-lg backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-v2-muted uppercase tracking-wider">MRR Revenue</span>
              <DollarSign size={14} className="text-green-400" />
            </div>
            <p className="text-2xl font-semibold text-v2-text">${adminStats.revenue?.mrr?.toLocaleString() || '0'}</p>
            <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
              <TrendingUp size={10} /> +12% this month
            </p>
          </div>
          <div className="bg-v2-header border border-v2-border p-4 rounded-lg backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-v2-muted uppercase tracking-wider">Active Users</span>
              <Users size={14} className="text-v2-accent" />
            </div>
            <p className="text-2xl font-semibold text-v2-text">{adminStats.revenue?.active_subscriptions || '0'}</p>
            <p className="text-[10px] text-v2-muted mt-1">Paying customers</p>
          </div>
          <div className="bg-v2-header border border-v2-border p-4 rounded-lg backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-v2-muted uppercase tracking-wider">Worker Load</span>
              <Zap size={14} className="text-yellow-400" />
            </div>
            <p className="text-2xl font-semibold text-v2-text">
              {adminStats.health?.workers?.active || '0'}/{adminStats.health?.workers?.total || '0'}
            </p>
            <p className="text-[10px] text-v2-muted mt-1">Available capacity</p>
          </div>
          <div className="bg-v2-header border border-v2-border p-4 rounded-lg backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-v2-muted uppercase tracking-wider">System Health</span>
              <Activity size={14} className="text-indigo-400" />
            </div>
            <p className="text-2xl font-semibold text-v2-text">99.9%</p>
            <p className="text-[10px] text-indigo-400 mt-1">All systems operational</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Session Setup */}
        <div className="v2-card">
          <h2 className="text-2xl font-bold mb-6">Session Setup</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="smSessionName" className="v2-label">Session name</label>
              <input 
                id="smSessionName"
                type="text" className="v2-input" 
                value={sessionName} onChange={(e) => setSessionName(e.target.value)} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="smPrimaryLang" className="v2-label">Primary language</label>
                <input 
                  id="smPrimaryLang"
                  type="text" className="v2-input" 
                  value={primaryLang} onChange={(e) => setPrimaryLang(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="smSecondaryLang" className="v2-label">Secondary language</label>
                <input 
                  id="smSecondaryLang"
                  type="text" className="v2-input" 
                  value={secondaryLang} onChange={(e) => setSecondaryLang(e.target.value)} 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="smSpeakerId" className="v2-label">Speaker user id</label>
                <input 
                  id="smSpeakerId"
                  type="text" className="v2-input" 
                  value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="smListenerId" className="v2-label">Listener user id</label>
                <input 
                  id="smListenerId"
                  type="text" className="v2-input" 
                  value={listenerId} onChange={(e) => setListenerId(e.target.value)} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Links */}
          <div className="v2-card">
            <h2 className="text-2xl font-bold mb-6">Links</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="smSpeakerLink" className="v2-label">Speaker link (copy)</label>
                <div className="flex gap-2">
                  <input id="smSpeakerLink" type="text" className="v2-input bg-white" readOnly value={links.speaker} />
                  <button onClick={() => copyToClipboard(links.speaker)} className="v2-btn-secondary px-4 rounded-md">Copy</button>
                </div>
              </div>
              <div>
                <label htmlFor="smListenerLink" className="v2-label">Listener link (share once)</label>
                <div className="flex gap-2">
                  <input id="smListenerLink" type="text" className="v2-input bg-white" readOnly value={links.listener} />
                  <button onClick={() => copyToClipboard(links.listener)} className="v2-btn-secondary px-4 rounded-md">Copy</button>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => copyToClipboard(links.listener)} className="v2-btn-secondary flex-1">Copy listener link</button>
                <button onClick={handleCreateUpdate} className="v2-btn flex-1">Create / Update</button>
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="v2-card">
            <h2 className="text-2xl font-bold mb-2">Billing</h2>
            <p className="text-v2-muted mb-4">Free trial: 30 days • price set by admin</p>
            <div className="flex justify-end">
              <button onClick={handleOpenBilling} className="v2-btn-secondary">Open Billing</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
