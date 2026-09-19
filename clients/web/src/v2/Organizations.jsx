import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { organizationService, auditLogService, analyticsService, orgRolesService } from '../services/api';
import toast from 'react-hot-toast';
import {
 Building2, Users, UserPlus, Shield, BarChart3, Settings, Trash2,
 Crown, ChevronDown, Loader2, Plus, X, LogOut, ArrowRightLeft,
 ClipboardList, RefreshCw, CheckCircle2, AlertCircle, Mail, Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ROLE_COLORS = {
 owner: 'bg-amber-100 text-amber-700 border-amber-200',
 admin: 'bg-red-50 text-red-600 border-red-200',
 manager: 'bg-blue-50 text-blue-600 border-blue-200',
 member: 'bg-gray-100 text-gray-600 border-gray-200',
 viewer: 'bg-green-50 text-green-600 border-green-200',
};

const RoleBadge = ({ role }) => (
 <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${ROLE_COLORS[role] || ROLE_COLORS.member}`}>
 {role}
 </span>
);

const Avatar = ({ name, size = 8 }) => {
 const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
 const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-blue-500', 'bg-green-500'];
 const color = colors[initials.charCodeAt(0) % colors.length];
 return (
 <div className={`w-${size} h-${size} rounded-full ${color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
 {initials}
 </div>
 );
};

// ── Organization Plan Options ────────────────────────────────────
const ORG_PLANS = [
 {
  id: 'org_team', name: 'Team', price: '$49\u2013$99/mo',
  description: 'For small teams and departments',
  tag: 'Teams', tagColor: 'bg-indigo-500',
  users: '10\u201325 users', minutes: '2,500 shared minutes/mo',
  features: ['Team admin dashboard', 'Priority email support', 'Shared billing', 'Minutes shared across all members'],
 },
 {
  id: 'org_business', name: 'Business', price: '$199\u2013$499/mo',
  description: 'For growing organizations', popular: true,
  tag: 'Popular', tagColor: 'bg-emerald-500',
  users: '50\u2013200 users', minutes: '10,000 shared minutes/mo',
  features: ['Advanced analytics', 'Team admin dashboard', 'Priority email support', 'Minutes shared across all members'],
 },
 {
  id: 'org_enterprise', name: 'Enterprise', price: 'Custom',
  description: 'Custom solutions for large organizations',
  tag: 'Enterprise', tagColor: 'bg-amber-500', enterprise: true,
  users: 'Unlimited users', minutes: 'Unlimited translation',
  features: ['SLA guarantee', 'API access', 'Custom integrations', '24/7 dedicated support', 'Team admin dashboard'],
 },
];

// \u2500\u2500 Create Org Modal (with Plan Selection) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function CreateOrgModal({ onClose, onCreated }) {
 const [step, setStep] = useState('plan');
 const [selectedPlan, setSelectedPlan] = useState(null);
 const [name, setName] = useState('');
 const [slug, setSlug] = useState('');
 const [loading, setLoading] = useState(false);
 const [showQuote, setShowQuote] = useState(false);
 const [quoteForm, setQuoteForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', estimated_users: '', message: '' });
 const [quoteSending, setQuoteSending] = useState(false);
 const [quoteSent, setQuoteSent] = useState(false);

 const handlePlanSelect = (plan) => {
  if (plan.enterprise) { setShowQuote(true); return; }
  setSelectedPlan(plan);
  setStep('details');
 };

 const handleSubmit = async (e) => {
  e.preventDefault();
  if (!name || !slug) return;
  setLoading(true);
  try {
   const org = await organizationService.create({ name, slug: slug.toLowerCase().replace(/\s+/g, '-') });
   toast.success(`Organization "${org.name}" created`);
   onCreated(org);
   onClose();
  } catch (err) {
   toast.error(err.response?.data?.detail || 'Failed to create organization');
  } finally { setLoading(false); }
 };

 const handleQuoteSubmit = async (e) => {
  e.preventDefault();
  if (!quoteForm.company_name || !quoteForm.contact_name || !quoteForm.email) {
   toast.error('Please fill in all required fields'); return;
  }
  setQuoteSending(true);
  try {
   const token = localStorage.getItem('token') || sessionStorage.getItem('token');
   const res = await fetch('/api/v1/contact/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: JSON.stringify(quoteForm),
   });
   if (!res.ok) throw new Error('Failed to submit');
   setQuoteSent(true);
   toast.success('Quote request submitted!');
  } catch (err) {
   toast.error(err.message || 'Failed to submit');
  } finally { setQuoteSending(false); }
 };

 return (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
   className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
   <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
    className="bg-white rounded-lg shadow-2xl w-full max-w-3xl p-8 relative max-h-[90vh] overflow-y-auto">
    <button onClick={onClose} className="absolute top-5 right-5 text-v2-muted hover:text-v2-text"><X size={20} /></button>

    {showQuote ? (
     quoteSent ? (
      <div className="text-center py-12">
       <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 size={32} className="text-emerald-600" />
       </div>
       <h3 className="text-2xl font-bold mb-2">Request Submitted!</h3>
       <p className="text-v2-muted text-sm">We'll get back to you within 24 hours.</p>
       <button onClick={onClose} className="v2-btn mt-8 px-8 py-3">Close</button>
      </div>
     ) : (
      <>
       <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setShowQuote(false)} className="text-v2-muted hover:text-v2-text text-sm">&larr; Back</button>
        <h2 className="text-xl font-bold">Enterprise Quote Request</h2>
       </div>
       <form onSubmit={handleQuoteSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
         <div><label className="v2-label">Company Name *</label>
          <input className="v2-input" placeholder="Acme Corp" value={quoteForm.company_name}
           onChange={e => setQuoteForm(f => ({ ...f, company_name: e.target.value }))} required /></div>
         <div><label className="v2-label">Contact Name *</label>
          <input className="v2-input" placeholder="John Doe" value={quoteForm.contact_name}
           onChange={e => setQuoteForm(f => ({ ...f, contact_name: e.target.value }))} required /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
         <div><label className="v2-label">Email *</label>
          <input className="v2-input" type="email" placeholder="john@acme.com" value={quoteForm.email}
           onChange={e => setQuoteForm(f => ({ ...f, email: e.target.value }))} required /></div>
         <div><label className="v2-label">Phone</label>
          <input className="v2-input" placeholder="+1 (555) 000-0000" value={quoteForm.phone}
           onChange={e => setQuoteForm(f => ({ ...f, phone: e.target.value }))} /></div>
        </div>
        <div><label className="v2-label">Estimated Users</label>
         <select className="v2-input" value={quoteForm.estimated_users}
          onChange={e => setQuoteForm(f => ({ ...f, estimated_users: e.target.value }))}>
          <option value="">Select range</option>
          <option value="200-500">200 - 500</option>
          <option value="500-1000">500 - 1,000</option>
          <option value="1000-5000">1,000 - 5,000</option>
          <option value="5000+">5,000+</option>
         </select></div>
        <div><label className="v2-label">Message</label>
         <textarea className="v2-input min-h-[80px] resize-none" placeholder="Tell us about your needs..."
          value={quoteForm.message} onChange={e => setQuoteForm(f => ({ ...f, message: e.target.value }))} /></div>
        <button type="submit" disabled={quoteSending}
         className="v2-btn w-full py-3 flex items-center justify-center gap-2 !bg-amber-500 !border-amber-400 hover:!bg-amber-600">
         {quoteSending ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : 'Submit Quote Request'}
        </button>
       </form>
      </>
     )
    ) : step === 'plan' ? (
     <>
      <div className="flex items-center gap-3 mb-6">
       <div className="w-10 h-10 bg-v2-accent/10 rounded-full flex items-center justify-center">
        <Building2 size={20} className="text-v2-accent" />
       </div>
       <div>
        <h2 className="text-xl font-bold">Create Organization</h2>
        <p className="text-sm text-v2-muted">Choose a plan for your team</p>
       </div>
      </div>
      <p className="text-xs text-v2-muted mb-4">
       Organization plans let you share translation minutes across all members. Each member you add shares the pool.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
       {ORG_PLANS.map(plan => (
        <div key={plan.id} onClick={() => handlePlanSelect(plan)}
         className={`relative border rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${
          plan.popular ? 'border-v2-accent shadow-md' : plan.enterprise ? 'border-slate-600 bg-gradient-to-br from-slate-900 to-slate-800 text-white' : 'border-v2-border hover:border-v2-accent/40'
         }`}>
         <div className={`absolute top-0 right-0 ${plan.tagColor} text-white text-[8px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-widest`}>
          {plan.tag}
         </div>
         <h3 className={`text-lg font-bold mb-1 ${plan.enterprise ? 'text-white' : ''}`}>{plan.name}</h3>
         <p className={`text-[10px] mb-3 ${plan.enterprise ? 'text-slate-400' : 'text-v2-muted'}`}>{plan.description}</p>
         <p className={`text-2xl font-black mb-4 ${plan.enterprise ? 'text-white' : ''}`}>{plan.price}</p>
         <ul className="space-y-2 mb-4">
          <li className={`text-[11px] font-semibold flex items-center gap-2 ${plan.enterprise ? 'text-slate-300' : 'text-v2-text/80'}`}>
           <CheckCircle2 className={plan.enterprise ? 'text-amber-400' : 'text-v2-accent'} size={12} /> {plan.users}
          </li>
          <li className={`text-[11px] font-semibold flex items-center gap-2 ${plan.enterprise ? 'text-slate-300' : 'text-v2-text/80'}`}>
           <CheckCircle2 className={plan.enterprise ? 'text-amber-400' : 'text-v2-accent'} size={12} /> {plan.minutes}
          </li>
          {plan.features.map(f => (
           <li key={f} className={`text-[11px] font-semibold flex items-center gap-2 ${plan.enterprise ? 'text-slate-300' : 'text-v2-text/80'}`}>
            <CheckCircle2 className={plan.enterprise ? 'text-amber-400' : 'text-v2-accent'} size={12} /> {f}
           </li>
          ))}
         </ul>
         <div className={`text-center text-xs font-bold uppercase tracking-widest py-2 rounded-lg ${
          plan.enterprise ? 'bg-amber-500/20 text-amber-400' : plan.popular ? 'bg-v2-accent/10 text-v2-accent' : 'bg-v2-header text-v2-muted'
         }`}>
          {plan.enterprise ? 'Contact Sales' : 'Select Plan'}
         </div>
        </div>
       ))}
      </div>
     </>
    ) : (
     <>
      <div className="flex items-center gap-3 mb-6">
       <button onClick={() => setStep('plan')} className="text-v2-muted hover:text-v2-text text-sm">&larr; Back</button>
       <div>
        <h2 className="text-xl font-bold">Create Organization</h2>
        <p className="text-sm text-v2-muted">Plan: <span className="font-bold text-v2-accent">{selectedPlan?.name}</span> ({selectedPlan?.price})</p>
       </div>
      </div>
      <div className="bg-v2-accent/5 border border-v2-accent/20 rounded-lg p-4 mb-6 text-sm text-v2-muted">
       <strong className="text-v2-text">Shared Minutes:</strong> All members you add will share the organization's translation minutes pool.
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
       <div>
        <label htmlFor="orgNameInput" className="v2-label">Organization Name</label>
        <input id="orgNameInput" className="v2-input" value={name} placeholder="My Company"
         onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')); }}
         required />
       </div>
       <div>
        <label htmlFor="orgSlugInput" className="v2-label">Slug (URL-friendly)</label>
        <input id="orgSlugInput" className="v2-input font-mono text-sm" value={slug}
         onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
         placeholder="my-company" required />
       </div>
       <button type="submit" disabled={loading} className="v2-btn w-full py-3 flex items-center justify-center gap-2">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? 'Creating...' : 'Create Organization'}
       </button>
      </form>
     </>
    )}
   </motion.div>
  </motion.div>
 );
}


