import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { CreditCard, AlertCircle, DollarSign, RefreshCw, RotateCcw, TrendingUp, Calendar, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminBillingAdmin() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [failedPayments, setFailedPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refunding, setRefunding] = useState(null);
    const [revenue, setRevenue] = useState(null);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            adminService.listSubscriptions(),
            adminService.listFailedPayments(),
            adminService.getRevenueStats().catch(() => null)
        ]).then(([subs, fails, rev]) => {
            setSubscriptions(Array.isArray(subs) ? subs : []);
            setFailedPayments(Array.isArray(fails) ? fails : []);
            setRevenue(rev);
        }).finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleRefund = async (invoiceId) => {
        if (!window.confirm('Process refund for this invoice?')) return;
        setRefunding(invoiceId);
        try {
            await adminService.processRefund(invoiceId);
            toast.success('Refund processed');
            setFailedPayments(p => p.filter(f => f.id !== invoiceId));
        } catch {
            toast.error('Failed to process refund');
        } finally {
            setRefunding(null);
        }
    };

    const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const metricCards = [
        { label: 'Active MRR', value: revenue?.mrr !== undefined ? `$${revenue.mrr.toLocaleString()}` : '$0.00', icon: TrendingUp, color: 'text-emerald-400' },
        { label: 'Active Subscriptions', value: subscriptions.filter(s => s.status === 'active').length, icon: CreditCard, color: 'text-indigo-400' },
        { label: 'Failed Payments', value: failedPayments.length, icon: AlertCircle, color: 'text-rose-400' },
    ];

    return (
        <div className="space-y-6 sm:space-y-10 text-white animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Financial Hub</h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1">Global Revenue & Billing Control</p>
                </div>
                <button 
                    onClick={loadData} 
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Update Ledger
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
                {metricCards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 flex items-center gap-4 group hover:border-white/10 transition-all">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Icon size={18} className={color} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
                            <p className="text-xl sm:text-2xl font-black truncate">{loading ? '…' : value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 items-start">
                {/* Main Subscription Table */}
                <div className="lg:col-span-8 bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px] overflow-hidden flex flex-col min-h-[400px]">
                    <div className="px-6 sm:px-8 py-5 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-slate-400">All Subscriptions</h3>
                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-600 bg-white/5 px-2 py-1 rounded-md">{subscriptions.length} active</span>
                    </div>
                    <div className="overflow-x-auto flex-1 h-full scrollbar-thin scrollbar-thumb-white/10">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                                    <th className="px-6 py-4">Organization</th>
                                    <th className="px-6 py-4 hidden sm:table-cell">Plan</th>
                                    <th className="px-6 py-4">Status / Renewal</th>
                                    <th className="px-6 py-4 text-right">Consumption</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-xs sm:text-sm">
                                {loading && subscriptions.length === 0 ? (
                                [1, 2, 3].map(i => (
                                    <tr key={i}><td colSpan={4} className="px-6 py-12"><div className="h-4 bg-white/5 rounded animate-pulse w-full"/></td></tr>
                                ))
                                ) : subscriptions.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-20 text-center"><p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">No active subscriptions found</p></td></tr>
                                ) : subscriptions.map((s, i) => (
                                    <tr key={s.id || i} className="hover:bg-white/[0.02] group transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="font-black group-hover:text-indigo-400 transition-colors truncate max-w-[120px] sm:max-w-none">{s.org_name || s.organization_id}</p>
                                            <p className="text-[10px] text-slate-500 font-mono tracking-tighter truncate max-w-[100px] sm:max-w-none">{s.id}</p>
                                        </td>
                                        <td className="px-6 py-4 hidden sm:table-cell">
                                            <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-tighter">{s.plan_name || '—'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`inline-flex w-fit px-1.5 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                                    {s.status}
                                                </span>
                                                <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                    <Calendar size={10} className="shrink-0" />
                                                    {formatDate(s.current_period_end)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <p className="font-black text-indigo-400">{(s.minutes_used || 0).toLocaleString()} min</p>
                                                <div className="w-16 h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden border border-white/5">
                                                    <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (s.minutes_used / (s.minutes_total || 1000)) * 100)}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Sidebar Alerts / Recoveries */}
                <div className="lg:col-span-4 space-y-6 sm:space-y-8 h-full">
                    {/* Failed Payments */}
                    <AnimatePresence mode="wait">
                        {failedPayments.length > 0 ? (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-rose-500/5 border border-rose-500/20 rounded-[32px] sm:rounded-[40px] overflow-hidden"
                            >
                                <div className="px-6 sm:px-8 py-5 border-b border-rose-500/20 flex items-center gap-3">
                                    <AlertCircle size={16} className="text-rose-400" />
                                    <h3 className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-rose-400">Arrears ({failedPayments.length})</h3>
                                </div>
                                <div className="divide-y divide-rose-500/10">
                                    {failedPayments.map((f, i) => (
                                        <div key={f.id || i} className="px-6 sm:px-8 py-5 group">
                                            <div className="flex items-center justify-between gap-4 mb-3">
                                                <div className="min-w-0">
                                                    <p className="font-black text-xs sm:text-sm truncate">{f.org_name || 'Organization'}</p>
                                                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{formatDate(f.created_at)}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-black text-rose-400 text-sm sm:text-base">${(f.amount || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRefund(f.id)} 
                                                disabled={refunding === f.id}
                                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {refunding === f.id ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                                Reconcile
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ) : (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[32px] sm:rounded-[40px] p-8 sm:p-10 flex flex-col items-center text-center">
                                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                                    <Layers size={24} className="text-emerald-400" />
                                </div>
                                <h4 className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-emerald-400 mb-2">Clear Records</h4>
                                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-tighter">No outstanding debt detected in systemic monitoring.</p>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Revenue Trends Placeholder Card */}
                    <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] -mr-16 -mt-16 pointer-events-none" />
                        <h4 className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-slate-400 mb-6 flex items-center gap-2">
                             System Logic <DollarSign size={12} className="text-indigo-400" />
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5">
                                <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Growth</p>
                                <span className="text-[10px] sm:text-xs font-black text-emerald-400">+{revenue?.growth || 0}%</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5">
                                <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Churn</p>
                                <span className="text-[10px] sm:text-xs font-black text-rose-400">0.0%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
