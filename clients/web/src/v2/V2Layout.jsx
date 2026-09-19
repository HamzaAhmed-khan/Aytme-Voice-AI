import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Shield, 
  Activity, 
  History, 
  UserCircle, 
  LogOut, 
  Menu, 
  X, 
  ChevronRight,
  Cpu,
  Flag,
  DollarSign,
  Settings,
  ShieldCheck,
  MessageSquare,
  Radio,
  CreditCard,
  ChevronDown,
  Video,
  PowerOff
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOrganizationStore } from '../store/organizationStore';
import SubscriptionBanner from '../components/SubscriptionBanner';
import QuotaLimitModal from '../components/QuotaLimitModal';

export default function V2Layout({ children }) {
  const { user, logout } = useAuthStore();
  const { organizations, currentOrg, setCurrentOrg, fetchOrganizations, fetchSubscription } = useOrganizationStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [quotaModal, setQuotaModal] = useState({ open: false, info: null });

  useEffect(() => {
    const handleQuota = (e) => setQuotaModal({ open: true, info: e.detail });
    window.addEventListener('show-quota-limit', handleQuota);
    return () => {
      window.removeEventListener('show-quota-limit', handleQuota);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (organizations.length === 0) {
        const orgs = await fetchOrganizations();
        if (orgs?.length > 0) {
          fetchSubscription(orgs[0].id);
        }
      } else if (currentOrg) {
        fetchSubscription(currentOrg.id);
      }
    };
    init();
  }, [fetchOrganizations, organizations.length, currentOrg?.id]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const mainItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Rooms', path: '/v2/rooms', icon: Video },
    { name: 'Functions', path: '/functions', icon: Cpu },
    { name: 'Organizations', path: '/v2/organizations', icon: Building2 },
    { name: 'Invoices', path: '/v2/receipts', icon: DollarSign },
    { name: 'Transcripts', path: '/transcripts', icon: History },
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Billing', path: '/billing', icon: CreditCard },
  ];

  const adminItems = [
    { name: 'Overview', path: '/v2/admin?tab=metrics', icon: Shield },
    { name: 'People', path: '/v2/admin?tab=users', icon: Users },
    { name: 'Organizations', path: '/v2/admin?tab=organizations', icon: Building2 },
    { name: 'Payments', path: '/v2/admin?tab=invoices', icon: DollarSign },
    { name: 'Subscriptions', path: '/v2/admin?tab=subscriptions', icon: CreditCard },
    { name: 'Servers', path: '/v2/admin?tab=workers', icon: Cpu },
    { name: 'Activity', path: '/v2/admin?tab=system', icon: Activity },
    { name: 'Features', path: '/v2/admin?tab=flags', icon: Flag },
    { name: 'Discount Codes', path: '/v2/admin?tab=discounts', icon: DollarSign },
    { name: 'Management', path: '/v2/admin?tab=management', icon: ShieldCheck },
    { name: 'System Config', path: '/v2/admin?tab=config', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const NavItem = ({ item, mobile = false }) => (
    <NavLink
      to={item.path}
      className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-500 group relative overflow-hidden
        ${isActive 
          ? 'bg-v2-accent text-white shadow-[0_0_20px_rgba(var(--v2-accent-rgb),0.3)] translate-x-1 font-bold' 
          : 'text-v2-muted hover:bg-v2-header hover:text-v2-text'}
        ${mobile ? 'text-lg' : 'text-sm'}
      `}
      onClick={() => mobile && setIsMobileMenuOpen(false)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent animate-pulse" />
          )}
          <item.icon size={mobile ? 20 : 18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'group-hover:scale-110 transition-transform'} />
          <span className="tracking-tight relative z-10">{item.name}</span>
          <ChevronRight size={14} className={`ml-auto transition-all duration-500 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`} />
        </>
      )}
    </NavLink>
  );

  const ADMIN_EMAILS = ['aytme.admin@gmail.com', 'moesheacorp@gmail.com'];
  const isUserAdmin = user?.role?.toLowerCase().trim() === 'admin' || ADMIN_EMAILS.includes(user?.email?.toLowerCase().trim());

  return (
    <div className="min-h-screen bg-v2-background text-v2-text font-inter selection:bg-v2-accent selection:text-white">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-72 bg-v2-header/40 border-r border-v2-border/30 backdrop-blur-3xl z-40 hidden lg:flex flex-col p-6 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-v2-accent to-v2-accent-light opacity-50" />
        
        {/* Logo Area */}
        <div className="mb-12 flex justify-center px-4">
          <div className="max-w-[180px] max-h-[48px] flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="AYTME" className="w-full h-full object-contain" />
          </div>
        </div>

        <nav className="flex-1 space-y-10 overflow-y-auto pr-2 custom-scrollbar">
          {/* Organization Selector */}
          <div className="px-2 mb-6">
            <div className="relative">
              <button 
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-v2-header/60 border border-v2-border/30 hover:border-v2-accent/50 transition-all text-left"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded bg-v2-accent/10 flex items-center justify-center text-v2-accent flex-shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="truncate">
                    <p className="text-[10px] font-bold text-v2-muted uppercase tracking-widest leading-none mb-1">Organization</p>
                    <p className="text-sm font-bold text-v2-text truncate">{currentOrg?.name || 'Select Org...'}</p>
                  </div>
                </div>
                <ChevronDown size={14} className={`text-v2-muted transition-transform ${isOrgDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOrgDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-v2-header border border-v2-border/40 rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {organizations.map(org => (
                      <button
                        key={org.id}
                        onClick={() => {
                          setCurrentOrg(org);
                          setIsOrgDropdownOpen(false);
                        }}
                        className={`w-full text-left p-3 text-xs font-bold uppercase tracking-tight hover:bg-v2-accent/10 transition-colors ${currentOrg?.id === org.id ? 'text-v2-accent' : 'text-v2-muted'}`}
                      >
                        {org.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Section */}
          {!isUserAdmin && (
            <div className="space-y-4">
              <div className="px-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-v2-muted/60 flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-v2-muted/30" />
                Main Menu
              </div>
              <div className="space-y-1.5">
                {mainItems.map(item => <NavItem key={item.path} item={item} />)}
              </div>
            </div>
          )}

          {/* Admin Section */}
          {isUserAdmin && (
            <div className="space-y-4">
              <div className="px-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-v2-accent flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-v2-accent" />
                Administration
              </div>
              <div className="space-y-1.5">
                {adminItems.map(item => <NavItem key={item.path} item={item} />)}
              </div>
            </div>
          )}
        </nav>

        {/* User Info */}
        <div className="mt-auto pt-8 border-t border-v2-border/20">
          <div className="p-4 rounded-lg bg-v2-header/60 border border-v2-border/30 hover:border-v2-accent/30 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full shadow-md overflow-hidden bg-v2-accent/10 border border-v2-accent/20 flex items-center justify-center text-v2-accent group-hover:bg-v2-accent group-hover:text-white transition-all">
                <UserCircle size={22} />
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold tracking-tight truncate uppercase">{user?.full_name || 'User'}</p>
                <p className="text-[10px] text-v2-muted font-mono truncate">{user?.email}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-semibold uppercase tracking-[0.2em] hover:bg-rose-500 hover:text-white transition-all active:scale-95"
            >
              <LogOut size={14} />
              Logout Session
            </button>
            <button 
              onClick={() => {
                handleLogout();
                navigate('/');
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 rounded-md bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase tracking-[0.2em] hover:bg-slate-700 hover:text-white transition-all active:scale-95"
            >
              <PowerOff size={14} />
              Close Application
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-v2-header/80 backdrop-blur-xl border-b border-v2-border/30 z-50 flex items-center justify-between px-6">
        <div className="flex items-center">
          <div className="max-w-[130px] max-h-[36px] flex items-center justify-start overflow-hidden">
            <img src="/logo.png" alt="AYTME" className="w-full h-full object-contain object-left" />
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-v2-muted hover:text-v2-text"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />
          <aside className="absolute right-0 top-0 bottom-0 w-80 bg-v2-header shadow-2xl flex flex-col p-8 animate-in slide-in-from-right duration-500">
            <div className="relative flex justify-center items-center mb-10">
              <div className="max-w-[180px] max-h-[48px] flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="AYTME" className="w-full h-full object-contain" />
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="absolute right-0 p-2 hover:bg-v2-accent/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 space-y-8 overflow-y-auto">
              <div className="space-y-2">
                {mainItems.map(item => <NavItem key={item.path} item={item} mobile />)}
              </div>
              {isUserAdmin && (
                <div className="space-y-2 border-t border-v2-border/30 pt-6">
                  <p className="px-4 text-[10px] font-semibold uppercase tracking-widest text-v2-accent mb-4">Administration</p>
                  {adminItems.map(item => <NavItem key={item.path} item={item} mobile />)}
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className="mt-8 flex items-center justify-center gap-3 py-4 rounded-md bg-rose-500/10 text-rose-500 font-bold uppercase tracking-tighter text-sm"
            >
              <LogOut size={20} /> Logout
            </button>
            <button 
              onClick={() => {
                handleLogout();
                navigate('/');
              }}
              className="mt-3 flex items-center justify-center gap-3 py-4 rounded-md bg-slate-100 text-slate-500 font-bold uppercase tracking-tighter text-sm hover:bg-slate-700 hover:text-white transition-all"
            >
              <PowerOff size={20} /> Close Application
            </button>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="lg:ml-72 min-h-[100dvh]">
        <div className="max-w-[1600px] mx-auto p-2 md:p-8 lg:p-12 pt-20 lg:pt-12 overflow-x-hidden">
          <SubscriptionBanner />
          {children}
        </div>
      </main>

      <QuotaLimitModal
        isOpen={quotaModal.open}
        onClose={() => setQuotaModal({ open: false, info: null })}
        quotaInfo={quotaModal.info}
      />
    </div>
  );
}
