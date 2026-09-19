import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { ErrorBoundary } from './components/ErrorBoundary';

// Public pages
import Login from './pages/public/Login';
import Signup from './pages/public/Signup';
import Dashboard from './pages/user/Dashboard';
import Conference from './pages/user/Conference';
import Transcripts from './pages/user/Transcripts';
import Rooms from './pages/user/Rooms';
import NewRoomPage from './pages/user/NewRoomPage';
import TalkTogetherPage from './pages/user/TalkTogetherPage';
import Organizations from './pages/organization/Organizations';
import Billing from './pages/user/Billing';
import Settings from './pages/user/Settings';
import Layout from './layouts/Layout';
import JoinRoom from './pages/public/JoinRoom';
import ForgotPassword from './pages/public/ForgotPassword';
import ResetPassword from './pages/public/ResetPassword';
import LandingPage from './pages/public/LandingPage';
import VerifyEmail from './pages/public/VerifyEmail';

// V2 Components
import './v2.css';
import SessionManager from './v2/SessionManager';
import Stage from './v2/Stage';
import Listener from './v2/Listener';
import BillingV2 from './v2/Billing';
import ReceiptsV2 from './v2/Receipts';
import HistoryV2 from './v2/History';
import CommunityPlanV2 from './v2/CommunityPlan';
import LoginV2 from './v2/Login';
import SignupV2 from './v2/Signup';
import V2RoomRouter from './v2/V2RoomRouter';
import V2Layout from './v2/V2Layout';
import OrganizationsV2 from './v2/Organizations';
import AccountV2 from './v2/Account';
import AdminV2 from './v2/Admin';
import LandingPageV2 from './v2/LandingPageV2';
import FunctionsV2 from './v2/Functions';
import RoomsV2 from './v2/Rooms';
import DashboardHome from './v2/DashboardHome';
import ModeConversation from './v2/ModeConversation';
import ModeGroup from './v2/ModeGroup';
import ModeBroadcast from './v2/ModeBroadcast';
import TranscriptsView from './v2/TranscriptsView';
import JoinInvite from './v2/JoinInvite';

const resolveReturnTo = (rawReturnTo, fallback) => {
    if (!rawReturnTo || typeof rawReturnTo !== 'string') return fallback;
    if (!rawReturnTo.startsWith('/') || rawReturnTo.startsWith('//')) return fallback;
    return rawReturnTo;
};
// ─── Auth wrappers (need router context, so must be inside BrowserRouter) ────
function LoginWrapper({ handleAuthCleanup }) {
    const navigate = useNavigate();
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);

    if (isLoading) return null;
    if (isAuthenticated) return <Navigate to="/upgrade/dashboard" />;

    return (
        <Login
            onLogin={() => {
                handleAuthCleanup();
                navigate('/upgrade/dashboard');
            }}
            onNavigateSignup={() => navigate('/upgrade/signup')}
        />
    );
}

function V2LoginWrapper({ handleAuthCleanup }) {
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);
    const returnTo = resolveReturnTo(new URLSearchParams(location.search).get('returnTo'), '/dashboard');

    if (isLoading) return null;
    if (isAuthenticated) return <Navigate to={returnTo} />;

    return (
        <LoginV2 
            onLogin={async (requestedReturnTo) => {
                await handleAuthCleanup();
                navigate(resolveReturnTo(requestedReturnTo || returnTo, '/dashboard'));
            }} 
            onNavigateSignup={(requestedReturnTo) => {
                const target = resolveReturnTo(requestedReturnTo || returnTo, '/dashboard');
                navigate(`/signup?returnTo=${encodeURIComponent(target)}`);
            }}
        />
    );
}

function SignupWrapper({ handleAuthCleanup }) {
    const navigate = useNavigate();
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);

    if (isLoading) return null;
    if (isAuthenticated) return <Navigate to="/upgrade/dashboard" />;

    return (
        <Signup
            onSignup={() => {
                handleAuthCleanup();
                navigate('/upgrade/dashboard');
            }}
            onNavigateLogin={() => navigate('/upgrade/login')}
        />
    );
}

function V2SignupWrapper({ handleAuthCleanup }) {
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);
    const returnTo = resolveReturnTo(new URLSearchParams(location.search).get('returnTo'), '/dashboard');

    if (isLoading) return null;
    if (isAuthenticated) return <Navigate to={returnTo} />;

    return (
        <SignupV2 
            onSignup={async (requestedReturnTo) => {
                await handleAuthCleanup();
                navigate(resolveReturnTo(requestedReturnTo || returnTo, '/dashboard'));
            }} 
            onNavigateLogin={(requestedReturnTo) => {
                const target = resolveReturnTo(requestedReturnTo || returnTo, '/dashboard');
                navigate(`/login?returnTo=${encodeURIComponent(target)}`);
            }}
        />
    );
}

