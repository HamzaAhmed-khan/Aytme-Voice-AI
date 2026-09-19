import { create } from 'zustand';
import { organizationService, billingService } from '../services/api';

export const useOrganizationStore = create((set, get) => ({
    organizations: [],
    currentOrg: null,
    subscription: null,
    usage: {
        minutes_used: 0,
        minutes_remaining: 0,
        quota_percent: 0
    },
    isLoading: false,
    error: null,

    setOrganizations: (organizations) => set({ organizations }),
    setCurrentOrg: (org) => set({ currentOrg: org }),
    setSubscription: (subscription) => set({ subscription }),
    updateUsage: (usageData) => set((state) => ({
        usage: { ...state.usage, ...usageData }
    })),

    fetchOrganizations: async () => {
        set({ isLoading: true });
        try {
            const orgs = await organizationService.list();
            set({ organizations: orgs, error: null });
            if (orgs.length > 0 && !get().currentOrg) {
                set({ currentOrg: orgs[0] });
            }
            return orgs;
        } catch (err) {
            set({ error: 'Failed to fetch organizations' });
            return [];
        } finally {
            set({ isLoading: false });
        }
    },

    fetchSubscription: async (orgId) => {
        if (!orgId) return null;
        try {
            const sub = await billingService.getSubscription(orgId);
            set({ subscription: sub, error: null });
            return sub;
        } catch (err) {
            console.error('[OrgStore] Subscription fetch failed');
            return null;
        }
    },

    isRestricted: () => {
        const sub = get().subscription;
        if (!sub) return false;
        
        // Status checks
        const restrictedStatuses = ['past_due', 'canceled', 'unpaid'];
        if (restrictedStatuses.includes(sub.status)) return true;
        
        // Trial ended check (30 days)
        if (sub.status === 'trialing' && sub.current_period_end) {
            if (new Date(sub.current_period_end) < new Date()) return true;
        }

        // Trial minutes cap (60 mins)
        if (sub.status === 'trialing' && (sub.minutes_used || 0) >= 60) {
            return true;
        }

        // Quota check
        if (sub.minutes_total > 0 && sub.minutes_used >= sub.minutes_total) {
            return true;
        }

        return false;
    },

    reset: () => set({
        organizations: [],
        currentOrg: null,
        subscription: null,
        usage: {
            minutes_used: 0,
            minutes_remaining: 0,
            quota_percent: 0
        },
        isLoading: false,
        error: null
    })
}));
