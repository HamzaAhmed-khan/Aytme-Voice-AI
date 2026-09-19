import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Error interceptor - handle API errors properly
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle 401 Unauthorized - token expired or cleared (common on mobile)
        if (error.response?.status === 401) {
            const url = error.config?.url || '';
            // Don't redirect if we're already on auth endpoints
            const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/signup') || 
                                   url.includes('/auth/request-otp') || url.includes('/auth/login-otp');
            if (!isAuthEndpoint) {
                console.warn('[API] 401 Unauthorized — token expired or invalid, redirecting to login');
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                // Only redirect if not already on login page
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                }
            }
        }

        // Detect Quota Exceeded and trigger global modal
        const detail = error.response?.data?.detail;
        if (detail?.code === 'QUOTA_EXCEEDED') {
            window.dispatchEvent(new CustomEvent('show-quota-limit', { detail }));
        }
        
        // Always throw error to be handled by caller
        throw error;
    }
);

// ─── AUTH ───────────────────────────────────────────────────
export const authService = {
    signup: async (email, password, fullName) => {
        const res = await api.post('/auth/signup', { email, password, full_name: fullName });
        return res.data;
    },
    login: async (username, password) => {
        const params = new URLSearchParams({ username, password });
        const res = await api.post('/auth/login', params);
        localStorage.setItem('token', res.data.access_token);
        sessionStorage.removeItem('token');
        return res.data;
    },
    // Validate credentials without storing token (used before OTP)
    validateCredentials: async (username, password) => {
        const params = new URLSearchParams({ username, password });
        const res = await api.post('/auth/login', params);
        // Do NOT store token — OTP must be verified first
        return res.data;
    },
    logout: () => {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
    },
    validate: async () => (await api.get('/users/me')).data,
    forgotPassword: async (email) => (await api.post('/auth/forgot-password', { email })).data,
    resetPassword: async (token, newPassword) =>
        (await api.post('/auth/reset-password', { token, new_password: newPassword })).data,
    verifyEmail: async (token) =>
        (await api.post('/auth/verify-email', { token })).data,
    requestOtp: async (email) => (await api.post('/auth/request-otp', { email })).data,
    loginOtp: async (email, otp) => {
        const res = await api.post('/auth/login-otp', { email, otp });
        localStorage.setItem('token', res.data.access_token);
        return res.data;
    },
};

// ─── ROOMS ──────────────────────────────────────────────────
export const roomService = {
    listRooms: async () => (await api.get('/rooms/')).data,
    getRoom: async (roomId) => (await api.get(`/rooms/${roomId}`)).data,
    createRoom: async (data) => {
        const res = await api.post('/rooms/', data);
        return res.data;
    },
    updateRoom: async (roomId, data) => (await api.patch(`/rooms/${roomId}`, data)).data,
    deleteRoom: async (roomId) => { await api.delete(`/rooms/${roomId}`); },
    getToken: async (roomId) => (await api.post(`/rooms/${roomId}/token`)).data,
    startBot: async (roomId, languages = {}) => (await api.post(`/rooms/${roomId}/start`, languages)).data,
    getBotStatus: async (roomId) => (await api.get(`/rooms/${roomId}/bot-status`)).data,
    endRoom: async (roomId) => (await api.post(`/rooms/${roomId}/end`)).data,
    updatePreferences: async (roomId, prefs) => (await api.post(`/rooms/${roomId}/preferences`, prefs)).data,
};

// ─── ORGANIZATIONS ──────────────────────────────────────────
export const organizationService = {
    list: async () => (await api.get('/organizations/')).data,
    get: async (id) => (await api.get(`/organizations/${id}`)).data,
    create: async (data) => (await api.post('/organizations/', data)).data,
    update: async (id, data) => (await api.patch(`/organizations/${id}`, data)).data,
    delete: async (id) => { await api.delete(`/organizations/${id}`); },
    leave: async (id) => (await api.post(`/organizations/${id}/leave`)).data,

    // Member management
    listMembers: async (orgId) => (await api.get(`/organizations/${orgId}/members`)).data,
    updateMemberRole: async (org_id, user_id, role) =>
        (await api.patch(`/organizations/${org_id}/members/${user_id}`, null, { params: { role } })).data,
    removeMember: async (org_id, user_id) => { await api.delete(`/organizations/${org_id}/members/${user_id}`); },
    addMember: async (org_id, email, role = 'member') =>
        (await api.post(`/organizations/${org_id}/members/add`, { email, role })).data,
    transferOwnership: async (org_id, new_owner_user_id) =>
        (await api.post(`/organizations/${org_id}/transfer-ownership`, { new_owner_user_id })).data,

    // Invitations for org rooms
    inviteMember: async (roomId, role, expiresHours = 48) => {
        const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
        return (await api.post(`/invitations/${roomId}/invite`, { role, max_uses: 1, expires_at: expiresAt })).data;
    },
};

