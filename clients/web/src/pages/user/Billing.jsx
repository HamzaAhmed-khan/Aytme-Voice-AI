import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { billingService, organizationService } from '../../services/api';
import toast from 'react-hot-toast';

import {
    CreditCard, CheckCircle2, Clock, Download, ExternalLink,
    ShieldCheck, AlertCircle, Zap, Building2, RefreshCw, ChevronDown
} from 'lucide-react';

const FALLBACK_PLANS = [
    {
        id: 'starter',
        name: 'Starter', price_monthly: 4.99, minutes_included: 250, overage_rate_per_min: 0.1,
        features: { rooms: 2, retention: '24h', members: 2, support: 'Audio only' }
    },
    {
        id: 'pro',
        name: 'Pro', price_monthly: 9.99, minutes_included: 1000, overage_rate_per_min: 0.1,
        features: { rooms: 10, retention: '30 days', members: 10, support: 'Video & conversations' }
    },
    {
        id: 'premium',
        name: 'Premium', price_monthly: 19.99, minutes_included: 3000, overage_rate_per_min: 0.1,
        features: { rooms: 50, retention: '90 days', members: 50, support: 'Broadcast & full features' }
    }
];

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Billing() {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const planFromUrl = queryParams.get('plan');

    const [plans, setPlans] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [subscription, setSubscription] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [usageBreakdown, setUsageBreakdown] = useState(null);
    const [loading, setLoading] = useState(true);
    const [upgradeLoading, setUpgradeLoading] = useState(null);
    const [error, setError] = useState('');
    const [usingFallbackPlans, setUsingFallbackPlans] = useState(false);

    useEffect(() => {
        loadInitial();
    }, []);

    useEffect(() => {
        if (selectedOrg) {
            setError(''); // Clear errors when switching orgs
            loadBillingData(selectedOrg.id);
        }
    }, [selectedOrg]);

    // Handle auto-upgrade from URL parameter
    useEffect(() => {
        if (planFromUrl && plans.length > 0 && selectedOrg && !loading) {
            console.log(`Auto-upgrading to plan slug or ID: ${planFromUrl}`);
            const targetPlan = plans.find(p =>
                p.name.toLowerCase() === planFromUrl.toLowerCase() || p.id === planFromUrl
            );

            if (targetPlan) {
                // Don't auto-upgrade if they are already on it (e.g. they came back from signup with 'free')
                if (targetPlan.name.toLowerCase() !== 'free' && targetPlan.name.toLowerCase() !== subscription?.plan_name?.toLowerCase()) {
                    handleUpgrade(targetPlan.id);
                }
            } else {
                console.warn(`Plan ${planFromUrl} not found in available plans.`);
            }
        }
    }, [planFromUrl, plans, selectedOrg, loading, subscription]);

    const loadInitial = async () => {
        setLoading(true);
        setUsingFallbackPlans(false);
        try {
            const planData = await billingService.listPlans();
            const orgData = await organizationService.list().catch(() => []);

            if (planData?.length) {
                setPlans(planData);
            } else {
                console.error('No plans returned from API:', planData);
                setPlans(FALLBACK_PLANS);
                setUsingFallbackPlans(true);
                setError('Billing plans failed to load. Please contact support if this persists.');
            }

            setOrgs(orgData || []);
            if (orgData?.length) setSelectedOrg(orgData[0]);
        } catch (err) {
            console.error('Error loading initial data:', err);
            setPlans(FALLBACK_PLANS);
            setUsingFallbackPlans(true);
            setError(`Failed to load billing data: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadBillingData = async (orgId) => {
        try {
            const [sub, inv, usage] = await Promise.all([
                billingService.getSubscription(orgId),
                billingService.listInvoices(orgId),
                billingService.getUsageBreakdown(orgId)
            ]);
            setSubscription(sub);
            setInvoices(inv || []);
            setUsageBreakdown(usage);
        } catch (err) {
            setError('Failed to load billing data');
        }
    };

    const handleUpgrade = async (planId) => {
        if (!selectedOrg) { setError('Please select an organization first'); return; }
        if (!planId) { setError('Plan is unavailable. Please refresh and try again.'); return; }
        setUpgradeLoading(planId);
        setError(''); // Clear previous errors
        try {
            const redirectUrl = `${window.location.origin}/dashboard`;
            const result = await billingService.initiateCheckout(selectedOrg.id, planId, redirectUrl);
            // ✅ FIX: backend returns checkout_url, not payment_url
            const url = result?.checkout_url || result?.payment_url;
            if (url) {
                window.location.href = url;
            } else {
                setError('No checkout URL provided by server');
            }
        } catch (err) {
            // Handle both Error objects and Axios error responses
            const errorMsg = err.message || err.response?.data?.detail || 'Failed to initiate checkout';
            setError(errorMsg);
            console.error('Checkout error:', err);
        } finally {
            setUpgradeLoading(null);
        }
    };

    const handleManageSubscription = async () => {
        if (!selectedOrg) return;
        setLoading(true);
        setError('');
        try {
            const result = await billingService.createPortalSession(selectedOrg.id);
            // ✅ FIX: backend returns portal_url, not url
            const url = result?.portal_url || result?.url;
            if (url) {
                window.location.href = url;
            } else {
                setError('No portal URL provided by server');
            }
        } catch (err) {
            const errorMsg = err.message || err.response?.data?.detail || 'Failed to open customer portal';
            setError(errorMsg);
            console.error('Portal session error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelSubscription = async () => {
        if (!selectedOrg) return;
        if (!window.confirm('Cancel subscription? Your org will be downgraded to Free at the end of the billing period.')) return;
        setError('');
        try {
            await billingService.cancelSubscription(selectedOrg.id);
            toast.success('Subscription cancelled. You will retain access until the end of the billing period.');
            loadBillingData(selectedOrg.id);
        } catch (err) {
            const errorMsg = err.message || err.response?.data?.detail || 'Failed to cancel subscription';
            toast.error(errorMsg);
            console.error('Cancel subscription error:', err);
        }
    };

    const usedPct = subscription && subscription.minutes_total && subscription.minutes_total > 0
        ? Math.min(100, Math.round((subscription.minutes_used / subscription.minutes_total) * 100))
        : 0;

    const isCurrentPlan = (planName) =>
        subscription?.plan_name?.toLowerCase() === planName.toLowerCase();

    return (
        <div className="space-y-12 pb-24 text-white">
            {/* Header */}
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div>
                    <h1 className="text-5xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">Nexus Billing</h1>
                    <p className="text-slate-500 text-[10px] mt-2 font-black uppercase tracking-[0.3em]">Billing & Subscription • Multi-Org Resource Management</p>
                </div>
                {orgs.length > 0 && (
                    <div className="relative group">
                        <div className="absolute inset-0 bg-indigo-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 w-4 h-4 z-10" />
                        <select
                            className="pl-12 pr-12 py-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:border-indigo-500/50 appearance-none cursor-pointer text-white relative z-10 transition-all hover:bg-white/10 min-w-[240px]"
                            value={selectedOrg?.id || ''}
                            onChange={(e) => setSelectedOrg(orgs.find(o => o.id === e.target.value))}
                        >
                            {orgs.map(o => (
                                <option key={o.id} value={o.id} className="bg-slate-900">{o.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none z-10" />
                    </div>
                )}
            </header>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-bold">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                </div>
            )}

            {usingFallbackPlans && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 text-sm font-bold">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    Unable to load pricing plans. Please <button onClick={() => window.location.reload()} className="underline hover:text-amber-300 transition-colors">refresh the page</button> to try again.
                </div>
            )}

            {/* Current Usage */}
            {subscription ? (
                <section className="bg-white/[0.02] border border-white/5 rounded-[40px] p-10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32" />
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Active Authorization</p>
                            <div className="flex items-center gap-4">
                                <h2 className="text-3xl font-black italic tracking-tighter">{subscription.plan_name || 'Free'} Plan</h2>
                                <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border shadow-2xl transition-all ${subscription.cancel_at_period_end
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : subscription.status === 'active'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                    {subscription.cancel_at_period_end ? 'Scheduled Cancellation' : (subscription.status || 'unknown')}
                                </span>
                            </div>
                        </div>
                        <div className="text-left md:text-right flex flex-col items-end gap-2">
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Cycle Synchronization</p>
                            <p className="font-black text-slate-300 text-sm mb-4">{formatDate(subscription.current_period_end)}</p>
                            <div className="flex flex-wrap gap-2 justify-end">
                                <button
                                    onClick={handleManageSubscription}
                                    className="flex items-center gap-2 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    <ExternalLink size={12} /> Manage in PayPal
                                </button>
                                {subscription.status === 'active' &&
                                    subscription.plan_name?.toLowerCase() !== 'free' &&
                                    !subscription.cancel_at_period_end && (
                                        <button
                                            onClick={handleCancelSubscription}
                                            className="flex items-center gap-2 px-6 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            Cancel Plan
                                        </button>
                                    )}
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">AI Minutes Usage</span>
                            <span className="text-2xl font-black italic tracking-tighter text-white">
                                {subscription.minutes_used?.toLocaleString() || 0}
                                <span className="text-slate-600 font-black text-xs lowercase ml-2">/ {subscription.minutes_total?.toLocaleString()} Limit</span>
                            </span>
                        </div>
                        <div className="h-4 bg-black/40 rounded-full overflow-hidden p-1 border border-white/5 shadow-inner">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 relative ${usedPct > 80 ? 'bg-gradient-to-r from-rose-600 to-orange-500' : 'bg-gradient-to-r from-indigo-600 to-blue-500'}`}
                                style={{ width: `${usedPct}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            </div>
                        </div>
                        <div className="flex justify-between mt-3">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">System Load: {usedPct}%</p>
                            <p className="text-[10px] text-indigo-400/60 font-black uppercase tracking-widest">Stable Core</p>
                        </div>
                    </div>

                    {/* Breakdown Addition */}
                    {usageBreakdown && (
                        <div className="mt-10 pt-10 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-5 bg-white/[0.02] rounded-[32px] border border-white/5">
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">AI Processing</p>
                                <p className="text-xl font-black italic tracking-tighter">{(usageBreakdown.ai_minutes || 0).toLocaleString()} <span className="text-[10px] non-italic text-slate-500 ml-1">MIN</span></p>
                            </div>
                            <div className="p-5 bg-white/[0.02] rounded-[32px] border border-white/5">
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Vector Storage</p>
                                <p className="text-xl font-black italic tracking-tighter">{(usageBreakdown.storage_gb || 0).toFixed(2)} <span className="text-[10px] non-italic text-slate-500 ml-1">GB</span></p>
                            </div>
                            <div className="p-5 bg-white/[0.02] rounded-[32px] border border-white/5">
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Live Stream Relay</p>
                                <p className="text-xl font-black italic tracking-tighter">{(usageBreakdown.human_minutes || 0).toLocaleString()} <span className="text-[10px] non-italic text-slate-500 ml-1">MIN</span></p>
                            </div>
                        </div>
                    )}
                </section>
            ) : (
                <div className="flex items-center justify-center p-12 bg-white/[0.02] border border-white/5 rounded-[40px]">
                    <div className="text-center">
                        <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest">Unable to load subscription details</p>
                        <p className="text-slate-500 text-sm mt-2">Check your connection or try refreshing the page</p>
                    </div>
                </div>
            )}

            {/* Plans Grid */}
            <section>
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h2 className="text-3xl font-black italic tracking-tighter uppercase">Available Tiers</h2>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Scale your output capacity</p>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent mx-8 mb-3" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {plans.map((plan) => {
                        const isCurrent = isCurrentPlan(plan.name);
                        const isPro = plan.name === 'Pro';
                        return (
                            <div key={plan.id} className={`group relative flex flex-col p-10 rounded-[48px] border transition-all duration-500 ${isPro ? 'bg-gradient-to-b from-indigo-500/10 to-transparent border-indigo-500/40 shadow-[0_32px_64px_-16px_rgba(79,70,229,0.1)] scale-105 z-10' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
                                {isPro && (
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-[0.3em] px-6 py-2 rounded-full shadow-2xl">
                                        Optimization Target
                                    </div>
                                )}
                                {isCurrent && (
                                    <div className="absolute -top-5 right-10 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-[0.3em] px-6 py-2 rounded-full shadow-2xl">
                                        Authorized
                                    </div>
                                )}

                                <h3 className="text-3xl font-black italic tracking-tighter mb-2">{plan.name}</h3>
                                <div className="mb-10">
                                    <span className="text-5xl font-black tracking-tighter">${plan.price_monthly}</span>
                                    <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-3">/ Cycle</span>
                                </div>

                                <ul className="space-y-4 mb-12 flex-1">
                                    {[
                                        `${plan.minutes_included.toLocaleString()} AI minutes`,
                                        `${plan.features.rooms} logical clusters`,
                                        `${plan.features.retention} trace retention`,
                                        `Up to ${plan.features.members} operators`,
                                        plan.features.support,
                                        plan.overage_rate_per_min > 0 ? `$${plan.overage_rate_per_min}/min excess` : 'Quota-hard limit'
                                    ].map((feat, i) => (
                                        <li key={i} className="flex items-start gap-4 text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-200 transition-colors">
                                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,1)]" /> {feat}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handleUpgrade(plan.id)}
                                    disabled={isCurrent || upgradeLoading === plan.id || usingFallbackPlans}
                                    title={usingFallbackPlans ? 'Plans failed to load. Please refresh the page.' : ''}
                                    className={`w-full py-5 rounded-[32px] font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${isCurrent
                                        ? 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed'
                                        : usingFallbackPlans
                                            ? 'bg-slate-700/30 text-slate-500 border border-slate-600/30 cursor-not-allowed'
                                            : isPro
                                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xl shadow-indigo-500/40 hover:scale-[1.02] active:scale-95'
                                                : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:scale-[1.02] active:scale-95'
                                        }`}
                                >
                                    {upgradeLoading === plan.id ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /> Processing</>
                                    ) : usingFallbackPlans ? (
                                        <><AlertCircle className="w-4 h-4" /> Plans Unavailable</>
                                    ) : isCurrent ? (
                                        <><CheckCircle2 className="w-4 h-4" /> Current Plan</>
                                    ) : (
                                        <><Zap className="w-4 h-4" /> Initialize Upgrade</>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Invoice History */}
            <section className="bg-slate-900/40 border border-slate-800/70 rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
                    <h3 className="text-lg font-black uppercase italic tracking-tight">Invoice History</h3>
                    <Clock className="w-5 h-5 text-slate-600" />
                </div>
                {invoices.length === 0 ? (
                    <div className="py-16 text-center">
                        <CreditCard className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">No Invoices Yet</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                <th className="px-6 py-4">Period</th>
                                <th className="px-6 py-4">Plan</th>
                                <th className="px-6 py-4">Minutes</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Download</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {invoices.map((inv) => (
                                <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 text-sm font-bold">{formatDate(inv.period_start)} – {formatDate(inv.period_end)}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">{inv.plan_name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">{inv.minutes_used?.toLocaleString()} min</td>
                                    <td className="px-6 py-4 text-sm font-black">${Number(inv.total_amount || 0).toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <a
                                            href={inv.pdf_url || '#'}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                                            title="Download PDF"
                                        >
                                            <Download className="w-4 h-4" />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Security note */}
            <div className="flex items-center gap-4 p-5 bg-slate-900/30 border border-slate-800/50 rounded-2xl">
                <ShieldCheck className="text-indigo-400 shrink-0" size={24} />
                <p className="text-sm text-slate-400 font-medium">
                    All payments are processed securely by <span className="text-white font-bold">PayPal</span>. No card details are stored on our servers.
                </p>
            </div>
        </div>
    );
}