function ConferenceRoute() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);
    const location = useLocation();

    const params = new URLSearchParams(location.search);
    const hasInviteToken = params.has('token') || (!isAuthenticated && localStorage.getItem('token'));

    if (isLoading) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 items-center justify-center text-slate-900 gap-4">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest animate-pulse">
                    Verifying Session...
                </p>
            </div>
        );
    }

    if (isAuthenticated || hasInviteToken) return <Conference />;
    return <Navigate to="/upgrade/login" />;
}

// ─── Protected route helper ──────────────────────────────────────────────────
const ADMIN_EMAILS = ['aytme.admin@gmail.com', 'moesheacorp@gmail.com'];

function ProtectedRoute({ children, adminOnly, userRole, userEmail, isAuthenticated, isLoading, loginPath = "/login" }) {
    if (isLoading) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 items-center justify-center text-slate-900 gap-4">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest animate-pulse">
                    Securing Session...
                </p>
            </div>
        );
    }
    if (!isAuthenticated) return <Navigate to={loginPath} />;
    const isAdmin = userRole?.toLowerCase().trim() === 'admin' || ADMIN_EMAILS.includes(userEmail?.toLowerCase().trim());
    if (adminOnly && !isAdmin) {
        console.warn('[RBAC] Access Denied. Required: admin, Got:', userRole, userEmail);
        return <Navigate to="/dashboard" replace />;
    }
    return children;
}