// ─── BILLING ────────────────────────────────────────────────
export const billingService = {
    listPlans: async () => {
        try {
            const res = await api.get('/billing/plans');
            return res.data || [];
        } catch (err) {
            console.error('Failed to load billing plans:', err.response?.status, err.message);
            return [];
        }
    },
    getSubscription: async (orgId) => {
        try {
            const res = await api.get(`/billing/organization/${orgId}/subscription`);
            return res.data;
        } catch (err) {
            console.error('Failed to load subscription:', err.response?.status, err.message);
            return null;
        }
    },
    listInvoices: async (orgId) => {
        try {
            const res = await api.get(`/billing/organization/${orgId}/invoices`);
            return res.data || [];
        } catch (err) {
            console.error('Failed to load invoices:', err.response?.status, err.message);
            return [];
        }
    },
    // ✅ FIXED: was /checkout → now /checkout-session
    initiateCheckout: async (orgId, planId, redirectUrl, discountCode) => {
        try {
            const resolvedPlanId = (planId && typeof planId === 'object' && planId.id) ? planId.id : planId;
            if (!resolvedPlanId) throw new Error('Plan is unavailable. Please refresh and try again.');
            const finalRedirectUrl = redirectUrl || `${window.location.origin}/billing`;
            const body = { plan_id: resolvedPlanId, redirect_url: finalRedirectUrl };
            if (discountCode) body.discount_code = discountCode;
            const res = await api.post(`/billing/organization/${orgId}/checkout-session`, body);
            return res.data; // { checkout_url: '...' }
        } catch (err) {
            console.error('Checkout failed:', err.response?.status, err.message);
            const detail = err.response?.data?.detail;
            const message = Array.isArray(detail)
                ? detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', ')
                : (detail || err.message || 'Failed to initiate checkout');
            const error = new Error(message);
            error.response = err.response;
            throw error;
        }
    },
    // Subscription Management
    cancelSubscription: async (orgId) => {
        try {
            const res = await api.post(`/billing/organization/${orgId}/cancel-subscription`);
            return res.data;
        } catch (err) {
            console.error('Cancel subscription failed:', err.response?.status, err.message);
            const detail = err.response?.data?.detail || err.message || 'Failed to cancel subscription';
            const error = new Error(detail);
            error.response = err.response;
            throw error;
        }
    },
    getUsageSummary: async (orgId) => {
        try {
            const res = await api.get(`/billing/organization/${orgId}/usage/summary`);
            return res.data;
        } catch (err) {
            console.error('Failed to load usage summary:', err.response?.status, err.message);
            return null;
        }
    },
    getUsageBreakdown: async (orgId) => {
        try {
            const res = await api.get(`/billing/organization/${orgId}/usage/breakdown`);
            return res.data;
        } catch (err) {
            console.error('Failed to load usage breakdown:', err.response?.status, err.message);
            return null;
        }
    },
    verifySession: async (sessionId, subscriptionId, orgId) => {
        try {
            const params = new URLSearchParams();
            if (subscriptionId) params.append('subscription_id', subscriptionId);
            if (sessionId) params.append('session_id', sessionId);
            if (orgId) params.append('org_id', orgId);
            
            const res = await api.post(`/billing/verify-session?${params.toString()}`);
            return res.data;
        } catch (err) {
            console.error('Session verification failed:', err.response?.status, err.message);
            throw err;
        }
    },
    recordUsage: async (orgId, roomId, minutes) => {
        try {
            const body = { minutes: parseFloat(minutes.toFixed(4)) };
            if (roomId) body.room_id = roomId;
            const res = await api.post(`/billing/organization/${orgId}/usage/record`, body);
            return res.data;
        } catch (err) {
            console.warn('[billing] recordUsage failed (non-fatal):', err.response?.status, err.message);
            return null;
        }
    },
    validateDiscount: async (code) => {
        try {
            const res = await api.post(`/billing/validate-discount?code=${encodeURIComponent(code)}`);
            return res.data;
        } catch (err) {
            const detail = err.response?.data?.detail || 'Invalid discount code';
            const error = new Error(detail);
            error.response = err.response;
            throw error;
        }
    },
};

// ─── INVITATIONS ────────────────────────────────────────────
export const invitationService = {
    validateToken: async (token) => (await api.get(`/invitations/validate/${token}`)).data,
    joinWithToken: async (token, displayName) =>
        (await api.post(`/invitations/join/${token}`, null, { params: { display_name: displayName } })).data,
    createInvite: async (roomId, role = 'speaker', maxUses = 10, expiresHours = 24) => {
        const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
        return (await api.post(`/invitations/${roomId}/invite`, {
            role,
            max_uses: maxUses,
            expires_at: expiresAt
        })).data;
    },
};

