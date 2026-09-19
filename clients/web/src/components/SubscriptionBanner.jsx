import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useOrganizationStore } from '../store/organizationStore';
import { useAuthStore } from '../store/authStore';

const ADMIN_EMAILS = ['aytme.admin@gmail.com', 'moesheacorp@gmail.com'];

export default function SubscriptionBanner() {
  const navigate = useNavigate();
  const { subscription, currentOrg } = useOrganizationStore();
  const { user } = useAuthStore();

  // Never show the banner on admin accounts
  if (!subscription || !currentOrg) return null;
  if (user?.role === 'admin' || ADMIN_EMAILS.includes(user?.email?.toLowerCase())) return null;

  const status = subscription.status;
  const isTrial = status === 'trialing' || subscription.plan_name === 'Free';
  const trialMinutesCap = 60; // Free trial = 60 minutes cap
  const minutesUsed = subscription.minutes_used || 0;
  const isOverQuota = (subscription.minutes_total > 0 && minutesUsed >= subscription.minutes_total) ||
                      (isTrial && minutesUsed >= trialMinutesCap);
  const hasExpired = (isTrial && new Date(subscription.current_period_end) < new Date()) ||
                    ['past_due', 'canceled', 'unpaid'].includes(status);
  const daysLeft = subscription.days_remaining ?? Math.max(0, Math.ceil(
    (new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)
  ));
  const isExpiringSoon = subscription.is_expiring_soon || (status === 'active' && daysLeft <= 7);

  // Show for: expired, over quota, trial active, or active subscription expiring soon
  const shouldShow = hasExpired || isOverQuota || isTrial || isExpiringSoon;
  if (!shouldShow) return null;

  let config = {
    icon: Zap,
    bg: 'bg-v2-accent/10',
    border: 'border-v2-accent/20',
    text: 'text-v2-accent',
    message: 'Upgrade to Unlock full capabilities',
    cta: 'Upgrade Plan'
  };

  if (hasExpired) {
    config = {
      icon: AlertTriangle,
      bg: 'bg-rose-500 shadow-2xl shadow-rose-500/20',
      border: 'border-rose-400',
      text: 'text-white',
      message: isTrial ? 'Free Trial Ended — Purchase Starter Pack to Continue' : 'Subscription Expired: Service Restricted',
      cta: 'Buy Starter Pack',
      subtext: 'text-rose-100'
    };
  } else if (isOverQuota) {
    config = {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-500',
      message: isTrial ? 'Trial minutes exhausted (60 min limit reached).' : 'Monthly translation minutes consumed.',
      cta: 'Buy Starter Pack'
    };
  } else if (isExpiringSoon && !isTrial) {
    config = {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-600',
      message: `Subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — renew to avoid interruption.`,
      cta: 'Renew Plan'
    };
  } else if (isTrial) {
    const minsLeft = Math.max(0, trialMinutesCap - minutesUsed);
    config = {
      icon: Clock,
      bg: 'bg-v2-accent/5',
      border: 'border-v2-accent/10',
      text: 'text-v2-accent',
      message: `Free trial active — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} & ${minsLeft} mins remaining.`,
      cta: 'Buy Starter Pack'
    };
  }

  const Icon = config.icon;

  return (
    <div className={`w-full p-4 mb-6 rounded-xl border ${config.bg} ${config.border} flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-white/20 ${config.text} border ${config.border}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className={`text-xs font-bold uppercase tracking-widest ${config.text}`}>{config.message}</p>
          <p className={`${config.subtext || 'text-v2-muted'} text-[10px] font-medium pt-0.5`}>Maintain continuous access to real-time AI translation services.</p>
        </div>
      </div>
      <button
        onClick={() => navigate('/billing')}
        className={`px-6 py-2.5 rounded-lg bg-white border ${config.border} text-rose-600 text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-2 hover:bg-v2-background transition-all shadow-xl active:scale-95`}
      >
        {config.cta}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