// ── Add Member Modal ─────────────────────────────────────────────
function AddMemberModal({ orgId, onClose, onAdded }) {
 const [email, setEmail] = useState('');
 const [role, setRole] = useState('member');
 const [loading, setLoading] = useState(false);

 const roles = ['member', 'manager', 'admin', 'viewer'];

 const handleSubmit = async (e) => {
 e.preventDefault();
 setLoading(true);
 try {
 const member = await organizationService.addMember(orgId, email, role);
 toast.success(`${email} added as ${role}`);
 onAdded(member);
 onClose();
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to add member');
 } finally {
 setLoading(false);
 }
 };

 return (
 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
 className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
 <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
 className="bg-white rounded-lg shadow-2xl w-full max-w-md p-8 relative">
 <button onClick={onClose} className="absolute top-5 right-5 text-v2-muted hover:text-v2-text"><X size={20} /></button>
 <div className="flex items-center gap-3 mb-6">
 <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
 <UserPlus size={20} className="text-blue-500" />
 </div>
 <h2 className="text-xl font-bold">Add Member</h2>
 </div>
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label htmlFor="memberEmailInput" className="v2-label">Email Address</label>
 <input id="memberEmailInput" className="v2-input" type="email" value={email} placeholder="user@example.com"
 onChange={e => setEmail(e.target.value)} required />
 </div>
 <div>
 <label htmlFor="memberRoleSelect" className="v2-label">Role</label>
 <select id="memberRoleSelect" className="v2-input" value={role} onChange={e => setRole(e.target.value)}>
 {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
 </select>
 </div>
 <button type="submit" disabled={loading} className="v2-btn w-full py-3 flex items-center justify-center gap-2">
 {loading && <Loader2 size={16} className="animate-spin" />}
 {loading ? 'Adding...' : 'Add Member'}
 </button>
 </form>
 </motion.div>
 </motion.div>
 );
}

// ── Members Tab ──────────────────────────────────────────────────
function MembersTab({ org, currentUser }) {
 const [members, setMembers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showAdd, setShowAdd] = useState(false);
 const [updatingRole, setUpdatingRole] = useState(null);

 const loadMembers = useCallback(async () => {
 setLoading(true);
 try {
 const data = await organizationService.listMembers(org.id);
 setMembers(data || []);
 } catch (e) { console.warn('Members load:', e.message); }
 finally { setLoading(false); }
 }, [org.id]);

 useEffect(() => { loadMembers(); }, [loadMembers]);

 const myRole = members.find(m => m.user_id === currentUser?.id)?.role;
 const canManage = ['owner', 'admin'].includes(myRole);

 const handleRoleChange = async (userId, role) => {
 setUpdatingRole(userId);
 try {
 await organizationService.updateMemberRole(org.id, userId, role);
 toast.success('Role updated');
 loadMembers();
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to update role');
 } finally { setUpdatingRole(null); }
 };

 const handleRemove = async (userId, email) => {
 if (!confirm(`Remove ${email} from this organization?`)) return;
 try {
 await organizationService.removeMember(org.id, userId);
 toast.success(`${email} removed`);
 loadMembers();
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to remove member');
 }
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-5">
 <div>
 <h3 className="text-lg font-bold">Members</h3>
 <p className="text-sm text-v2-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
 </div>
 {canManage && (
 <button onClick={() => setShowAdd(true)} className="v2-btn flex items-center gap-2 py-2 px-4 text-sm">
 <UserPlus size={15} /> Add Member
 </button>
 )}
 </div>

 {loading ? (
 <div className="flex justify-center py-12"><Loader2 className="animate-spin text-v2-accent" size={28} /></div>
 ) : (
 <div className="space-y-2">
 {members.map(m => (
 <div key={m.user_id} className="flex items-center gap-4 p-4 bg-white rounded-md border border-v2-border hover:shadow-sm transition-shadow">
 <Avatar name={m.full_name || m.email} size={10} />
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-v2-text truncate">{m.full_name || m.email}</p>
 <p className="text-xs text-v2-muted truncate">{m.email}</p>
 </div>
 <div className="flex items-center gap-3 flex-shrink-0">
 {canManage && m.role !== 'owner' && m.user_id !== currentUser?.id ? (
 <div className="relative">
 <select
 value={m.role}
 disabled={updatingRole === m.user_id}
 onChange={e => handleRoleChange(m.user_id, e.target.value)}
 className="text-xs font-bold border rounded-full px-3 py-1.5 appearance-none cursor-pointer bg-white"
 >
 {['admin', 'manager', 'member', 'viewer'].map(r => (
 <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
 ))}
 </select>
 {updatingRole === m.user_id && <Loader2 size={10} className="animate-spin absolute right-1 top-2" />}
 </div>
 ) : (
 <RoleBadge role={m.role} />
 )}
 {canManage && m.role !== 'owner' && m.user_id !== currentUser?.id && (
 <button onClick={() => handleRemove(m.user_id, m.email)}
 className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
 <Trash2 size={14} />
 </button>
 )}
 {m.role === 'owner' && <Crown size={16} className="text-amber-500" />}
 </div>
 </div>
 ))}
 </div>
 )}

 <AnimatePresence>
 {showAdd && (
 <AddMemberModal orgId={org.id} onClose={() => setShowAdd(false)} onAdded={loadMembers} />
 )}
 </AnimatePresence>
 </div>
 );
}

// ── Analytics Tab ────────────────────────────────────────────────
function AnalyticsTab({ org }) {
 const [stats, setStats] = useState(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 analyticsService.getStats(org.id)
 .then(setStats)
 .catch(() => setStats(null))
 .finally(() => setLoading(false));
 }, [org.id]);

 if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-v2-accent" size={28} /></div>;
 if (!stats) return (
 <div className="text-center py-16 text-v2-muted">
 <BarChart3 size={40} className="mx-auto mb-3 opacity-20" />
 <p>No analytics available yet.</p>
 </div>
 );

 const statItems = [
 { label: 'Total Rooms', value: stats.total_rooms ?? 0 },
 { label: 'Active Today', value: stats.active_rooms_today ?? 0 },
 { label: 'Minutes Used', value: stats.minutes_used?.toFixed(1) ?? '0' },
 { label: 'Total Members', value: stats.total_members ?? 0 },
 ];

 return (
 <div>
 <h3 className="text-lg font-bold mb-5">Analytics Overview</h3>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
 {statItems.map(s => (
 <div key={s.label} className="v2-card text-center py-6 bg-white">
 <p className="text-3xl font-semibold text-v2-accent">{s.value}</p>
 <p className="text-xs text-v2-muted mt-1 font-medium uppercase tracking-wider">{s.label}</p>
 </div>
 ))}
 </div>
 </div>
 );
}