// ─── LOBBY (WAITING ROOM) ──────────────────────────────────
export const lobbyService = {
    requestJoin: async (roomId, identity) => (await api.post(`/rooms/${roomId}/lobby/request`, { identity })).data,
    checkStatus: async (roomId, requestId) => (await api.get(`/rooms/${roomId}/lobby/status/${requestId}`)).data,
    listPending: async (roomId) => (await api.get(`/rooms/${roomId}/lobby/pending`)).data,
    approve: async (roomId, requestId) => (await api.patch(`/rooms/${roomId}/lobby/approve/${requestId}`, { status: 'approved' })).data,
    deny: async (roomId, requestId) => (await api.patch(`/rooms/${roomId}/lobby/approve/${requestId}`, { status: 'denied' })).data,
};

// ─── PARTICIPANTS ───────────────────────────────────────────
export const participantService = {
    list: async (roomId) => (await api.get(`/rooms/${roomId}/participants`)).data,
    mute: async (roomId, participantId) =>
        (await api.post(`/rooms/${roomId}/participants/${participantId}/mute`)).data,
    unmute: async (roomId, participantId) =>
        (await api.post(`/rooms/${roomId}/participants/${participantId}/unmute`)).data,
    remove: async (roomId, participantId) => { await api.delete(`/rooms/${roomId}/participants/${participantId}`); },
    promote: async (roomId, participantId, newRole) =>
        (await api.patch(`/rooms/${roomId}/participants/${participantId}/promote`, null, { params: { new_role: newRole } })).data,
};

// ─── TRANSCRIPTS ────────────────────────────────────────────
export const transcriptService = {
    list: async (roomId, limit = 100, sessionId = null) => {
        const params = new URLSearchParams({ limit });
        if (sessionId) params.append('session_id', sessionId);
        return (await api.get(`/rooms/${roomId}/transcripts?${params.toString()}`)).data;
    },
    listSessions: async (roomId) => (await api.get(`/rooms/${roomId}/sessions`)).data,
    getAudio: async (roomId, transcriptId) => {
        const res = await api.get(`/rooms/${roomId}/transcripts/${transcriptId}/audio`, { responseType: 'blob' });
        return res.data;
    },
    delete: async (roomId, transcriptId) => {
        await api.delete(`/rooms/${roomId}/transcripts/${transcriptId}`);
    },
    exportCsv: async (roomId) => {
        const res = await api.get(`/rooms/${roomId}/export/csv`, { responseType: 'blob' });
        return res.data;
    },
    exportJson: async (roomId) => {
        const res = await api.get(`/rooms/${roomId}/export/json`, { responseType: 'blob' });
        return res.data;
    },
};

// ─── API TOKENS ─────────────────────────────────────────────
export const apiTokenService = {
    list: async () => (await api.get('/api-tokens/')).data,
    create: async (name, scopes = ['room:read', 'room:write']) =>
        (await api.post('/api-tokens/', { name, scopes })).data,
    revoke: async (tokenId) => { await api.delete(`/api-tokens/${tokenId}`); },
};

