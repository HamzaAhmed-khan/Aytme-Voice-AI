import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Zap, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function QuotaLimitModal({ isOpen, onClose, quotaInfo }) {
  const navigate = useNavigate();

  if (!isOpen || !quotaInfo) return null;

  const isRoomLimit = quotaInfo?.type === 'max_rooms';
  const isTrialEnded = quotaInfo?.type === 'trial_ended';
  const isSubscriptionExpired = quotaInfo?.type === 'subscription_expired';
  
  const limit = quotaInfo?.limit || (isRoomLimit ? 3 : 60);
  const current = quotaInfo?.current || 0;

  let title = "Quota Reached";
  let description = isRoomLimit 
    ? `You've reached your organization's limit of ${limit} concurrent rooms.`
    : `You've utilized all ${limit} translation minutes included in your current plan.`;

  if (isTrialEnded) {
    title = "Trial Ended";
    description = "Your free trial has concluded. Upgrade to a paid plan to continue creating sessions and using real-time translation.";
  } else if (isSubscriptionExpired) {
    title = "Subscription Expired";
    description = "Your current subscription is no longer active. Please update your payment method or upgrade to restore access.";
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-start overflow-y-auto p-4 md:p-10 bg-black/60 backdrop-blur-md custom-scrollbar"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          className="v2-card my-auto max-w-md w-full bg-v2-header border-v2-border p-0 overflow-hidden shadow-3xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header Gradient */}
          <div className="h-2 bg-gradient-to-r from-v2-accent via-indigo-500 to-purple-500" />
          
          <div className="p-8 text-center">
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 text-v2-muted hover:text-v2-text p-1 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="w-20 h-20 bg-v2-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-v2-accent">
              <ShieldAlert size={40} strokeWidth={1.5} />
            </div>

            <h2 className="text-3xl font-bold tracking-tighter uppercase text-v2-text mb-2">
              {title}
            </h2>
            <p className="text-v2-muted text-sm font-medium mb-8">
              {description}
            </p>

            {/* Progress/Limit Visual */}
            <div className="bg-v2-header/50 border border-v2-border/30 rounded-xl p-6 mb-10">
              <div className="flex justify-between items-end mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-v2-muted">Plan Utilization</span>
                <span className="text-xl font-bold text-v2-accent">{current}/{limit}</span>
              </div>
              <div className="w-full h-2 bg-v2-border/20 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((current/limit)*100, 100)}%` }}
                  className="h-full bg-v2-accent"
                />
              </div>
              <p className="text-[9px] text-v2-muted font-bold uppercase tracking-widest mt-4 text-left">
                {isRoomLimit ? 'Usage Tip: Terminate old sessions to free up room slots.' : 'Usage Tip: Upgrade to Business for unlimited translation minutes.'}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  navigate('/billing');
                  onClose();
                }}
                className="w-full py-4 bg-v2-accent text-white rounded-lg font-bold uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 shadow-lg shadow-v2-accent/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap size={16} fill="currentColor" />
                Upgrade Your Plan
                <ArrowRight size={16} />
              </button>
              
              <button
                onClick={onClose}
                className="w-full py-4 text-v2-muted hover:text-v2-text font-bold uppercase tracking-widest text-[10px] transition-colors"
              >
                Continue with limited access
              </button>
            </div>
          </div>

          <div className="bg-v2-header px-8 py-4 border-t border-v2-border/30">
            <p className="text-[9px] text-v2-muted font-medium text-center italic">
              Need help? Contact support@aytme.com for enterprise custom scaling.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
