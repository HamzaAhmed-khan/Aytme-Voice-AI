import { useState, useEffect } from 'react';
import {
    LayoutDashboard, Users, CreditCard, LogOut, Globe2, Shield,
    Settings, ScrollText, Video, Menu, X, ChevronRight, User as UserIcon
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function Layout({ children, onLogout, userRole, userEmail }) {
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/rooms', label: 'Rooms', icon: Video },
        { to: '/transcripts', label: 'Transcripts', icon: ScrollText },
        { to: '/organizations', label: 'Organization', icon: Users },
        { to: '/billing', label: 'Billing', icon: CreditCard },
        { to: '/settings', label: 'Settings', icon: Settings },
    ];

    const adminAllowlist = (import.meta.env.VITE_ADMIN_EMAILS || 'admin@aytme.io')
        .split(',')
        .map(v => v.trim().toLowerCase())
        .filter(Boolean);
    const normalizedRole = userRole?.toLowerCase().trim();
    const isAllowlistedAdmin = normalizedRole === 'admin' && adminAllowlist.includes(String(userEmail || '').toLowerCase());
    if (isAllowlistedAdmin) {
        navItems.push({ to: '/admin', label: 'System', icon: Shield });
    }

    const SidebarContent = () => {
        let usage = { quota_percent: 0 };
        let subscription = { minutes_total: 60 };
        try {
            usage = JSON.parse(localStorage.getItem('usage_cache') || '{}');
            subscription = JSON.parse(localStorage.getItem('subscription_cache') || '{}');
        } catch (e) {
            console.error("Failed to parse usage/subscription cache", e);
        }
        const quotaPct = usage.quota_percent || 0;
        
        // Friendly status for beginners
        const getStatusLabel = (pct) => {
            if (pct < 50) return { text: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-400' };
            if (pct < 85) return { text: 'Good', color: 'text-sky-400', bg: 'bg-sky-400' };
            return { text: 'Running Low', color: 'text-rose-400', bg: 'bg-rose-400' };
        };
        const status = getStatusLabel(quotaPct);


        return (
        <div className="flex flex-col h-full bg-slate-950/40 backdrop-blur-md border-r border-white/5 smooth-render">
            {/* Logo */}
            <div className="p-8 flex justify-center border-b border-white/5 relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full -ml-16 -mt-16 pointer-events-none" />
                <motion.div
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 border border-white/10"
                >
                    <Globe2 className="text-white" size={32} />
                </motion.div>
                
                {/* Collapse Toggle Desktop */}
                <button 
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all active:scale-90"
                >
                    <ChevronRight size={14} className={`text-slate-500 transition-transform duration-300 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-6 space-y-1.5 mt-2 overflow-y-auto scrollbar-none relative z-10 custom-scrollbar">
                {navItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.to);
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileOpen(false)}
                            className={`
                                group w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-200 font-bold text-[13px] border
                                ${isActive
                                    ? 'bg-white/10 text-white border-white/10 shadow-lg shadow-black/20'
                                    : 'text-slate-500 hover:bg-white/5 hover:text-slate-200 border-transparent'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon
                                    className={`transition-all duration-200 ${isActive ? 'text-indigo-400 scale-110' : 'text-slate-500 group-hover:text-slate-300'}`}
                                    size={18}
                                />
                                {!sidebarCollapsed && <span className={`${isActive ? 'opacity-100' : 'opacity-80 group-hover:opacity-100 uppercase tracking-widest'}`}>{item.label}</span>}
                            </div>
                            {isActive && !sidebarCollapsed && (
                                <motion.div layoutId="activeDot" className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                            )}
                        </NavLink>
                    );
                })}

                {/* Sidebar Usage Summary - REDESIGNED */}
                {!sidebarCollapsed && (
                    <div className="mt-8 px-1">
                        <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-colors" />
                           
                           <div className="flex justify-between items-start mb-4">
                               <div>
                                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Usage</p>
                                   <p className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${status.bg}/10 ${status.color} border border-current/20 inline-block`}>
                                       {status.text}
                                   </p>
                               </div>
                               <p className="text-lg font-black text-white">{quotaPct}%</p>
                           </div>

                           <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-[1.5px] border border-white/5 mb-3">
                               <motion.div 
                                   initial={{ width: 0 }}
                                   animate={{ width: `${quotaPct}%` }}
                                   className={`h-full rounded-full transition-colors duration-500 ${quotaPct > 85 ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'bg-gradient-to-r from-indigo-500 to-blue-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]'}`}
                               />
                           </div>

                           <div className="flex flex-col gap-1">
                               <div className="flex justify-between text-[10px] font-bold">
                                   <span className="text-slate-400">Minutes Used</span>
                                   <span className="text-white">{usage.minutes_used || 0}</span>
                               </div>
                               <div className="flex justify-between text-[10px] font-bold">
                                   <span className="text-slate-500">Plan Total</span>
                                   <span className="text-slate-400">{subscription.minutes_total || 60}</span>
                               </div>
                           </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* Profile & Signout */}
            <div className="p-6 border-t border-white/5 bg-slate-950/40 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-3 px-2 mb-6">
                    <div className="w-10 h-10 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                        <UserIcon size={18} className="text-slate-500" />
                    </div>
                    {!sidebarCollapsed && (
                        <div className="min-w-0">
                            <p className="text-[11px] font-black text-slate-200 truncate lowercase tracking-tight">{userEmail || 'user@aytme.io'}</p>
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-400/80">{userRole || 'User'}</p>
                        </div>
                    )}
                </div>
                <button
                    onClick={onLogout}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-slate-500 hover:text-white hover:bg-rose-500 hover:shadow-lg hover:shadow-rose-500/20 border border-transparent hover:border-rose-400/30 rounded-2xl transition-all duration-300 font-black uppercase tracking-widest text-[10px] ${sidebarCollapsed ? 'justify-center' : ''}`}
                >
                    <LogOut size={18} />
                    {!sidebarCollapsed && <span>Sign Out</span>}
                </button>
            </div>
        </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#020617] text-white flex overflow-hidden relative selection:bg-indigo-500/30">
            {/* Ambient Backgrounds */}
            <div className="absolute top-[-10%] left-[-5%] w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-[-5%] right-[-5%] w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[7000ms]" />

            {/* Desktop Sidebar */}
            <motion.aside 
                animate={{ width: sidebarCollapsed ? 96 : 288 }}
                className="hidden lg:flex bg-slate-950/20 backdrop-blur-xl border-r border-white/5 flex-col z-20 shrink-0 overflow-hidden"
            >
                <SidebarContent />
            </motion.aside>

            {/* Mobile Header Bar */}
            <div className={`lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 transition-all duration-300 ${scrolled ? 'bg-slate-950/90 backdrop-blur-2xl border-b border-white/10' : 'bg-transparent border-b border-transparent'}`}>
                <div className="flex items-center gap-3">
                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20"
                    >
                        <Globe2 size={16} className="text-white" />
                    </motion.div>
                </div>
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all active:scale-95 shadow-inner"
                >
                    <Menu size={20} className="text-slate-300" />
                </button>
            </div>

            {/* Mobile Sidebar Drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-md lg:hidden"
                            onClick={() => setMobileOpen(false)}
                        />
                        <motion.aside
                            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 left-0 bottom-0 z-[70] w-[280px] bg-slate-950/95 backdrop-blur-3xl border-r border-white/5 lg:hidden shadow-2xl flex flex-col"
                        >
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="absolute top-6 right-6 p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all z-[80] active:scale-90 shadow-xl"
                            >
                                <X size={20} className="text-slate-400" />
                            </button>
                            <div className="flex-1 overflow-hidden">
                                <SidebarContent />
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative z-10 lg:pt-0 pt-[72px] scroll-smooth bg-[#020617]">
                <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-12 min-h-full flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="flex-1"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                    
                    {/* Footer / Copyright */}
                    <footer className="mt-auto pt-10 pb-6 text-center lg:text-left border-t border-white/5">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                © 2026 MESHED INC. ALL RIGHTS RESERVED.
                            </p>
                            <div className="flex items-center gap-6">
                                <a href="#" className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors">Privacy</a>
                                <a href="#" className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors">Terms</a>
                                <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-md">
                                    <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Node Healthy</span>
                                </div>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>
        </div>
    );
}