// ─── ADMIN ──────────────────────────────────────────────────
export const adminService = {
    // Users
    listUsers: async () => (await api.get('/admin/users')).data,
    createUser: async (data) => (await api.post('/admin/users', data)).data,
    suspendUser: async (userId) => (await api.post(`/admin/users/${userId}/suspend`)).data,
    deleteUser: async (userId) => { await api.delete(`/admin/users/${userId}`); },
    resetUserPassword: async (userId, newPassword) =>
        (await api.post(`/admin/users/${userId}/reset-password`, { new_password: newPassword })).data,
    assignUserOrg: async (userId, orgId) =>
        (await api.post(`/admin/users/${userId}/assign-org`, { org_id: orgId })).data,

    // Organizations
    listOrganizations: async () => (await api.get('/admin/organizations')).data,
    // User Admin
    listUsers: async () => { try { return (await api.get('/admin/users')).data; } catch { return []; } },
    suspendUser: async (userId) => (await api.post(`/admin/users/${userId}/suspend`)).data,
    deleteUser: async (userId) => { await api.delete(`/admin/users/${userId}`); },

    createOrganization: async (data) => (await api.post('/admin/organizations', data)).data,
    updateOrgSubscription: async (orgId, planId) =>
        (await api.patch(`/admin/organizations/${orgId}/subscription`, { plan_id: planId })).data,
    disableOrganization: async (orgId) => (await api.post(`/admin/organizations/${orgId}/disable`)).data,
    deleteOrganization: async (orgId) => { await api.delete(`/admin/organizations/${orgId}`); },
    overrideQuota: async (orgId, data) => (await api.post(`/admin/organizations/${orgId}/override-quota`, data)).data,

    // Subscriptions / Billing Admin
    suspendSubscription: async (subId) => (await api.post(`/admin/subscriptions/${subId}/suspend`)).data,
    listSubscriptions: async () => { try { return (await api.get('/admin/subscriptions')).data; } catch { return []; } },
    listFailedPayments: async () => { try { return (await api.get('/admin/billing/failed-payments')).data; } catch { return []; } },
    processRefund: async (invoiceId) => (await api.post(`/admin/billing/refund/${invoiceId}`)).data,
    getRevenue: async () => { try { return (await api.get('/admin/billing/revenue')).data; } catch { return null; } },

    // Workers
    listWorkers: async () => { try { return (await api.get('/admin/workers')).data; } catch { return []; } },
    startWorker: async (workerId) => (await api.post(`/admin/workers/${workerId}/start`)).data,
    stopWorker: async (workerId) => (await api.post(`/admin/workers/${workerId}/stop`)).data,
    restartWorker: async (workerId) => (await api.post(`/admin/workers/${workerId}/restart`)).data,
    assignWorker: async (workerId, roomId) =>
        (await api.post(`/admin/workers/${workerId}/assign`, { room_id: roomId })).data,

    // System
    getSystemHealth: async () => { try { return (await api.get('/admin/system/health')).data; } catch { return null; } },
    getSystemLogs: async (params) => { try { return (await api.get('/admin/system/logs', { params })).data; } catch { return []; } },
    getSystemConfig: async () => { try { return (await api.get('/admin/system/config')).data; } catch { return null; } },
    updateSystemConfig: async (configs) => (await api.patch('/admin/system/config', { configs })).data,

    // Feature Flags
    listFeatureFlags: async () => { try { return (await api.get('/admin/feature-flags')).data; } catch { return []; } },
    toggleFeatureFlag: async (flagKey, enabled) =>
        (await api.patch(`/admin/feature-flags/${flagKey}`, { enabled })).data,

    // Invoices Admin
    listAllInvoices: async (limit = 100) => { try { return (await api.get('/admin/billing/invoices', { params: { limit } })).data; } catch { return []; } },
    syncInvoicesFromPayPal: async () => (await api.post('/admin/billing/sync-invoices')).data,

    // Plans CRUD
    listPlans: async () => { try { return (await api.get('/admin/plans')).data; } catch { return []; } },
    createPlan: async (data) => (await api.post('/admin/plans', data)).data,
    updatePlan: async (planId, data) => (await api.patch(`/admin/plans/${planId}`, data)).data,
    deletePlan: async (planId) => { await api.delete(`/admin/plans/${planId}`); },
    seedOrgPlans: async () => { try { return (await api.post('/admin/plans/seed-org-plans')).data; } catch { return null; } },

    // Subscriptions
    listSubscriptions: async () => { try { return (await api.get('/admin/subscriptions')).data; } catch { return []; } },
    cancelSubscription: async (subId) => (await api.patch(`/admin/subscriptions/${subId}/cancel`)).data,

    // Discount Codes
    listDiscountCodes: async () => {
        try {
            return (await api.get('/admin/discount-codes')).data;
        } catch (err) {
            console.error('Failed to load discount codes:', err.response?.status, err.message);
            return null;
        }
    },
    createDiscountCode: async (data) => (await api.post('/admin/discount-codes', data)).data,
    deleteDiscountCode: async (codeId) => { await api.delete(`/admin/discount-codes/${codeId}`); },

    // Management — Enterprise & Commission
    listEnterpriseInquiries: async () => { try { return (await api.get('/admin/enterprise-inquiries')).data; } catch { return []; } },
    createEnterprisePlan: async (data) => (await api.post('/admin/enterprise-plans', data)).data,
    getCommissionOverview: async () => { try { return (await api.get('/admin/management/commissions')).data; } catch { return null; } },
};

// ─── ORG ROLES ──────────────────────────────────────────────
export const orgRolesService = {
    list: async (org_id) => { try { return (await api.get(`/organizations/${org_id}/roles`)).data; } catch { return []; } }
};

// ─── ANALYTICS ──────────────────────────────────────────────
export const analyticsService = {
    getStats: async (orgId) => (await api.get(`/organizations/${orgId}/analytics`)).data,
};

// ─── AUDIT LOGS ───────────────────────────────────────────
export const auditLogService = {
    list: async (orgId, params = {}) => (await api.get(`/audit-logs/${orgId}`, { params })).data,
};

export default api;