export default function App() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const isLoading = useAuthStore(state => state.isLoading);
    const user = useAuthStore(state => state.user);
    const userRole = isLoading ? null : user?.role;
    const userEmail = user?.email;
    const isAdminUser = userRole?.toLowerCase().trim() === 'admin' || ADMIN_EMAILS.includes(userEmail?.toLowerCase().trim());
    const validateSession = useAuthStore(state => state.validateSession);
    const logout = useAuthStore(state => state.logout);

    useEffect(() => {
        validateSession();
    }, [validateSession]);

    const handleAuthCleanup = async () => {
        try {
            await validateSession();
        } catch {
            // Don't logout immediately — the token from OTP is valid,
            // the validation might fail transiently (e.g. network, 500 on subscription)
            // Retry once after a brief delay
            try {
                await new Promise(r => setTimeout(r, 500));
                await validateSession();
            } catch {
                // Only logout if we truly have no token
                if (!localStorage.getItem('token')) {
                    logout();
                } else {
                    console.warn('[Auth] Session validation failed but token exists — proceeding');
                }
            }
        }
    };

    const layoutWrap = (Component) => (
        <Layout userRole={userRole} userEmail={user?.email} onLogout={logout}>
            <Component />
        </Layout>
    );

    const v2LayoutWrap = (Component) => (
        <V2Layout>
            <Component />
        </V2Layout>
    );

    const protectedLayout = (Component, adminOnly = false) => (
        <ProtectedRoute isAuthenticated={isAuthenticated} isLoading={isLoading} userRole={userRole} userEmail={userEmail} adminOnly={adminOnly} loginPath="/upgrade/login">
            {layoutWrap(Component)}
        </ProtectedRoute>
    );

    const v2ProtectedRoute = (Component, adminOnly = false) => (
        <ProtectedRoute 
            isAuthenticated={isAuthenticated} 
            isLoading={isLoading} 
            userRole={userRole} 
            userEmail={userEmail} 
            adminOnly={adminOnly} 
            loginPath="/login"
        >
            {v2LayoutWrap(Component)}
        </ProtectedRoute>
    );

    return (
        <ErrorBoundary>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        className: 'bg-white border border-slate-200 text-slate-800 rounded-2xl font-bold p-4 shadow-lg',
                        duration: 4000
                    }}
                />
                <Routes>
                    {/* V2 UI (Default) */}
                    <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <LandingPageV2 />} />
                    <Route path="/dashboard" element={
                        isAuthenticated ? (
                            isAdminUser 
                                ? <Navigate to="/v2/admin?tab=metrics" replace /> 
                                : v2LayoutWrap(DashboardHome)
                        ) : <Navigate to="/login" />
                    } />
                    <Route path="/mode/conversation" element={isAuthenticated ? v2LayoutWrap(ModeConversation) : <Navigate to="/login" />} />
                    <Route path="/mode/group" element={isAuthenticated ? v2LayoutWrap(ModeGroup) : <Navigate to="/login" />} />
                    <Route path="/mode/broadcast" element={isAuthenticated ? v2LayoutWrap(ModeBroadcast) : <Navigate to="/login" />} />
                    <Route path="/transcripts" element={isAuthenticated ? v2LayoutWrap(TranscriptsView) : <Navigate to="/login" />} />
                    <Route path="/settings" element={
                        isAuthenticated ? (
                            isAdminUser 
                                ? v2LayoutWrap(AccountV2) 
                                : v2LayoutWrap(AccountV2)
                        ) : <Navigate to="/login" />
                    } />
                    <Route path="/billing" element={
                        isAuthenticated && isAdminUser 
                            ? <Navigate to="/v2/admin?tab=metrics" replace /> 
                            : v2LayoutWrap(BillingV2)
                    } />
                    
                    <Route path="/functions" element={isAuthenticated ? v2LayoutWrap(FunctionsV2) : <Navigate to="/login" />} />
                    <Route path="/pricing" element={<LandingPageV2 />} />
                    <Route path="/v2/rooms" element={v2LayoutWrap(RoomsV2)} />
                    <Route path="/v2/stage" element={isAuthenticated ? <Stage /> : <Navigate to="/login" />} />
                    <Route path="/v2/listen" element={isAuthenticated ? <Listener /> : <Navigate to="/login" />} />
                    
                    {/* Legacy V2 Routes waiting for deprecation or admin usage */}
                    <Route path="/v2/receipts" element={
                        isAuthenticated && isAdminUser 
                            ? <Navigate to="/v2/admin?tab=invoices" replace /> 
                            : v2LayoutWrap(ReceiptsV2)
                    } />
                    <Route path="/v2/community" element={v2LayoutWrap(CommunityPlanV2)} />
                    <Route path="/v2/room/:roomId" element={<V2RoomRouter />} />
                    <Route path="/v2/organizations" element={
                        isAuthenticated ? (
                            isAdminUser 
                                ? <Navigate to="/v2/admin?tab=organizations" replace /> 
                                : v2LayoutWrap(OrganizationsV2)
                        ) : <Navigate to="/login" />
                    } />
                    <Route path="/v2/admin" element={v2ProtectedRoute(AdminV2, true)} />

                    {/* V2 Auth Routes */}
                    <Route path="/login" element={<V2LoginWrapper handleAuthCleanup={handleAuthCleanup} />} />
                    <Route path="/signup" element={<V2SignupWrapper handleAuthCleanup={handleAuthCleanup} />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/invite/:token" element={<JoinInvite />} />

                    {/* Legacy UI (v1) - Moved to /upgrade */}
                    <Route path="/upgrade" element={!isAuthenticated ? <LandingPage /> : <Navigate to="/upgrade/dashboard" />} />
                    <Route path="/upgrade/login" element={<LoginWrapper handleAuthCleanup={handleAuthCleanup} />} />
                    <Route path="/upgrade/signup" element={<SignupWrapper handleAuthCleanup={handleAuthCleanup} />} />
                    <Route path="/upgrade/dashboard" element={protectedLayout(Dashboard)} />
                    <Route path="/upgrade/rooms" element={protectedLayout(Rooms)} />
                    <Route path="/upgrade/transcripts" element={protectedLayout(Transcripts)} />
                    <Route path="/upgrade/organizations" element={protectedLayout(Organizations)} />
                    <Route path="/upgrade/billing" element={protectedLayout(Billing)} />
                    <Route path="/upgrade/settings" element={protectedLayout(Settings)} />
                    <Route path="/upgrade/room/:roomId" element={<ConferenceRoute />} />
                    <Route path="/upgrade/billing" element={protectedLayout(Billing)} />
                    <Route path="/upgrade/settings" element={protectedLayout(Settings)} />
                    <Route path="/upgrade/room/:roomId" element={<ConferenceRoute />} />

                    {/* Shared */}
                    <Route path="/join/:slug" element={<JoinRoom />} />
                    
                    {/* New Platform Modes */}
                    <Route path="/user/new-room" element={protectedLayout(NewRoomPage)} />
                    <Route path="/user/conference/:roomId" element={protectedLayout(Conference)} />
                    <Route path="/user/talk-together/:slug" element={protectedLayout(TalkTogetherPage)} />
                    <Route path="/public/conference/:roomId" element={<Conference />} />
                    <Route path="/public/broadcast/:roomId" element={<Conference />} />

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
}
