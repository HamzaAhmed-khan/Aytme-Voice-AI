import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomService } from '../services/api';
import { useOrganizationStore } from '../store/organizationStore';
import toast from 'react-hot-toast';
import { 
  Users, Sparkles, ArrowRight, 
  Settings2, Globe2, Share2, Shield
} from 'lucide-react';
import { LANGUAGES } from './languages';

export default function ModeGroup() {
  const navigate = useNavigate();
  const { currentOrg } = useOrganizationStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: 'Group Session',
    primaryLang: 'English',
    secondaryLang: 'French',
    limit: 10
  });

  const languages = LANGUAGES;

  const handleStart = async (e, autoJoin) => {
    e.preventDefault();
    if (!currentOrg) {
      toast.error('Please select an organization first');
      return;
    }

    setLoading(true);
    try {
      const room = await roomService.createRoom({
        name: formData.name,
        org_id: currentOrg.id,
        mode: 'talk_together',
        primary_lang: formData.primaryLang,
        secondary_lang: formData.secondaryLang,
        policy: { intent_mode: 'talk_together' }
      });
      
      if (autoJoin) {
        // Navigate to stage with group intent
        navigate(`/v2/room/${room.id}?mode=group&role=speaker`);
      } else {
        toast.success('Group session created! You can join it later from the Rooms tab.');
        navigate('/v2/rooms');
      }
    } catch (err) {
      const code = err.response?.data?.detail?.code;
      if (code === 'QUOTA_EXCEEDED') {
        // QuotaLimitModal already shown by the global API interceptor — suppress toast
      } else if (!err.response) {
        toast.error('Connection error — check your internet and try again');
      } else if (code === 'SUBSCRIPTION_REQUIRED') {
        toast.error('An active subscription is required. Please select a plan.');
      } else if (code === 'SUBSCRIPTION_EXPIRED') {
        toast.error('Your subscription has expired. Please renew to continue.');
      } else {
        const msg = err.response?.data?.detail?.message || err.message;
        toast.error(msg ? `Error: ${msg}` : 'Failed to initialize group session. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="v2-page max-w-4xl mx-auto space-y-12 py-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-v2-accent/10 border border-v2-accent/20 text-v2-accent text-[11px] font-bold uppercase tracking-widest">
          <Users size={14} />
          Group Session
        </div>
        <h1 className="text-5xl font-bold tracking-tighter text-v2-text uppercase">Talk Together</h1>
        <p className="text-v2-muted max-w-xl mx-auto font-medium">
          Use one device to one speaker one listener. Take turns speaking and listening.
          Ideal for asking directions or having a quick and short conversation.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        <form onSubmit={handleStart} className="md:col-span-7 v2-card space-y-8 p-10 shadow-2xl">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="v2-label flex items-center gap-2">
                <Settings2 size={14} /> Session Name
              </label>
              <input 
                type="text" 
                className="v2-input h-14 text-lg font-semibold"
                placeholder="e.g. Weekly Sync"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="v2-label flex items-center gap-2">
                  <Globe2 size={14} /> Organization Lang
                </label>
                <select 
                  className="v2-input h-14"
                  value={formData.primaryLang}
                  onChange={e => setFormData({...formData, primaryLang: e.target.value})}
                >
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="v2-label flex items-center gap-2">
                  <Globe2 size={14} /> Bridge Language
                </label>
                <select 
                  className="v2-input h-14 text-v2-accent font-bold"
                  value={formData.secondaryLang}
                  onChange={e => setFormData({...formData, secondaryLang: e.target.value})}
                >
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Participant limit removed for single device mode */}
          </div>

          <div className="flex gap-4">
            <button 
              type="button" 
              onClick={(e) => handleStart(e, true)}
              disabled={loading}
              className="v2-btn flex-1 py-5 text-lg flex items-center justify-center gap-3 group"
            >
              {loading ? 'Initializing...' : 'Create & Join'}
              {!loading && <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />}
            </button>

            <button 
              type="button" 
              onClick={(e) => handleStart(e, false)}
              disabled={loading}
              className="px-8 py-5 bg-v2-header border border-v2-border hover:border-v2-accent/50 text-v2-muted hover:text-v2-text rounded-xl font-bold uppercase tracking-widest text-sm transition-all shadow-sm"
            >
              Create Only
            </button>
          </div>
        </form>

        <div className="md:col-span-5 space-y-6">
          <div className="v2-card bg-indigo-50/50 border-indigo-100 p-6 shadow-glow shadow-v2-accent/5">
            <h3 className="text-indigo-700 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
              <Users size={14} /> How It Works
            </h3>
            <p className="text-sm text-indigo-900/70 leading-relaxed font-medium">
              Use one device with one speaker and one listener. Take turns speaking and listening — press the microphone button to speak, and the AI will automatically translate your speech. Ideal for asking directions or having a quick and short conversation.
            </p>
          </div>

          <div className="v2-card bg-orange-50/50 border-orange-100 p-6">
            <h3 className="text-orange-700 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
              <Shield size={14} /> Guardrails
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3 text-sm text-orange-900/70 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                Auto-moderation enabled
              </li>
              <li className="flex gap-3 text-sm text-orange-900/70 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                Noise suppression active
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