// ── Audit Log Tab ────────────────────────────────────────────────
function AuditTab({ org }) {
 const [logs, setLogs] = useState([]);
 const [loading, setLoading] = useState(true);

 const loadLogs = useCallback(async () => {
 setLoading(true);
 try {
 const data = await auditLogService.list(org.id, { limit: 50 });
 setLogs(Array.isArray(data) ? data : data?.items || []);
 } catch { setLogs([]); }
 finally { setLoading(false); }
 }, [org.id]);

 useEffect(() => { loadLogs(); }, [loadLogs]);

 return (
 <div>
 <div className="flex items-center justify-between mb-5">
 <h3 className="text-lg font-bold">Audit Log</h3>
 <button onClick={loadLogs} className="v2-btn-secondary flex items-center gap-2 py-2 px-4 text-sm">
 <RefreshCw size={14} /> Refresh
 </button>
 </div>
 {loading ? (
 <div className="flex justify-center py-12"><Loader2 className="animate-spin text-v2-accent" size={28} /></div>
 ) : logs.length === 0 ? (
 <div className="text-center py-16 text-v2-muted">
 <ClipboardList size={40} className="mx-auto mb-3 opacity-20" />
 <p>No audit events yet.</p>
 </div>
 ) : (
 <div className="space-y-2">
 {logs.map((log, i) => (
 <div key={log.id || i} className="flex items-start gap-3 p-4 bg-white rounded-md border border-v2-border text-sm">
 <div className="w-8 h-8 bg-v2-header rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
 <ClipboardList size={14} className="text-v2-accent" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-v2-text">{log.action?.replace(/_/g, ' ')}</p>
 <p className="text-xs text-v2-muted mt-0.5">{log.resource_type} · {log.outcome}</p>
 </div>
 <p className="text-[11px] text-v2-muted flex-shrink-0">
 {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
 </p>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

// ── Settings Tab ─────────────────────────────────────────────────
function SettingsTab({ org, currentUser, onLeave, onDeleted }) {
 const [name, setName] = useState(org.name);
 const [saving, setSaving] = useState(false);
 const [leaving, setLeaving] = useState(false);

 const members = [];
 const myRole = org.owner_id === currentUser?.id ? 'owner' : 'member';
 const isOwner = myRole === 'owner';

 const handleSave = async () => {
 setSaving(true);
 try {
 await organizationService.update(org.id, { name });
 toast.success('Organization updated');
 } catch { toast.error('Failed to update'); }
 finally { setSaving(false); }
 };

 const handleLeave = async () => {
 if (!confirm('Are you sure you want to leave this organization?')) return;
 setLeaving(true);
 try {
 await organizationService.leave(org.id);
 toast.success('You left the organization');
 onLeave();
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to leave');
 } finally { setLeaving(false); }
 };

 const handleDelete = async () => {
 if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
 try {
 await organizationService.delete(org.id);
 toast.success('Organization deleted');
 onDeleted();
 } catch { toast.error('Failed to delete'); }
 };

 return (
 <div className="space-y-6 max-w-lg">
 <div>
 <h3 className="text-lg font-bold mb-4">Organization Settings</h3>
 <div className="space-y-4">
 <div>
 <label htmlFor="settingOrgName" className="v2-label">Organization Name</label>
 <input id="settingOrgName" className="v2-input" value={name} onChange={e => setName(e.target.value)} />
 </div>
 <div>
 <label htmlFor="settingOrgSlug" className="v2-label">Slug</label>
 <input id="settingOrgSlug" className="v2-input bg-gray-50 text-v2-muted" value={org.slug} readOnly />
 </div>
 <button onClick={handleSave} disabled={saving} className="v2-btn flex items-center gap-2 py-2.5">
 {saving && <Loader2 size={14} className="animate-spin" />}
 {saving ? 'Saving...' : 'Save Changes'}
 </button>
 </div>
 </div>

 <div className="border-t border-v2-border pt-6">
 <h4 className="font-bold text-red-600 mb-4">Danger Zone</h4>
 <div className="space-y-3">
 {!isOwner && (
 <button onClick={handleLeave} disabled={leaving}
 className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors w-full">
 <LogOut size={15} />
 {leaving ? 'Leaving...' : 'Leave Organization'}
 </button>
 )}
 {isOwner && (
 <button onClick={handleDelete}
 className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors w-full">
 <Trash2 size={15} /> Delete Organization
 </button>
 )}
 </div>
 </div>
 </div>
 );
}

// ── Main Organizations Page ──────────────────────────────────────
export default function Organizations() {
 const { user } = useAuthStore();
 const [orgs, setOrgs] = useState([]);
 const [selectedOrg, setSelectedOrg] = useState(null);
 const [activeTab, setActiveTab] = useState('members');
 const [loading, setLoading] = useState(true);
 const [showCreate, setShowCreate] = useState(false);

 const loadOrgs = useCallback(async () => {
 setLoading(true);
 try {
 const data = await organizationService.list();
 setOrgs(data || []);
 if (data?.length > 0 && !selectedOrg) setSelectedOrg(data[0]);
 } catch (e) { console.warn('Organizations load:', e.message); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { loadOrgs(); }, [loadOrgs]);

 const TABS = [
 { id: 'members', label: 'Members', icon: Users },
 { id: 'analytics', label: 'Analytics', icon: BarChart3 },
 { id: 'audit', label: 'Audit Log', icon: ClipboardList },
 { id: 'settings', label: 'Settings', icon: Settings },
 ];

 const handleOrgCreated = (org) => { loadOrgs(); setSelectedOrg(org); };
 const handleLeaveOrDelete = () => { setSelectedOrg(null); loadOrgs(); };

 return (
 <div className="v2-app p-4 md:p-8 min-h-screen">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center justify-between flex-wrap gap-4">
 <div>
 <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
 <Building2 className="text-v2-accent" size={32} />
 Organizations
 </h1>
 <p className="text-v2-muted mt-1">Manage your teams, members, and billing communities</p>
 </div>
 <button onClick={() => setShowCreate(true)}
 className="v2-btn flex items-center gap-2 py-2.5 px-5">
 <Plus size={16} /> New Organization
 </button>
 </div>
 </div>

 {loading ? (
 <div className="flex justify-center py-24"><Loader2 className="animate-spin text-v2-accent" size={36} /></div>
 ) : orgs.length === 0 ? (
 <div className="v2-card text-center py-24">
 <Building2 size={56} className="mx-auto mb-4 text-v2-border opacity-40" />
 <h2 className="text-2xl font-bold mb-2">No Organizations Yet</h2>
 <p className="text-v2-muted mb-6">Create your first organization to invite team members and manage billing.</p>
 <button onClick={() => setShowCreate(true)} className="v2-btn inline-flex items-center gap-2">
 <Plus size={16} /> Create Organization
 </button>
 </div>
 ) : (
 <div className="flex flex-col lg:flex-row gap-6">
 {/* Org List (sidebar) */}
 <div className="lg:w-72 flex-shrink-0">
 <div className="v2-card p-3 space-y-1">
 <p className="text-[10px] font-bold uppercase tracking-widest text-v2-muted px-2 py-1">Your Organizations</p>
 {orgs.map(org => (
 <button
 key={org.id}
 onClick={() => { setSelectedOrg(org); setActiveTab('members'); }}
 className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-all ${selectedOrg?.id === org.id ? 'bg-v2-accent/10 text-v2-accent' : 'hover:bg-v2-header text-v2-text'}`}
 >
 <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${selectedOrg?.id === org.id ? 'bg-v2-accent text-white' : 'bg-v2-header text-v2-muted'}`}>
 {org.name.slice(0, 2).toUpperCase()}
 </div>
 <div className="min-w-0">
 <p className="font-semibold text-sm truncate">{org.name}</p>
 <p className="text-[10px] text-v2-muted truncate">/{org.slug}</p>
 </div>
 {org.owner_id === user?.id && <Crown size={12} className="text-amber-500 flex-shrink-0" />}
 </button>
 ))}
 </div>
 </div>

 {/* Org Detail */}
 {selectedOrg && (
 <div className="flex-1 min-w-0">
 <div className="v2-card overflow-hidden">
 {/* Org Header */}
 <div className="p-6 border-b border-v2-border bg-gradient-to-r from-v2-accent/5 to-transparent">
 <div className="flex items-center gap-4">
 <div className="w-14 h-14 rounded-full bg-v2-accent text-white flex items-center justify-center text-xl font-semibold">
 {selectedOrg.name.slice(0, 2).toUpperCase()}
 </div>
 <div>
 <h2 className="text-xl font-semibold">{selectedOrg.name}</h2>
 <p className="text-v2-muted text-sm">{selectedOrg.slug}</p>
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-v2-border overflow-x-auto">
 {TABS.map(t => {
 const Icon = t.icon;
 return (
 <button key={t.id} onClick={() => setActiveTab(t.id)}
 className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? 'border-v2-accent text-v2-accent' : 'border-transparent text-v2-muted hover:text-v2-text'}`}>
 <Icon size={15} /> {t.label}
 </button>
 );
 })}
 </div>

 {/* Tab Content */}
 <div className="p-6">
 <AnimatePresence mode="wait">
 <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
 {activeTab === 'members' && <MembersTab org={selectedOrg} currentUser={user} />}
 {activeTab === 'analytics' && <AnalyticsTab org={selectedOrg} />}
 {activeTab === 'audit' && <AuditTab org={selectedOrg} />}
 {activeTab === 'settings' && (
 <SettingsTab org={selectedOrg} currentUser={user}
 onLeave={handleLeaveOrDelete} onDeleted={handleLeaveOrDelete} />
 )}
 </motion.div>
 </AnimatePresence>
 </div>
 </div>
 </div>
 )}
 </div>
 )}

 <AnimatePresence>
 {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={handleOrgCreated} />}
 </AnimatePresence>
 </div>
 );
}
