import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService } from '../services/api';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,
            isLoading: true,
            error: null,
            pendingPlan: null,

            setUser: (user) => set({ user, isAuthenticated: !!user }),
            setLoading: (isLoading) => set({ isLoading }),
            setError: (error) => set({ error }),
            setPendingPlan: (plan) => set({ pendingPlan: plan }),

            validateSession: async () => {
                const token = localStorage.getItem('token');
                if (!token) {
                    set({ isAuthenticated: false, isLoading: false, user: null });
                    return;
                }
                set({ isLoading: true });
                try {
                    const userData = await authService.validate();
                    set({ user: userData, isAuthenticated: true, error: null });
                } catch (err) {
                    console.log('[AuthStore] Session validation failed.');
                    // Only clear auth if token is truly gone (not just a transient 500)
                    if (!localStorage.getItem('token')) {
                        set({ user: null, isAuthenticated: false });
                    } else {
                        // Token exists but /users/me failed — keep authenticated, clear user data
                        console.warn('[AuthStore] Token exists but validation failed — keeping auth state');
                        set({ isAuthenticated: true });
                    }
                } finally {
                    set({ isLoading: false });
                }
            },

            logout: () => {
                authService.logout();
                
                // Clear local caches used for UI performance
                localStorage.removeItem('usage_cache');
                localStorage.removeItem('subscription_cache');
                
                // Clear org storage directly
                localStorage.removeItem('aytme-org-storage');
                
                // Reset store state
                set({ user: null, isAuthenticated: false, pendingPlan: null, error: null });
                
                // Note: We avoid dynamic imports inside the sync logout call to prevent hangs
                // The next session validation or navigation will naturally refresh the state.
                window.location.href = '/login';
            }
        }),
        {
            name: 'aytme-auth-storage',
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                pendingPlan: state.pendingPlan
            })
        }
    )
);
