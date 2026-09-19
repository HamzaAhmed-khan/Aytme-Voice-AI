import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingService, organizationService } from '../services/api';
import toast from 'react-hot-toast';
import { CreditCard, CheckCircle2, Zap, Building2, ChevronDown, Activity, Users, Shield, Clock, Star, X, Tag, ArrowRight, Loader2, Mail, Phone, MessageSquare, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Fallback individual plans if API fails
const FALLBACK_PLANS = [
  { id: 'starter', name: 'Starter', price_monthly: 4.99, minutes_included: 250,
    overage_rate_per_min: 0.05, trial_days: 30,
    features: { rooms: 2, support: 'Email', video: false, broadcast: false, upgrade_only: true, sales_commission_pct: 1, description: 'Audio-only translation' } },
  { id: 'pro', name: 'Pro', price_monthly: 9.99, minutes_included: 1000,
    overage_rate_per_min: 0.03, trial_days: 0,
    features: { rooms: 10, support: 'Priority Email', video: true, broadcast: false, upgrade_only: true, sales_commission_pct: 1, description: 'Video & conversations' } },
  { id: 'premium', name: 'Premium', price_monthly: 19.99, minutes_included: 3000,
    overage_rate_per_min: 0.02, trial_days: 0,
    features: { rooms: 50, support: 'Priority', video: true, broadcast: true, sales_commission_pct: 1, description: 'Broadcast, full features' } },
];

// ─── CHECKOUT POPUP ────────────────────────────────────────
function CheckoutPopup({ plan, orgId, onClose }) {
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const discountedPrice = discountResult?.valid && discountResult.percent_off
    ? (plan.price_monthly * (1 - discountResult.percent_off / 100)).toFixed(2)
    : null;

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    try {
      const result = await billingService.validateDiscount(discountCode.trim());
      setDiscountResult(result);
      toast.success(`${result.percent_off}% discount will be applied!`);
    } catch (err) {
      setDiscountResult({ valid: false, message: err.message });
      toast.error(err.message);
    } finally { setDiscountLoading(false); }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      if (!orgId) {
        toast.error('Please select an organization first');
        return;
      }
      if (!plan?.id) {
        toast.error('Plan is unavailable. Please refresh and try again.');
        return;
      }
      const redirectUrl = `${window.location.origin}/billing`;
      const result = await billingService.initiateCheckout(
        orgId, plan.id, redirectUrl,
        discountResult?.valid ? discountCode.trim() : undefined
      );
      const url = result?.checkout_url || result?.payment_url;
      if (url) window.location.href = url;
      else toast.error('No checkout URL provided');
    } catch (err) {
      toast.error(err.message || 'Failed to initiate checkout');
    } finally { setCheckoutLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <X size={18} />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-indigo-600" />
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800">Checkout</h3>
          <p className="text-slate-400 text-sm mt-1">Complete your plan upgrade</p>
        </div>

        {/* Plan Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="text-lg font-bold uppercase tracking-tight text-slate-800">{plan.name}</h4>
              <p className="text-[10px] text-slate-400 font-medium">{plan.features?.description || 'All features'}</p>
            </div>
            <div className="text-right">
              {discountedPrice ? (
                <>
                  <span className="text-lg text-slate-400 line-through font-bold">${plan.price_monthly}</span>
                  <span className="text-2xl font-black tracking-tight text-emerald-600 ml-2">${discountedPrice}</span>
                </>
              ) : (
                <span className="text-2xl font-black tracking-tight text-slate-800">${plan.price_monthly}</span>
              )}
              <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">/mo</span>
            </div>
          </div>
          <ul className="space-y-1.5">
            <li className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500 shrink-0" size={12} /> {plan.minutes_included?.toLocaleString()} mins included
            </li>
            <li className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500 shrink-0" size={12} /> Unlimited rooms
            </li>
            <li className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500 shrink-0" size={12} /> {plan.features?.support || 'Community'} support
            </li>
          </ul>
        </div>

        {/* Discount Code */}
        <div className="mb-6">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-2">
            <Tag size={10} className="text-amber-500" /> Discount Code (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="v2-input font-mono uppercase tracking-wider flex-1"
              placeholder="AYTME-XXXX"
              value={discountCode}
              onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountResult(null); }}
              disabled={discountResult?.valid}
            />
            {discountResult?.valid ? (
              <button
                onClick={() => { setDiscountResult(null); setDiscountCode(''); }}
                className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-all"
              >
                Clear
              </button>
            ) : (
              <button
                onClick={handleApplyDiscount}
                disabled={discountLoading || !discountCode.trim()}
                className="v2-btn py-2 px-6 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
              >
                {discountLoading ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
              </button>
            )}
          </div>
          {discountResult && (
            <div className={`mt-2 flex items-center gap-2 text-xs font-bold ${discountResult.valid ? 'text-emerald-600' : 'text-red-500'}`}>
              {discountResult.valid ? <CheckCircle2 size={14} /> : <span>✗</span>} {discountResult.message}
            </div>
          )}
        </div>

        {/* Checkout Button */}
        <button
          onClick={handleCheckout}
          disabled={checkoutLoading}
          className="v2-btn w-full py-4 text-sm font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          {checkoutLoading ? (
            <><Loader2 size={18} className="animate-spin" /> Connecting PayPal...</>
          ) : (
            <><ArrowRight size={18} /> Proceed to PayPal</>
          )}
        </button>

        <p className="text-center text-[10px] text-slate-400 font-medium mt-4 flex items-center justify-center gap-1.5">
          <Shield size={10} /> Secure checkout powered by PayPal
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── REQUEST QUOTE MODAL ────────────────────────────────────────
function RequestQuoteModal({ onClose }) {
  const [form, setForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', estimated_users: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name || !form.contact_name || !form.email) {
      toast.error('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch('/api/v1/contact/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSent(true);
      toast.success('Quote request submitted!');
    } catch (err) {
      toast.error(err.message || 'Failed to submit quote request');
    } finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <X size={18} />
        </button>

        {sent ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800 mb-2">Request Submitted!</h3>
            <p className="text-slate-400 text-sm">We'll get back to you within 24 hours with a tailored quote.</p>
            <button onClick={onClose} className="v2-btn mt-8 px-8 py-3">Close</button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 size={28} className="text-amber-600" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800">Request Enterprise Quote</h3>
              <p className="text-slate-400 text-sm mt-1">Get a custom pricing plan for your organization</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Company Name *</label>
                  <input className="v2-input" placeholder="Acme Corp" value={form.company_name} onChange={e => handleChange('company_name', e.target.value)} required />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Contact Name *</label>
                  <input className="v2-input" placeholder="John Doe" value={form.contact_name} onChange={e => handleChange('contact_name', e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><Mail size={10} /> Email *</label>
                  <input className="v2-input" type="email" placeholder="john@acme.com" value={form.email} onChange={e => handleChange('email', e.target.value)} required />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><Phone size={10} /> Phone</label>
                  <input className="v2-input" placeholder="+1 (555) 000-0000" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><Users size={10} /> Estimated Users</label>
                <select className="v2-input" value={form.estimated_users} onChange={e => handleChange('estimated_users', e.target.value)}>
                  <option value="">Select range</option>
                  <option value="200-500">200 – 500</option>
                  <option value="500-1000">500 – 1,000</option>
                  <option value="1000-5000">1,000 – 5,000</option>
                  <option value="5000+">5,000+</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><MessageSquare size={10} /> Message</label>
                <textarea className="v2-input min-h-[80px] resize-none" placeholder="Tell us about your translation needs..." value={form.message} onChange={e => handleChange('message', e.target.value)} />
              </div>
              <button type="submit" disabled={loading}
                className="v2-btn w-full py-4 text-sm font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg !bg-amber-500 !border-amber-400 hover:!bg-amber-600">
                {loading ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : <><ArrowRight size={18} /> Submit Quote Request</>}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}


// ─── BILLING PAGE ────────────────────────────────────────
export default function Billing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null); // Plan selected for checkout popup
  const [showQuoteModal, setShowQuoteModal] = useState(false); // Enterprise quote modal

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionId = params.get('subscription_id');
    const orgId = params.get('org_id');
    if (subscriptionId) verifyAndSync(subscriptionId, orgId);
    loadInitial();
  }, []);

  const verifyAndSync = async (subscriptionId, orgId) => {
    const loadingToast = toast.loading('Syncing your subscription...');
    try {
      await billingService.verifySession(null, subscriptionId, orgId);
      toast.success('Subscription successfully updated!', { id: loadingToast });
      window.history.replaceState({}, document.title, window.location.pathname);
      await loadInitial();
    } catch (err) {
      toast.error('Payment verification failed.', { id: loadingToast });
    }
  };

  useEffect(() => {
    if (selectedOrg) { loadBillingData(selectedOrg.id); fetchInvoices(selectedOrg.id); }
  }, [selectedOrg]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [planData, orgData] = await Promise.all([
        billingService.listPlans(), organizationService.list()
      ]);
      if (planData?.length) {
        const merged = planData.map(p => {
          const fp = FALLBACK_PLANS.find(f => f.name.toLowerCase() === (p.name || '').toLowerCase());
          return fp ? { ...fp, ...p, id: p.id, features: p.features || fp.features } : p;
        });
        setPlans(merged);
      } else {
        setPlans(FALLBACK_PLANS);
      }
      setOrgs(orgData || []);
      if (orgData?.length) setSelectedOrg(orgData[0]);
    } catch (err) {
      setPlans(FALLBACK_PLANS);
      console.warn('Billing plans load failed:', err.message);
    } finally { setLoading(false); }
  };

  const loadBillingData = async (orgId) => {
    try { setSubscription(await billingService.getSubscription(orgId)); } catch (err) {}
  };

  const fetchInvoices = async (orgId) => {
    setInvoicesLoading(true);
    try { setInvoices((await billingService.listInvoices(orgId)) || []); } catch (e) {} finally { setInvoicesLoading(false); }
  };

  const handleManageSubscription = () => {
    window.open('https://www.paypal.com/myaccount/autopay/', '_blank');
  };

  if (loading) {
    return (<div className="v2-page flex items-center justify-center min-h-[400px]"><Activity className="animate-spin text-v2-accent" size={48} /></div>);
  }

  // Days-based bar (trial / fallback)
  const periodStart = subscription?.current_period_start ? new Date(subscription.current_period_start) : null;
  const periodEnd   = subscription?.current_period_end   ? new Date(subscription.current_period_end)   : null;
  const daysTotal   = (periodStart && periodEnd)
    ? Math.max(1, Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24)))
    : 30;
  const daysRemaining = subscription?.days_remaining ?? daysTotal;
  const daysUsed  = Math.max(0, daysTotal - daysRemaining);
  const daysPct   = Math.min(100, Math.round((daysUsed / daysTotal) * 100));

  // Minutes-based bar (active paid plans)
  const showMinutesBar = subscription?.status === 'active' && (subscription?.minutes_total ?? 0) > 0;
  const minsTotal     = subscription?.minutes_total ?? 0;
  const minsUsed      = Math.round(subscription?.minutes_used ?? 0);
  const minsRemaining = Math.max(0, minsTotal - minsUsed);
  const minsPct       = minsTotal > 0 ? Math.min(100, Math.round((minsUsed / minsTotal) * 100)) : 0;

  const trialDaysLeft = subscription?.trial_end
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end) - new Date()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="v2-page space-y-10 pb-20 animate-in fade-in duration-700 max-w-full overflow-x-hidden">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-v2-accent font-bold uppercase tracking-[0.2em] text-[10px]">
          <CreditCard size={12} strokeWidth={3} /> Financials
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-v2-text tracking-tighter uppercase">Billing & Usage</h1>
            <p className="text-v2-muted text-sm font-medium pt-1">Manage subscriptions, track usage, and download invoices.</p>
          </div>
          {orgs.length > 0 && (
            <div className="relative w-full md:w-auto">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
              <select className="v2-input pl-12 pr-10 appearance-none bg-v2-header/30 cursor-pointer border-v2-border/30"
                value={selectedOrg?.id || ''} onChange={(e) => setSelectedOrg(orgs.find(o => o.id === e.target.value))}>
                {orgs.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl space-y-10">
        {/* Current Subscription & Usage */}
        {subscription && (
          <div className="v2-card bg-gradient-to-br from-v2-accent/5 to-transparent border-v2-accent/20">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Active Plan</p>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tighter text-v2-text uppercase">{subscription.plan_name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-sm ${
                    subscription.status === 'active' ? 'bg-emerald-500 text-white'
                    : subscription.status === 'trialing' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                  }`}>{subscription.status === 'trialing' ? `Trial • ${trialDaysLeft || 0} days left` : subscription.status}</span>
                  <p className="text-[10px] text-v2-muted font-bold uppercase tracking-widest">
                    Renewal: {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right w-full sm:w-auto p-4 sm:p-0 bg-white sm:bg-transparent rounded-xl sm:rounded-none border sm:border-0 border-v2-border/30">
                {showMinutesBar ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Minutes Remaining</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl md:text-4xl font-bold text-v2-text tracking-tighter">{minsRemaining}</span>
                      <span className="text-v2-muted text-sm font-bold uppercase">/ {minsTotal} mins</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase text-v2-muted mb-1 tracking-widest">Days Remaining</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl md:text-4xl font-bold text-v2-text tracking-tighter">{daysRemaining}</span>
                      <span className="text-v2-muted text-sm font-bold uppercase">/ {daysTotal} days</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-v2-header/40 rounded-full overflow-hidden border border-v2-border/20 p-0.5 shadow-inner">
                {showMinutesBar ? (
                  <div className={`h-full rounded-full transition-all duration-1000 shadow-glow ${minsPct > 80 ? 'bg-rose-500 shadow-rose-500/50' : 'bg-v2-accent shadow-v2-accent/50'}`}
                    style={{ width: `${minsPct}%` }} />
                ) : (
                  <div className={`h-full rounded-full transition-all duration-1000 shadow-glow ${daysPct > 80 ? 'bg-rose-500 shadow-rose-500/50' : 'bg-v2-accent shadow-v2-accent/50'}`}
                    style={{ width: `${daysPct}%` }} />
                )}
              </div>
              <div className="flex justify-between px-1">
                {showMinutesBar ? (
                  <>
                    <p className="text-[10px] text-v2-muted font-bold uppercase tracking-widest">{minsUsed} min{minsUsed !== 1 ? 's' : ''} used</p>
                    <p className="text-[10px] text-v2-muted font-bold uppercase tracking-widest">{minsRemaining} min{minsRemaining !== 1 ? 's' : ''} remaining</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-v2-muted font-bold uppercase tracking-widest">{daysUsed} day{daysUsed !== 1 ? 's' : ''} consumed</p>
                    <p className="text-[10px] text-v2-muted font-bold uppercase tracking-widest">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining</p>
                  </>
                )}
              </div>
            </div>
            {subscription.is_expiring_soon && (
              <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700">
                <AlertTriangle size={16} className="shrink-0 text-amber-500" />
                <p className="text-sm font-medium">
                  Your plan expires in <strong>{subscription.days_remaining} day{subscription.days_remaining !== 1 ? 's' : ''}</strong>. Renew below to avoid service interruption.
                </p>
              </div>
            )}
            <div className="mt-8 pt-6 border-t border-v2-border/20 flex flex-col sm:flex-row gap-4">
              <button onClick={handleManageSubscription}
                className="v2-btn w-full sm:w-auto px-8 py-3.5 text-[11px] uppercase tracking-widest font-bold flex justify-center items-center shadow-lg shadow-v2-accent/20">
                Manage PayPal Subscription
              </button>
            </div>
          </div>
        )}

        {/* Individual Plans */}
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-widest text-v2-text mb-2">Individual Plans</h2>
          <p className="text-v2-muted text-sm mb-6">Choose the plan that fits your translation needs</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = subscription?.plan_name?.toLowerCase() === plan.name.toLowerCase();
              const isPro = plan.name === 'Pro';
              return (
                <div key={plan.id} className={`v2-card flex flex-col relative overflow-hidden transition-all duration-500 hover:scale-[1.02] ${
                  isCurrent ? 'border-v2-accent shadow-2xl shadow-v2-accent/10 ring-1 ring-v2-accent'
                  : isPro ? 'border-indigo-400/50 shadow-lg shadow-indigo-500/10' : 'hover:border-v2-accent/30'
                }`}>
                  {isPro && (
                    <div className="absolute top-0 right-0 bg-v2-accent text-white text-[9px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg">
                      Popular
                    </div>
                  )}
                  {plan.name === 'Starter' && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg">
                      30-Day Free Trial
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text">{plan.name}</h3>
                    <p className="text-[10px] text-v2-muted font-medium mt-1">{plan.features?.description || ''}</p>
                  </div>
                  <div className="mb-8">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl md:text-5xl font-bold tracking-tighter text-v2-text">${plan.price_monthly}</span>
                      <span className="text-v2-muted font-bold uppercase text-[10px] tracking-widest">/mo</span>
                    </div>
                    {plan.name === 'Starter' && (
                      <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-2 flex items-center gap-1.5">
                        <Clock size={10} /> Free for 30 days, then ${plan.price_monthly}/mo
                      </p>
                    )}
                  </div>
                  <ul className="space-y-3 mb-10 flex-1">
                    <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                      <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> {plan.minutes_included?.toLocaleString()} mins included
                    </li>
                    <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                      <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Unlimited rooms
                    </li>
                    <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                      <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> {plan.features?.description || 'All features'}
                    </li>
                    {plan.features?.video && (
                      <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                        <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Video support
                      </li>
                    )}
                    {plan.features?.broadcast && (
                      <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                        <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Broadcast mode
                      </li>
                    )}
                    <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                      <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> {plan.features?.support || 'Email'} support
                    </li>
                    {plan.features?.upgrade_only && (
                      <li className="text-[10px] font-medium text-v2-muted flex items-center gap-3 tracking-tight italic">
                        <Zap className="text-amber-400 shrink-0" size={12} /> Upgrade plan for more minutes
                      </li>
                    )}
                  </ul>
                  <button onClick={() => !isCurrent && setCheckoutPlan(plan)} disabled={isCurrent}
                    className={`v2-btn w-full py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                      isCurrent ? '!bg-emerald-500 !shadow-emerald-500/40 !border-emerald-400' : 'hover:shadow-v2-accent/30'
                    }`}>
                    {isCurrent ? 'Active Plan ✓' : 'Select Plan'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Organization Plans */}
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-widest text-v2-text mb-2">Organization Plans</h2>
          <p className="text-v2-muted text-sm mb-6">Scale your team with shared translation minutes across your organization</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Team */}
            <div className="v2-card flex flex-col relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:border-v2-accent/30">
              <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg">
                Teams
              </div>
              <div className="mb-4">
                <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text">Team</h3>
                <p className="text-[10px] text-v2-muted font-medium mt-1">For small teams and departments</p>
              </div>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold tracking-tighter text-v2-text">$49</span>
                  <span className="text-v2-muted font-bold text-lg">–$99</span>
                  <span className="text-v2-muted font-bold uppercase text-[10px] tracking-widest">/mo</span>
                </div>
                <p className="text-[10px] text-v2-muted mt-1">$49/mo for 10 users, scales to $99 for 25</p>
              </div>
              <ul className="space-y-3 mb-10 flex-1">
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> 10–25 users
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> 2,500 shared minutes/mo
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Team admin dashboard
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Priority email support
                </li>
                <li className="text-[10px] font-medium text-v2-muted flex items-center gap-3 tracking-tight italic">
                  <Users className="text-indigo-400 shrink-0" size={12} /> Minutes shared across all members
                </li>
              </ul>
              <button onClick={() => setCheckoutPlan({ id: 'org_team', name: 'Team', price_monthly: 49, minutes_included: 2500, features: { rooms: 25, support: 'Priority Email', sales_commission_pct: 1, description: '10-25 users, shared minutes' } })}
                className="v2-btn w-full py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all hover:shadow-v2-accent/30">
                Select Team Plan
              </button>
            </div>

            {/* Business */}
            <div className="v2-card flex flex-col relative overflow-hidden transition-all duration-500 hover:scale-[1.02] border-indigo-400/50 shadow-lg shadow-indigo-500/10">
              <div className="absolute top-0 right-0 bg-v2-accent text-white text-[9px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg">
                Popular
              </div>
              <div className="mb-4">
                <h3 className="text-xl font-bold uppercase tracking-tighter text-v2-text">Business</h3>
                <p className="text-[10px] text-v2-muted font-medium mt-1">For growing organizations</p>
              </div>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold tracking-tighter text-v2-text">$199</span>
                  <span className="text-v2-muted font-bold text-lg">–$499</span>
                  <span className="text-v2-muted font-bold uppercase text-[10px] tracking-widest">/mo</span>
                </div>
                <p className="text-[10px] text-v2-muted mt-1">$199/mo for 50 users, scales to $499 for 200</p>
              </div>
              <ul className="space-y-3 mb-10 flex-1">
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> 50–200 users
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> 10,000 shared minutes/mo
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Team admin dashboard
                </li>
                <li className="text-[11px] font-semibold text-v2-text/80 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-v2-accent shrink-0" size={14} /> Priority email support
                </li>
                <li className="text-[10px] font-medium text-v2-muted flex items-center gap-3 tracking-tight italic">
                  <Users className="text-indigo-400 shrink-0" size={12} /> Minutes shared across all members
                </li>
              </ul>
              <button onClick={() => setCheckoutPlan({ id: 'org_business', name: 'Business', price_monthly: 199, minutes_included: 10000, features: { rooms: 100, support: 'Priority Email', sales_commission_pct: 1, description: '50-200 users, shared minutes' } })}
                className="v2-btn w-full py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all hover:shadow-v2-accent/30">
                Select Business Plan
              </button>
            </div>

            {/* Enterprise */}
            <div className="v2-card flex flex-col relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:border-v2-accent/30 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-700">
              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg">
                Enterprise
              </div>
              <div className="mb-4">
                <h3 className="text-xl font-bold uppercase tracking-tighter text-white">Enterprise</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-1">Custom solutions for large organizations</p>
              </div>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold tracking-tighter text-white">Custom</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Tailored pricing</p>
              </div>
              <ul className="space-y-3 mb-10 flex-1">
                <li className="text-[11px] font-semibold text-slate-300 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-amber-400 shrink-0" size={14} /> Unlimited users
                </li>
                <li className="text-[11px] font-semibold text-slate-300 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-amber-400 shrink-0" size={14} /> Team admin dashboard
                </li>
                <li className="text-[11px] font-semibold text-slate-300 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-amber-400 shrink-0" size={14} /> SLA guarantee
                </li>
                <li className="text-[11px] font-semibold text-slate-300 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-amber-400 shrink-0" size={14} /> API access & custom integrations
                </li>
                <li className="text-[11px] font-semibold text-slate-300 flex items-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 className="text-amber-400 shrink-0" size={14} /> 24/7 dedicated support
                </li>
                <li className="text-[10px] font-medium text-slate-400 flex items-center gap-3 tracking-tight italic">
                  <Mail className="text-amber-400 shrink-0" size={12} /> Inquiry sent to info@meshedinc.com
                </li>
              </ul>
              <button onClick={() => setShowQuoteModal(true)}
                className="v2-btn w-full py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all !bg-amber-500 !border-amber-400 hover:!bg-amber-600 text-center">
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* Payment History */}
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-widest text-v2-text mb-6">Payment History</h2>
          <div className="v2-card p-0 overflow-hidden shadow-2xl">
            {invoicesLoading ? (
              <div className="p-20 flex justify-center"><Activity className="animate-spin text-v2-accent" size={24} /></div>
            ) : invoices.length === 0 ? (
              <div className="p-16 text-center">
                <CreditCard className="mx-auto text-v2-border mb-4 opacity-20" size={48} />
                <p className="text-v2-muted font-medium">No transactions found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="bg-v2-header/30 border-b border-v2-border/30">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-v2-muted">Invoice</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-v2-muted">Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-v2-muted">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-v2-muted">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-v2-border/20 text-sm">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-v2-header/10 transition-colors">
                        <td className="px-6 py-5 font-bold text-v2-text tracking-tight">{inv.number || inv.id?.slice(0, 12)}</td>
                        <td className="px-6 py-5 text-v2-muted font-medium">{new Date(inv.created_at || inv.date).toLocaleDateString()}</td>
                        <td className="px-6 py-5 font-bold text-v2-text">${parseFloat(inv.amount).toFixed(2)} {inv.currency?.toUpperCase() || 'USD'}</td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Security Footer */}
        <div className="flex items-center gap-3 p-4 bg-v2-header/20 border border-v2-border/20 rounded-xl text-v2-muted text-xs">
          <Shield size={16} className="text-v2-accent shrink-0" />
          All payments are processed securely by <span className="text-v2-text font-bold">PayPal</span>. No card details are stored on our servers.
        </div>
      </div>

      {/* Checkout Popup */}
      <AnimatePresence>
        {checkoutPlan && selectedOrg && (
          <CheckoutPopup
            plan={checkoutPlan}
            orgId={selectedOrg.id}
            onClose={() => setCheckoutPlan(null)}
          />
        )}
        {showQuoteModal && (
          <RequestQuoteModal onClose={() => setShowQuoteModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
