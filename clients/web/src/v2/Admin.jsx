import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Users,
    Building2,
    Shield,
    Activity,
    Cpu,
    Flag,
    Search,
    MoreVertical,
    CheckCircle2,
    AlertCircle,
    DollarSign,
    Terminal,
    Settings,
    ShieldAlert,
    CreditCard,
    HardDrive,
    RefreshCw,
    ToggleLeft,
    Briefcase,
    TrendingUp,
    Plus,
    Save,
    Building2 as Building2Icon,
    Trash2,
    X,
} from 'lucide-react';
import { adminService } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Admin() {
    const { user: currentUser } = useAuthStore();
    const [searchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'metrics';
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [logs, setLogs] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [flags, setFlags] = useState([]);
    const [plans, setPlans] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);
    const [showCreatePlan, setShowCreatePlan] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [planForm, setPlanForm] = useState({ 
        name: '', 
        description: '', 
        price_monthly: 0, 
        minutes_included: 1000, 
        overage_rate_per_min: 0.05, 
        max_rooms: 10, 
        max_participants: 50,
        paypal_plan_id: ''
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [discountCodes, setDiscountCodes] = useState([]);
    const [discountForm, setDiscountForm] = useState({ percent_off: 10, expires_in_days: '' });
    const [creatingCode, setCreatingCode] = useState(false);
    const [allInvoices, setAllInvoices] = useState([]);
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [createUserForm, setCreateUserForm] = useState({ email: '', full_name: '', password: '', role: 'member' });
    const [creatingUser, setCreatingUser] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { id, email, full_name, plan_name }
    const [deletingUser, setDeletingUser] = useState(false);
    const [syncingInvoices, setSyncingInvoices] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    // Management tab state
    const [mgmtPlans, setMgmtPlans] = useState([]);
    const [mgmtEditingPlan, setMgmtEditingPlan] = useState(null);
    const [mgmtSaving, setMgmtSaving] = useState(false);
    const [commissions, setCommissions] = useState(null);
    const [enterpriseForm, setEnterpriseForm] = useState({
        inquiry_email: '', company_name: '', price_monthly: 999,
        minutes_included: 50000, max_rooms: 100, max_participants: 500, org_id: ''
    });
    const [creatingEnterprise, setCreatingEnterprise] = useState(false);

    useEffect(() => {
        loadData();
        
        // Auto-refresh every 10 seconds for real-time feel
        const interval = setInterval(() => {
            loadData(true); // silent refresh
        }, 10000);
        
        return () => clearInterval(interval);
    }, [activeTab]);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            if (activeTab === 'metrics') {
                const [revenue, health] = await Promise.all([
                    adminService.getRevenue(),
                    adminService.getSystemHealth()
                ]);
                setStats({ revenue, health });
            } else if (activeTab === 'users') {
                const data = await adminService.listUsers();
                setUsers(data);
            } else if (activeTab === 'organizations') {
                const data = await adminService.listOrganizations();
                setOrgs(data);
            } else if (activeTab === 'system') {
                const data = await adminService.getSystemLogs({ limit: 50 });
                setLogs(data);
            } else if (activeTab === 'workers') {
                const data = await adminService.listWorkers();
                setWorkers(data);
            } else if (activeTab === 'flags') {
                const data = await adminService.listFeatureFlags();
                setFlags(data);
            } else if (activeTab === 'subscriptions') {
                const [plansData, subsData] = await Promise.all([
                    adminService.listPlans(),
                    adminService.listSubscriptions()
                ]);
                setPlans(plansData || []);
                setSubscriptions(subsData || []);
            } else if (activeTab === 'invoices') {
                const invoicesData = await adminService.listAllInvoices(50);
                setAllInvoices(invoicesData || []);
            } else if (activeTab === 'config') {
                const healthData = await adminService.getSystemHealth();
                setStats(prev => ({ ...prev, health: healthData }));
            } else if (activeTab === 'discounts') {
                const data = await adminService.listDiscountCodes();
                if (data) {
                    setDiscountCodes(data);
                }
            } else if (activeTab === 'management') {
                // Seed org plans first (idempotent — skips any that already exist)
                await adminService.seedOrgPlans();
                const [plansData, commissionsData, orgsData, subsData] = await Promise.all([
                    adminService.listPlans(),
                    adminService.getCommissionOverview(),
                    adminService.listOrganizations(),
                    adminService.listSubscriptions()
                ]);
                setMgmtPlans(plansData || []);
                setCommissions(commissionsData);
                setOrgs(orgsData || []);
                setSubscriptions(subsData || []);
            }
        } catch (err) {
            console.error(`Failed to load ${activeTab}:`, err);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleToggleFlag = async (key, current) => {
        try {
            await adminService.toggleFeatureFlag(key, !current);
            loadData(true);
        } catch (err) {
            alert('Failed to toggle flag');
        }
    };

    const handleSuspendUser = async (userId) => {
        if (!window.confirm('Are you sure you want to suspend this user?')) return;
        try {
            await adminService.suspendUser(userId);
            loadData(true);
        } catch (err) {
            alert('Failed to suspend user');
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        setDeletingUser(true);
        try {
            await adminService.deleteUser(deleteTarget.id);
            setDeleteTarget(null);
            loadData(true);
        } catch (err) {
            alert('Failed to delete user: ' + (err.response?.data?.detail || err.message));
        } finally {
            setDeletingUser(false);
        }
    };

    const handleSyncInvoices = async () => {
        setSyncingInvoices(true);
        setSyncResult(null);
        try {
            const result = await adminService.syncInvoicesFromPayPal();
            setSyncResult({ success: true, created: result.invoices_created, checked: result.subscriptions_checked });
            loadData(true);
        } catch (err) {
            setSyncResult({ success: false, error: err.response?.data?.detail || err.message });
        } finally {
            setSyncingInvoices(false);
        }
    };

    const handleWorkerAction = async (workerId, action) => {
        try {
            if (action === 'restart') await adminService.restartWorker(workerId);
            else if (action === 'stop') await adminService.stopWorker(workerId);
            else if (action === 'start') await adminService.startWorker(workerId);
            loadData(true);
        } catch (err) {
            console.error(`Failed to ${action} worker:`, err);
            alert(`Failed to ${action} worker`);
        }
    };


    const GlassCard = ({ title, value, icon: Icon, color = 'blue' }) => (
        <div className="v2-card group hover:scale-[1.02] transition-transform duration-300">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-500 group-hover:bg-${color}-500 group-hover:text-white transition-colors`}>
                    <Icon size={24} />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-v2-muted">Live Data</div>
            </div>
            <h3 className="text-v2-muted text-sm font-medium mb-1">{title}</h3>
            <div className="text-2xl font-black text-v2-text tracking-tight">{value}</div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4 border-b border-v2-border">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-v2-accent font-bold uppercase tracking-[0.2em] text-[10px]">
                        <Shield size={12} fill="currentColor" />
                        Admin Authority
                    </div>
                    <h1 className="text-4xl font-black text-v2-text tracking-tighter italic">PLATFORM CONTROL</h1>
                    <p className="text-v2-muted text-sm">Real-time governance and system monitoring for AYTME.</p>
                </div>
            </header>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="v2-loader" />
                </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                    {/* Metrics Dashboard */}
                    {activeTab === 'metrics' && stats && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <GlassCard 
                                    title="Total MRR" 
                                    value={`$${stats.revenue?.mrr?.toLocaleString() || '0'}`} 
                                    icon={DollarSign} 
                                    color="emerald" 
                                />
                                <GlassCard 
                                    title="Active Orgs" 
                                    value={stats.revenue?.active_subscriptions || '0'} 
                                    icon={Building2} 
                                    color="v2-accent" 
                                />
                                <GlassCard 
                                    title="Growth Rate" 
                                    value={`+${stats.revenue?.growth || '0'}%`} 
                                    icon={Activity} 
                                    color="orange" 
                                />
                                <GlassCard 
                                    title="System Health" 
                                    value={stats.health?.status?.toUpperCase() || 'OK'} 
                                    icon={ShieldAlert} 
                                    color={stats.health?.status === 'healthy' ? 'emerald' : 'rose'} 
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="v2-card">
                                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                        <Activity size={20} className="text-v2-accent" />
                                        Service Availability
                                    </h3>
                                    <div className="space-y-4">
                                        {Object.entries(stats.health?.services || {}).map(([name, status]) => (
                                            <div key={name} className="flex items-center justify-between p-4 rounded-xl bg-v2-background border border-v2-border">
                                                <span className="font-bold capitalize">{name}</span>
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                                    status === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                                }`}>
                                                    {status === 'up' ? 'Operational' : 'Critical'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="v2-card">
                                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                        <Activity size={20} className="text-v2-accent" />
                                        Platform Growth
                                    </h3>
                                    <div className="h-[200px] flex items-end gap-2 px-2">
                                        {[40, 60, 45, 80, 70, 95, 85].map((h, i) => (
                                            <div 
                                                key={i} 
                                                className="flex-1 bg-v2-accent/20 hover:bg-v2-accent rounded-t-lg transition-all duration-300 group relative"
                                                style={{ height: `${h}%` }}
                                            >
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-v2-header px-2 py-1 rounded border border-v2-border opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold">
                                                    {h}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between mt-4 text-[10px] font-bold text-v2-muted uppercase tracking-widest px-2">
                                        <span>Mon</span>
                                        <span>Tue</span>
                                        <span>Wed</span>
                                        <span>Thu</span>
                                        <span>Fri</span>
                                        <span>Sat</span>
                                        <span>Sun</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Users Management */}
                    {activeTab === 'users' && (
                        <div className="v2-card overflow-hidden p-0">
                            <div className="p-6 border-b border-v2-border flex items-center justify-between bg-v2-header/30">
                                <h3 className="font-bold">Registered Users ({users.length})</h3>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-v2-muted" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Search by email..."
                                            className="v2-input pl-10 h-10 w-64"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setShowCreateUser(true)}
                                        className="v2-btn px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                                    >
                                        <Plus size={14} /> Create User
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-v2-background/50 text-[10px] font-black uppercase tracking-widest text-v2-muted border-b border-v2-border">
                                            <th className="px-6 py-4">User</th>
                                            <th className="px-6 py-4">Role</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Created</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-v2-border">
                                        {users.filter(u => u.email.includes(searchQuery)).map(u => (
                                            <tr key={u.id} className="group hover:bg-v2-accent/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-v2-background border border-v2-border flex items-center justify-center font-bold text-xs">
                                                            {(u.full_name || u.email).slice(0, 1).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm">{u.full_name || 'Anonymous'}</div>
                                                            <div className="text-[10px] text-v2-muted font-mono">{u.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(() => {
                                                        const ADMIN_EMAILS = ['aytme.admin@gmail.com', 'moesheacorp@gmail.com'];
                                                        const effectiveRole = ADMIN_EMAILS.includes(u.email?.toLowerCase()) ? 'admin' : u.role;
                                                        return (
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                                effectiveRole === 'admin' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
                                                            }`}>
                                                                {effectiveRole}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {u.is_active ? (
                                                        <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-bold uppercase">
                                                            <CheckCircle2 size={12} /> Active
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-rose-500 text-[10px] font-bold uppercase">
                                                            <AlertCircle size={12} /> Suspended
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-v2-muted">
                                                    {new Date(u.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleSuspendUser(u.id)}
                                                            className="p-2 transition-colors duration-200"
                                                            title={u.is_active ? 'Suspend' : 'Activate'}
                                                        >
                                                            <ShieldAlert size={16} className={u.is_active ? 'text-v2-muted hover:text-rose-500' : 'text-emerald-500'} />
                                                        </button>
                                                        <button className="p-2 text-v2-muted hover:text-v2-text">
                                                            <Settings size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget({ id: u.id, email: u.email, full_name: u.full_name || 'Anonymous', plan_name: u.plan_name || 'Free Trial' })}
                                                            className="p-2 text-v2-muted hover:text-rose-500 transition-colors duration-200"
                                                            title="Delete user"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Delete User Confirmation Modal */}
                            {deleteTarget && (
                                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !deletingUser && setDeleteTarget(null)}>
                                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-base font-bold uppercase tracking-widest text-rose-600 flex items-center gap-2">
                                                <Trash2 size={16} /> Delete User
                                            </h3>
                                            {!deletingUser && (
                                                <button onClick={() => setDeleteTarget(null)} className="text-v2-muted hover:text-v2-text text-xl">×</button>
                                            )}
                                        </div>
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center font-bold text-rose-600 text-sm shrink-0">
                                                    {deleteTarget.full_name.slice(0, 1).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-slate-800">{deleteTarget.full_name}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{deleteTarget.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-rose-200">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current Plan</span>
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-v2-accent/10 text-v2-accent">{deleteTarget.plan_name}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 mb-6">
                                            This will <strong>permanently delete</strong> this account. All their data, rooms, and org memberships will be removed. This action cannot be undone.
                                        </p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setDeleteTarget(null)}
                                                disabled={deletingUser}
                                                className="flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-xl border border-v2-border text-v2-muted hover:text-v2-text transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleDeleteUser}
                                                disabled={deletingUser}
                                                className="flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Trash2 size={13} /> {deletingUser ? 'Deleting...' : 'Delete User'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Create User Modal */}
                            {showCreateUser && (
                                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateUser(false)}>
                                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-base font-bold uppercase tracking-widest text-v2-text">Create New User</h3>
                                            <button onClick={() => setShowCreateUser(false)} className="text-v2-muted hover:text-v2-text"><span className="text-xl">×</span></button>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Full Name</label>
                                                <input className="v2-input mt-1" placeholder="Jane Doe" value={createUserForm.full_name}
                                                    onChange={e => setCreateUserForm(f => ({ ...f, full_name: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Email</label>
                                                <input className="v2-input mt-1" type="email" placeholder="jane@example.com" value={createUserForm.email}
                                                    onChange={e => setCreateUserForm(f => ({ ...f, email: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Password</label>
                                                <input className="v2-input mt-1" type="password" placeholder="Temporary password" value={createUserForm.password}
                                                    onChange={e => setCreateUserForm(f => ({ ...f, password: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Role</label>
                                                <select className="v2-input mt-1" value={createUserForm.role}
                                                    onChange={e => setCreateUserForm(f => ({ ...f, role: e.target.value }))}>
                                                    <option value="member">Member</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="user">User</option>
                                                </select>
                                            </div>
                                            <button
                                                disabled={creatingUser}
                                                onClick={async () => {
                                                    if (!createUserForm.email || !createUserForm.password || !createUserForm.full_name) return;
                                                    setCreatingUser(true);
                                                    try {
                                                        await adminService.createUser(createUserForm);
                                                        setShowCreateUser(false);
                                                        setCreateUserForm({ email: '', full_name: '', password: '', role: 'member' });
                                                        const data = await adminService.listUsers();
                                                        setUsers(data);
                                                    } catch (err) {
                                                        console.error('Create user failed:', err);
                                                    } finally { setCreatingUser(false); }
                                                }}
                                                className="v2-btn w-full py-3 text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <Plus size={14} /> {creatingUser ? 'Creating...' : 'Create Account'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Organizations Management */}
                    {activeTab === 'organizations' && (
                        <div className="v2-card p-0 overflow-hidden">
                            <div className="p-6 border-b border-v2-border bg-v2-header/30">
                                <h3 className="font-bold">Platform Organizations ({orgs.length})</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-v2-background/50 text-[10px] font-black uppercase tracking-widest text-v2-muted border-b border-v2-border">
                                            <th className="px-6 py-4">Organization</th>
                                            <th className="px-6 py-4">Plan</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-v2-border">
                                        {orgs.map(o => (
                                            <tr key={o.id} className="group hover:bg-v2-accent/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <div className="font-bold text-sm tracking-tight">{o.name}</div>
                                                        <div className="text-[10px] text-v2-muted font-mono">{o.slug}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded bg-v2-accent/10 text-v2-accent text-[10px] font-black uppercase">
                                                        {o.plan || 'FREE'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                        o.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                                    }`}>
                                                        {o.is_active ? 'Active' : 'Disabled'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="v2-button secondary py-2 px-4 text-xs font-bold">
                                                        Override Quota
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Audit Logs */}
                    {activeTab === 'system' && (
                        <div className="v2-card p-0 overflow-hidden bg-black text-emerald-500 font-mono text-xs">
                           <div className="p-4 bg-v2-header border-b border-v2-border flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                    <Terminal size={14} />
                                    <span className="uppercase text-[10px] font-black tracking-widest">Platform Audit Stream</span>
                               </div>
                               <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] uppercase font-bold">Live Monitoring</span>
                               </div>
                           </div>
                           <div className="p-6 h-[500px] overflow-y-auto space-y-2">
                                {logs.length === 0 ? (
                                    <div className="text-v2-muted italic">No logs found in last period.</div>
                                ) : (
                                    logs.map((log, i) => (
                                        <div key={i} className="flex gap-4 border-l-2 border-emerald-500/20 pl-4 py-1 hover:border-emerald-500 transition-colors">
                                            <span className="text-emerald-500/40 shrink-0">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                                            <span className="font-bold shrink-0">{log.action}:</span>
                                            <span className="break-all">{JSON.stringify(log.payload)}</span>
                                            <span className="text-emerald-500/40 ml-auto shrink-0 uppercase text-[10px]">{log.actor_type}</span>
                                        </div>
                                    ))
                                )}
                           </div>
                        </div>
                    )}

                    {/* Infrastructure (Workers) */}
                    {activeTab === 'workers' && (
                        <div className="space-y-6">
                            <div className="text-v2-muted text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                Infrastructure Status 
                                <RefreshCw size={12} className="animate-spin text-v2-accent" /> 
                                <span className="text-[10px] text-v2-accent normal-case font-normal">(Live Dashboard)</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {workers.length === 0 ? (
                                    <div className="col-span-3 v2-card text-center py-20">
                                        <div className="mb-4 flex justify-center text-v2-muted"><Cpu size={48} /></div>
                                        <h3 className="font-bold">No Worker Nodes Registered</h3>
                                        <p className="text-v2-muted text-sm mt-1">Visit platform control to provision new compute nodes.</p>
                                    </div>
                                ) : (
                                    workers.map(w => (
                                        <div key={w.id} className="v2-card overflow-hidden group hover:border-v2-accent/30 transition-all">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="p-3 rounded-2xl bg-v2-accent/10 text-v2-accent">
                                                    <HardDrive size={24} />
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                                    w.status === 'idle' ? 'bg-emerald-500/10 text-emerald-500' : 
                                                    w.status === 'busy' ? 'bg-amber-500/10 text-amber-500' : 
                                                    'bg-rose-500/10 text-rose-500'
                                                }`}>
                                                    {w.status}
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-lg mb-1">{w.hostname}</h3>
                                            <p className="text-[10px] text-v2-muted font-mono mb-6">{w.ip_address}</p>
                                            
                                            <div className="space-y-4 mb-6">
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                                                        <span className="text-v2-muted">CPU Usage</span>
                                                        <span className={w.cpu_usage > 80 ? 'text-rose-500' : 'text-v2-text'}>{w.cpu_usage.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-v2-background rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-1000 ${w.cpu_usage > 80 ? 'bg-rose-500' : 'bg-v2-accent'}`} 
                                                            style={{ width: `${Math.min(100, w.cpu_usage)}%` }} 
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                                                        <span className="text-v2-muted">RAM Utilization</span>
                                                        <span>{w.memory_usage.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-v2-background rounded-full overflow-hidden">
                                                        <div className="h-full bg-v2-accent opacity-60" style={{ width: `${Math.min(100, w.memory_usage)}%` }} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-v2-border">
                                                <button 
                                                    onClick={() => handleWorkerAction(w.id, 'restart')}
                                                    className="v2-button secondary py-2 text-xs font-bold"
                                                >
                                                    Restart
                                                </button>
                                                <button 
                                                    onClick={() => handleWorkerAction(w.id, 'stop')}
                                                    className="v2-button danger py-2 text-xs font-bold"
                                                >
                                                    Shutdown
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                                
                                <div className="v2-card border-dashed border-v2-border flex flex-col items-center justify-center p-8 text-center opacity-60 hover:opacity-100 transition-opacity">
                                    <div className="p-4 rounded-full bg-v2-background border border-v2-border mb-4">
                                        <Activity size={24} className="text-v2-muted" />
                                    </div>
                                    <h4 className="font-bold text-sm">Provision compute</h4>
                                    <p className="text-[10px] text-v2-muted mt-1 mb-4">Add auto-scaling nodes to handle peaks in translation traffic.</p>
                                    <button className="v2-button secondary w-full py-2 text-xs font-bold">Provision Node</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Feature Flags */}
                    {activeTab === 'flags' && (
                        <div className="max-w-3xl mx-auto space-y-4">
                            <div className="v2-card bg-amber-500/5 border-amber-500/20 mb-8 p-6 flex gap-4 items-start">
                                <ShieldAlert className="text-amber-500 shrink-0" size={24} />
                                <div>
                                    <h4 className="font-bold text-amber-500 mb-1 tracking-tight uppercase text-xs">Administrative Warning</h4>
                                    <p className="text-amber-500/60 text-sm">Feature flags change system-wide behavior immediately. Use with caution in production environments.</p>
                                </div>
                            </div>

                            {flags.length === 0 ? (
                                <div className="v2-card text-center py-20 text-v2-muted italic">
                                    No dynamic feature flags registered in config.
                                </div>
                            ) : (
                                flags.map(flag => (
                                    <div key={flag.key} className="v2-card hover:border-v2-accent/30 transition-colors flex items-center justify-between group">
                                        <div>
                                            <div className="font-bold flex items-center gap-2">
                                                {flag.name}
                                                <span className="text-[10px] font-mono text-v2-muted font-normal bg-v2-background px-1.5 rounded">{flag.key}</span>
                                            </div>
                                            <p className="text-xs text-v2-muted mt-1">{flag.description}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleToggleFlag(flag.key, flag.enabled)}
                                            className={`w-14 h-8 rounded-full p-1 transition-all duration-300 relative ${
                                                flag.enabled ? 'bg-v2-accent' : 'bg-v2-muted opacity-40'
                                            }`}
                                        >
                                            <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                                                flag.enabled ? 'translate-x-6' : 'translate-x-0'
                                            }`} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Subscriptions Management */}
                    {activeTab === 'subscriptions' && (
                        <div className="space-y-10">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-semibold text-v2-text">Subscription Plans</h3>
                                        <p className="text-sm text-v2-muted">Manage pricing plans shown on billing & landing pages.</p>
                                    </div>
                                    <button 
                                        onClick={() => { 
                                            setShowCreatePlan(!showCreatePlan); 
                                            setEditingPlan(null); 
                                            setPlanForm({ name: '', description: '', price_monthly: 0, minutes_included: 1000, overage_rate_per_min: 0.05, max_rooms: 10, max_participants: 50, paypal_plan_id: '' }); 
                                        }} 
                                        className="px-6 py-2 bg-v2-accent text-white rounded-md text-sm font-medium hover:opacity-90 transition"
                                    >
                                        {showCreatePlan ? 'Cancel' : '+ New Plan'}
                                    </button>
                                </div>

                                {(showCreatePlan || editingPlan) && (
                                    <div className="bg-v2-card border border-v2-border rounded-lg p-6 space-y-4 animate-in zoom-in-95 duration-300">
                                        <h4 className="text-lg font-semibold text-v2-accent">{editingPlan ? 'Edit Plan' : 'Create New Plan'}</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Plan Name</label>
                                                <input className="v2-input w-full" value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} placeholder="e.g. Pro" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Price / Month ($)</label>
                                                <input type="number" className="v2-input w-full" value={planForm.price_monthly} onChange={e => setPlanForm({...planForm, price_monthly: parseFloat(e.target.value) || 0})} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Minutes Included</label>
                                                <input type="number" className="v2-input w-full" value={planForm.minutes_included} onChange={e => setPlanForm({...planForm, minutes_included: parseInt(e.target.value) || 0})} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Overage $/min</label>
                                                <input type="number" step="0.01" className="v2-input w-full" value={planForm.overage_rate_per_min} onChange={e => setPlanForm({...planForm, overage_rate_per_min: parseFloat(e.target.value) || 0})} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Max Rooms</label>
                                                <input type="number" className="v2-input w-full" value={planForm.max_rooms} onChange={e => setPlanForm({...planForm, max_rooms: parseInt(e.target.value) || 0})} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Max Participants</label>
                                                <input type="number" className="v2-input w-full" value={planForm.max_participants} onChange={e => setPlanForm({...planForm, max_participants: parseInt(e.target.value) || 0})} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest text-v2-accent">PayPal Plan ID</label>
                                                <input className="v2-input w-full border-v2-accent/30" value={planForm.paypal_plan_id} onChange={e => setPlanForm({...planForm, paypal_plan_id: e.target.value})} placeholder="P-..." />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs text-v2-muted block mb-1 uppercase font-bold tracking-widest">Description</label>
                                                <input className="v2-input w-full" value={planForm.description} onChange={e => setPlanForm({...planForm, description: e.target.value})} placeholder="Short description" />
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-4">
                                            <button 
                                                onClick={async () => { 
                                                    try { 
                                                        if (editingPlan) { await adminService.updatePlan(editingPlan, planForm); } 
                                                        else { await adminService.createPlan(planForm); } 
                                                        setShowCreatePlan(false); setEditingPlan(null); loadData(); 
                                                    } catch (err) { console.error(err); } 
                                                }} 
                                                className="px-6 py-2 bg-v2-accent text-white rounded-md text-sm font-medium hover:opacity-90"
                                            >
                                                {editingPlan ? 'Update Plan' : 'Create Plan'}
                                            </button>
                                            <button 
                                                onClick={() => { setShowCreatePlan(false); setEditingPlan(null); }} 
                                                className="px-6 py-2 bg-v2-muted/20 text-v2-text rounded-md text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {plans.map(plan => (
                                        <div key={plan.id} className={`v2-card flex flex-col relative ${!plan.is_active ? 'opacity-50' : ''}`}>
                                            {!plan.is_active && <div className="absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500">INACTIVE</div>}
                                            <h4 className="text-xl font-bold text-v2-text mb-1">{plan.name}</h4>
                                            {plan.description && <p className="text-xs text-v2-muted mb-4">{plan.description}</p>}
                                            <div className="mb-4"><span className="text-3xl font-bold text-v2-text">${plan.price_monthly}</span><span className="text-v2-muted text-sm">/mo</span></div>
                                            <div className="space-y-2 mb-6 flex-1 text-sm">
                                                <div className="flex justify-between p-2 bg-v2-background/50 rounded"><span className="text-v2-muted">Minutes</span><span className="font-semibold">{plan.minutes_included.toLocaleString()}</span></div>
                                                <div className="flex justify-between p-2 bg-v2-background/50 rounded"><span className="text-v2-muted">Overage</span><span className="font-semibold">${plan.overage_rate_per_min}/min</span></div>
                                                <div className="flex justify-between p-2 bg-v2-background/50 rounded"><span className="text-v2-muted">Max Rooms</span><span className="font-semibold">{plan.max_rooms}</span></div>
                                                <div className="flex justify-between p-2 bg-v2-background/50 rounded"><span className="text-v2-muted">Max Participants</span><span className="font-semibold">{plan.max_participants}</span></div>
                                                <div className="flex justify-between p-2 bg-v2-background/50 rounded overflow-hidden"><span className="text-v2-muted">PayPal ID</span><span className="font-mono text-[9px] truncate ml-4" title={plan.paypal_plan_id}>{plan.paypal_plan_id || 'NOT SET'}</span></div>
                                            </div>
                                            <div className="flex gap-2 pt-3 border-t border-v2-border">
                                                <button 
                                                    onClick={() => { 
                                                        setEditingPlan(plan.id); 
                                                        setShowCreatePlan(false); 
                                                        setPlanForm({ name: plan.name, description: plan.description || '', price_monthly: plan.price_monthly, minutes_included: plan.minutes_included, overage_rate_per_min: plan.overage_rate_per_min, max_rooms: plan.max_rooms, max_participants: plan.max_participants, paypal_plan_id: plan.paypal_plan_id || '' }); 
                                                    }} 
                                                    className="flex-1 py-2 text-sm bg-v2-muted/10 text-v2-text rounded hover:bg-v2-muted/20 font-bold"
                                                >
                                                    Edit
                                                </button>
                                                <button 
                                                    onClick={async () => { if (!window.confirm('Delete this plan?')) return; try { await adminService.deletePlan(plan.id); loadData(); } catch(e) { console.error(e); } }} 
                                                    className="py-2 px-4 text-sm bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 font-bold"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {plans.length === 0 && (
                                        <div className="col-span-full flex flex-col items-center justify-center py-16 text-v2-muted v2-card border-dashed">
                                            <CreditCard size={48} className="opacity-30 mb-4" />
                                            <p>No plans yet. Click "+ New Plan" to create one.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xl font-semibold text-v2-text">Active Subscribers</h3>
                                <div className="v2-card p-0 overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="bg-v2-background/50 text-[10px] font-black uppercase tracking-widest text-v2-muted border-b border-v2-border">
                                                <th className="py-4 px-6">Organization</th>
                                                <th className="py-4 px-6">Plan</th>
                                                <th className="py-4 px-6">Price</th>
                                                <th className="py-4 px-6">Status</th>
                                                <th className="py-4 px-6">Period End</th>
                                                <th className="py-4 px-6 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-v2-border/50">
                                            {subscriptions.map(s => (
                                                <tr key={s.id} className="hover:bg-v2-background/50 transition group transition-colors">
                                                    <td className="py-4 px-6">
                                                        <p className="font-bold">{s.org_name}</p>
                                                        <p className="text-[10px] text-v2-muted font-mono tracking-tight">@{s.org_slug}</p>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <span className="text-[10px] font-black uppercase text-v2-accent bg-v2-accent/10 px-2 py-0.5 rounded">{s.plan_name}</span>
                                                    </td>
                                                    <td className="py-4 px-6 font-bold text-emerald-500">${s.plan_price}/mo</td>
                                                    <td className="py-4 px-6">
                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                            s.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                                        }`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-[10px] font-mono text-v2-muted uppercase">
                                                        {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}
                                                    </td>
                                                    <td className="py-4 px-6 text-right">
                                                        <button 
                                                            onClick={async () => { 
                                                                if (!window.confirm(`${s.status === 'active' ? 'Cancel' : 'Reactivate'} subscription for ${s.org_name}?`)) return; 
                                                                try { await adminService.cancelSubscription(s.id); loadData(true); } catch(e) { console.error(e); } 
                                                            }} 
                                                            className={`text-[10px] font-black uppercase px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-all ${
                                                                s.status === 'active' ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'
                                                            }`}
                                                        >
                                                            {s.status === 'active' ? 'Cancel' : 'Reactivate'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {subscriptions.length === 0 && (
                                                <tr>
                                                    <td colSpan="6" className="py-12 text-center text-v2-muted italic">No subscriptions found.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Invoices / Payments */}
                    {activeTab === 'invoices' && (
                        <div className="v2-card p-0 overflow-hidden">
                            <div className="p-6 border-b border-v2-border flex items-center justify-between bg-v2-header/30">
                                <h3 className="font-bold">Recent Payments</h3>
                                <div className="flex items-center gap-3">
                                    {syncResult && (
                                        <span className={`text-[10px] font-bold uppercase ${syncResult.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {syncResult.success
                                                ? `Synced: ${syncResult.created} invoice${syncResult.created !== 1 ? 's' : ''} created`
                                                : `Sync failed: ${syncResult.error}`}
                                        </span>
                                    )}
                                    <button
                                        onClick={handleSyncInvoices}
                                        disabled={syncingInvoices}
                                        className="px-3 py-1.5 rounded-lg bg-v2-accent/10 border border-v2-accent/20 text-v2-accent text-[10px] font-black uppercase tracking-widest hover:bg-v2-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    >
                                        {syncingInvoices ? (
                                            <><span className="animate-spin inline-block w-3 h-3 border-2 border-v2-accent border-t-transparent rounded-full" />Syncing...</>
                                        ) : (
                                            <>Sync from PayPal</>
                                        )}
                                    </button>
                                    <span className="text-[10px] text-v2-muted uppercase font-bold">Billing Provider: PayPal</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-v2-background/50 text-[10px] font-black uppercase tracking-widest text-v2-muted border-b border-v2-border">
                                            <th className="px-6 py-4">Receipt ID</th>
                                            <th className="px-6 py-4">Organization</th>
                                            <th className="px-6 py-4">Amount</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Date</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-v2-border">
                                        {allInvoices.map(inv => (
                                            <tr key={inv.id} className="group hover:bg-v2-accent/5 transition-colors">
                                                <td className="px-6 py-4 font-mono text-xs">{inv.id?.slice(0, 8)}</td>
                                                <td className="px-6 py-4 text-sm font-medium">{inv.org_name || '—'}</td>
                                                <td className="px-6 py-4 font-bold">${parseFloat(inv.amount).toFixed(2)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                        inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                                                    }`}>
                                                        {inv.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-v2-muted">
                                                    {(inv.paid_at || inv.created_at) ? new Date(inv.paid_at || inv.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {inv.pdf_url ? (
                                                        <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="text-v2-accent hover:underline text-[10px] font-black uppercase">View Details</a>
                                                    ) : (
                                                        <span className="text-[10px] font-black uppercase text-v2-muted/50">N/A</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {allInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-12 text-center text-v2-muted italic">No invoices found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Discount Codes */}
                    {activeTab === 'discounts' && (
                        <div className="max-w-5xl mx-auto space-y-8">
                            {/* Generate Code Form */}
                            <div className="v2-card">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                    <DollarSign size={20} className="text-v2-accent" />
                                    Generate Discount Code
                                </h3>
                                <div className="flex flex-col sm:flex-row gap-4 items-end">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Discount %</label>
                                        <input
                                            type="number" min="1" max="100"
                                            className="v2-input"
                                            value={discountForm.percent_off}
                                            onChange={e => setDiscountForm(f => ({ ...f, percent_off: parseInt(e.target.value) || 0 }))}
                                            placeholder="e.g. 20"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Expires in (days, optional)</label>
                                        <input
                                            type="number" min="1"
                                            className="v2-input"
                                            value={discountForm.expires_in_days}
                                            onChange={e => setDiscountForm(f => ({ ...f, expires_in_days: e.target.value }))}
                                            placeholder="Leave empty for no expiry"
                                        />
                                    </div>
                                    <button
                                        disabled={creatingCode || !discountForm.percent_off}
                                        onClick={async () => {
                                            setCreatingCode(true);
                                            try {
                                                const payload = { percent_off: discountForm.percent_off };
                                                if (discountForm.expires_in_days) payload.expires_in_days = parseInt(discountForm.expires_in_days);
                                                await adminService.createDiscountCode(payload);
                                                loadData(true);
                                            } catch (err) {
                                                alert('Failed to create code: ' + (err.response?.data?.detail || err.message));
                                            } finally {
                                                setCreatingCode(false);
                                            }
                                        }}
                                        className="v2-btn py-3 px-8 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                                    >
                                        {creatingCode ? 'Creating...' : 'Generate Code'}
                                    </button>
                                </div>
                            </div>

                            {/* Codes Table */}
                            <div className="v2-card p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-v2-header/30 border-b border-v2-border/30">
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted">Code</th>
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted">Discount</th>
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted">Status</th>
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted">Expires</th>
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted">Created</th>
                                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-v2-muted text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-v2-border/20 text-sm">
                                            {discountCodes.length === 0 ? (
                                                <tr><td colSpan="6" className="px-6 py-12 text-center text-v2-muted italic">No discount codes yet. Generate one above.</td></tr>
                                            ) : discountCodes.map(c => {
                                                const isExpired = c.is_expired;
                                                const statusLabel = c.is_used ? 'Used' : isExpired ? 'Expired' : 'Active';
                                                const statusColor = c.is_used ? 'bg-blue-100 text-blue-600' : isExpired ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600';
                                                return (
                                                    <tr key={c.id} className="hover:bg-v2-header/10 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <button
                                                                onClick={() => { navigator.clipboard.writeText(c.code); alert('Copied!'); }}
                                                                className="font-mono font-bold text-v2-accent hover:underline cursor-pointer text-sm tracking-wider"
                                                                title="Click to copy"
                                                            >
                                                                {c.code}
                                                            </button>
                                                        </td>
                                                        <td className="px-6 py-4 font-bold">{c.percent_off}%</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter ${statusColor}`}>{statusLabel}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-v2-muted text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never'}</td>
                                                        <td className="px-6 py-4 text-v2-muted text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            {!c.is_used && (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!window.confirm('Delete this discount code?')) return;
                                                                        try {
                                                                            await adminService.deleteDiscountCode(c.id);
                                                                            loadData(true);
                                                                        } catch (err) {
                                                                            alert('Failed to delete: ' + (err.response?.data?.detail || err.message));
                                                                        }
                                                                    }}
                                                                    className="text-[10px] font-bold uppercase tracking-tighter text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-all"
                                                                >
                                                                    Delete
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Management Tab */}
                    {activeTab === 'management' && (
                        <div className="space-y-10">
                            {/* ── Section 1: Plan Price Editor ──────────────── */}
                            <div>
                                <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    <CreditCard size={20} className="text-v2-accent" />
                                    Plan Price & Feature Editor
                                </h3>
                                <p className="text-xs text-v2-muted mb-4">Edit pricing, minutes, and features for all billing plans. Changes are saved to the database.</p>

                                {/* Individual Plans */}
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-v2-accent bg-v2-accent/10 px-3 py-1 rounded-full">Individual Plans</span>
                                    <div className="flex-1 h-px bg-v2-border/40" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {mgmtPlans.filter(p => !['free', 'team', 'business', 'enterprise'].includes(p.name?.toLowerCase())).map(plan => {
                                        const isEditing = mgmtEditingPlan?.id === plan.id;
                                        const editPlan = isEditing ? mgmtEditingPlan : plan;
                                        return (
                                            <div key={plan.id} className={`v2-card transition-all ${isEditing ? 'ring-2 ring-v2-accent shadow-lg' : 'hover:shadow-md'}`}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="font-bold text-base uppercase tracking-tight">{plan.name}</h4>
                                                    {plan.features?.sales_commission_pct && (
                                                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                                                            {plan.features.sales_commission_pct}% Commission
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Price ($/mo)</label>
                                                        <input type="number" step="0.01" className="v2-input text-sm font-bold"
                                                            value={isEditing ? editPlan.price_monthly : plan.price_monthly}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, price_monthly: parseFloat(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Minutes Included</label>
                                                        <input type="number" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.minutes_included : plan.minutes_included}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, minutes_included: parseInt(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Max Rooms</label>
                                                        <input type="number" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.max_rooms : plan.max_rooms}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, max_rooms: parseInt(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Overage Rate ($/min)</label>
                                                        <input type="number" step="0.01" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.overage_rate_per_min : plan.overage_rate_per_min}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, overage_rate_per_min: parseFloat(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Support Type</label>
                                                        <input type="text" className="v2-input text-sm"
                                                            value={isEditing ? (editPlan.features?.support || '') : (plan.features?.support || '')}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, features: { ...p.features, support: e.target.value } }))}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 pt-2">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    disabled={mgmtSaving}
                                                                    onClick={async () => {
                                                                        setMgmtSaving(true);
                                                                        try {
                                                                            await adminService.updatePlan(editPlan.id, {
                                                                                price_monthly: editPlan.price_monthly,
                                                                                minutes_included: editPlan.minutes_included,
                                                                                max_rooms: editPlan.max_rooms,
                                                                                overage_rate_per_min: editPlan.overage_rate_per_min,
                                                                                features: editPlan.features
                                                                            });
                                                                            setMgmtEditingPlan(null);
                                                                            loadData(true);
                                                                            alert('Plan updated!');
                                                                        } catch (err) {
                                                                            alert('Failed: ' + (err.response?.data?.detail || err.message));
                                                                        } finally { setMgmtSaving(false); }
                                                                    }}
                                                                    className="flex-1 v2-btn py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1"
                                                                >
                                                                    <Save size={12} /> {mgmtSaving ? 'Saving...' : 'Save'}
                                                                </button>
                                                                <button onClick={() => setMgmtEditingPlan(null)}
                                                                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-v2-muted hover:text-v2-text border border-v2-border rounded-md">
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => setMgmtEditingPlan({ ...plan })}
                                                                className="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest text-v2-accent border border-v2-accent/30 rounded-md hover:bg-v2-accent/5 transition-colors">
                                                                Edit Plan
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Organization Plans — from DB, editable */}
                                <div className="flex items-center gap-3 mt-10 mb-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full">Organization Plans</span>
                                    <div className="flex-1 h-px bg-v2-border/40" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {[
                                        { slot: 'Team',       defaults: { price_monthly: 49,  minutes_included: 2500,  max_rooms: 25,  overage_rate_per_min: 0.04, features: { support: 'Priority Email' } } },
                                        { slot: 'Business',   defaults: { price_monthly: 199, minutes_included: 10000, max_rooms: 100, overage_rate_per_min: 0.03, features: { support: 'Priority Email' } } },
                                        { slot: 'Enterprise', defaults: { price_monthly: 999, minutes_included: 50000, max_rooms: 500, overage_rate_per_min: 0.02, features: { support: '24/7 Dedicated' } } },
                                    ].map(({ slot, defaults }) => {
                                        const plan = mgmtPlans.find(p => p.name?.toLowerCase() === slot.toLowerCase());
                                        const inDb = !!plan;
                                        const isEditing = inDb && mgmtEditingPlan?.id === plan.id;
                                        const editPlan = isEditing ? mgmtEditingPlan : (plan || defaults);
                                        const isEnterprise = slot === 'Enterprise';
                                        return (
                                            <div key={slot} className={`v2-card border-indigo-400/20 transition-all ${isEditing ? 'ring-2 ring-indigo-400 shadow-lg' : 'hover:shadow-md'}`}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="font-bold text-base uppercase tracking-tight text-v2-text">{slot}</h4>
                                                    <div className="flex items-center gap-1.5">
                                                        {!inDb && <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase">Not in DB</span>}
                                                        <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">Org Plan</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Price ($/mo)</label>
                                                        <input type="number" step="0.01" className="v2-input text-sm font-bold"
                                                            value={isEditing ? editPlan.price_monthly : (plan?.price_monthly ?? defaults.price_monthly)}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, price_monthly: parseFloat(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Minutes Included</label>
                                                        <input type="number" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.minutes_included : (plan?.minutes_included ?? defaults.minutes_included)}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, minutes_included: parseInt(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Max Rooms</label>
                                                        <input type="number" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.max_rooms : (plan?.max_rooms ?? defaults.max_rooms)}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, max_rooms: parseInt(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Overage Rate ($/min)</label>
                                                        <input type="number" step="0.01" className="v2-input text-sm"
                                                            value={isEditing ? editPlan.overage_rate_per_min : (plan?.overage_rate_per_min ?? defaults.overage_rate_per_min)}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, overage_rate_per_min: parseFloat(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Support Type</label>
                                                        <input type="text" className="v2-input text-sm"
                                                            value={isEditing ? (editPlan.features?.support || '') : (plan?.features?.support ?? defaults.features.support)}
                                                            disabled={!isEditing}
                                                            onChange={e => setMgmtEditingPlan(p => ({ ...p, features: { ...p.features, support: e.target.value } }))}
                                                        />
                                                    </div>
                                                    {isEnterprise && !isEditing && (
                                                        <p className="text-[10px] text-indigo-400 font-medium italic">Managed via Enterprise Plan Creator below — use "Create Enterprise Plan" to assign to an org.</p>
                                                    )}
                                                    {!inDb && !isEnterprise && (
                                                        <p className="text-[10px] text-amber-500 font-medium italic">Not yet in database — create via Subscriptions tab ("+ New Plan") to activate.</p>
                                                    )}
                                                    <div className="flex gap-2 pt-2">
                                                        {inDb && (isEditing ? (
                                                            <>
                                                                <button
                                                                    disabled={mgmtSaving}
                                                                    onClick={async () => {
                                                                        setMgmtSaving(true);
                                                                        try {
                                                                            await adminService.updatePlan(editPlan.id, {
                                                                                price_monthly: editPlan.price_monthly,
                                                                                minutes_included: editPlan.minutes_included,
                                                                                max_rooms: editPlan.max_rooms,
                                                                                overage_rate_per_min: editPlan.overage_rate_per_min,
                                                                                features: editPlan.features
                                                                            });
                                                                            setMgmtEditingPlan(null);
                                                                            loadData(true);
                                                                            alert('Plan updated!');
                                                                        } catch (err) {
                                                                            alert('Failed: ' + (err.response?.data?.detail || err.message));
                                                                        } finally { setMgmtSaving(false); }
                                                                    }}
                                                                    className="flex-1 v2-btn py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1"
                                                                >
                                                                    <Save size={12} /> {mgmtSaving ? 'Saving...' : 'Save'}
                                                                </button>
                                                                <button onClick={() => setMgmtEditingPlan(null)}
                                                                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-v2-muted hover:text-v2-text border border-v2-border rounded-md">
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => setMgmtEditingPlan({ ...plan })}
                                                                className="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500 border border-indigo-400/30 rounded-md hover:bg-indigo-50/50 transition-colors">
                                                                Edit Plan
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Section 2: Enterprise Plan Creator ──────── */}
                            <div className="v2-card">
                                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                                    <Briefcase size={20} className="text-amber-500" />
                                    Create Enterprise Plan
                                </h3>
                                <p className="text-xs text-v2-muted mb-6">Create a custom enterprise plan from an inquiry and optionally assign it to an existing organization.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Company Name *</label>
                                        <input className="v2-input" placeholder="Acme Corp" value={enterpriseForm.company_name}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, company_name: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Inquiry Email *</label>
                                        <input className="v2-input" type="email" placeholder="cto@acme.com" value={enterpriseForm.inquiry_email}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, inquiry_email: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Price ($/mo) *</label>
                                        <input className="v2-input" type="number" value={enterpriseForm.price_monthly}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, price_monthly: parseFloat(e.target.value) || 0 }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Minutes Included</label>
                                        <input className="v2-input" type="number" value={enterpriseForm.minutes_included}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, minutes_included: parseInt(e.target.value) || 0 }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Max Rooms</label>
                                        <input className="v2-input" type="number" value={enterpriseForm.max_rooms}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, max_rooms: parseInt(e.target.value) || 0 }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-v2-muted">Assign to Organization</label>
                                        <select className="v2-input" value={enterpriseForm.org_id}
                                            onChange={e => setEnterpriseForm(f => ({ ...f, org_id: e.target.value }))}>
                                            <option value="">None (create plan only)</option>
                                            {orgs.map(o => (
                                                <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end mt-6">
                                    <button
                                        disabled={creatingEnterprise || !enterpriseForm.company_name || !enterpriseForm.inquiry_email}
                                        onClick={async () => {
                                            setCreatingEnterprise(true);
                                            try {
                                                const payload = { ...enterpriseForm };
                                                if (!payload.org_id) delete payload.org_id;
                                                const result = await adminService.createEnterprisePlan(payload);
                                                alert(`Enterprise plan created: ${result.plan_name}${result.assigned_org ? ' (assigned to org)' : ''}`);
                                                setEnterpriseForm({ inquiry_email: '', company_name: '', price_monthly: 999, minutes_included: 50000, max_rooms: 100, max_participants: 500, org_id: '' });
                                                loadData(true);
                                            } catch (err) {
                                                alert('Failed: ' + (err.response?.data?.detail || err.message));
                                            } finally { setCreatingEnterprise(false); }
                                        }}
                                        className="v2-btn py-3 px-8 text-xs font-bold uppercase tracking-widest flex items-center gap-2 !bg-amber-500 !border-amber-400 hover:!bg-amber-600"
                                    >
                                        <Plus size={14} /> {creatingEnterprise ? 'Creating...' : 'Create Enterprise Plan'}
                                    </button>
                                </div>
                            </div>

                            {/* ── Section 3: Sales Commission Overview ─────── */}
                            <div className="v2-card">
                                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                                    <TrendingUp size={20} className="text-emerald-500" />
                                    Sales Commission Overview
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full ml-2">1% Recurring</span>
                                </h3>
                                <p className="text-xs text-v2-muted mb-6">Projected recurring sales commission across all active subscriptions.</p>
                                
                                {commissions ? (
                                    <>
                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                            <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Monthly Commission</p>
                                                <p className="text-3xl font-bold text-emerald-700">${commissions.total_monthly_commission?.toFixed(2)}</p>
                                            </div>
                                            <div className="p-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Annual Projection</p>
                                                <p className="text-3xl font-bold text-blue-700">${commissions.total_annual_commission?.toFixed(2)}</p>
                                            </div>
                                            <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Active Subscriptions</p>
                                                <p className="text-3xl font-bold text-indigo-700">{commissions.active_subscriptions}</p>
                                            </div>
                                        </div>

                                        {/* Commission Table */}
                                        <div className="overflow-x-auto rounded-xl border border-v2-border">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-v2-header/30 border-b border-v2-border/30">
                                                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-v2-muted">Organization</th>
                                                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-v2-muted">Plan</th>
                                                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-v2-muted">Plan Price</th>
                                                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-v2-muted">Commission %</th>
                                                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-v2-muted text-right">Monthly Commission</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-v2-border/20 text-sm">
                                                    {commissions.items?.length === 0 ? (
                                                        <tr><td colSpan="5" className="px-5 py-10 text-center text-v2-muted italic">No active subscriptions with commission.</td></tr>
                                                    ) : commissions.items?.map((item, i) => (
                                                        <tr key={item.subscription_id || i} className="hover:bg-v2-header/10 transition-colors">
                                                            <td className="px-5 py-3 font-semibold">{item.org_name}</td>
                                                            <td className="px-5 py-3">
                                                                <span className="text-[10px] font-bold bg-v2-accent/10 text-v2-accent px-2 py-0.5 rounded-full">{item.plan_name}</span>
                                                            </td>
                                                            <td className="px-5 py-3 font-bold">${item.plan_price?.toFixed(2)}</td>
                                                            <td className="px-5 py-3 text-emerald-600 font-bold">{item.commission_pct}%</td>
                                                            <td className="px-5 py-3 text-right font-bold text-emerald-600">${item.monthly_commission?.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-12 text-v2-muted">
                                        <TrendingUp size={36} className="mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">Loading commission data...</p>
                                    </div>
                                )}
                            </div>

                            {/* ── Section 4: Org Subscription Overview ─────── */}
                            <div className="v2-card p-0 overflow-hidden">
                                <div className="p-5 border-b border-v2-border bg-v2-header/30">
                                    <h3 className="text-base font-bold flex items-center gap-2">
                                        <Building2 size={18} className="text-blue-500" />
                                        Organization Subscriptions
                                    </h3>
                                    <p className="text-xs text-v2-muted mt-1">Active plan per organization — pulled from real subscription records.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="bg-v2-background/50 text-[10px] font-black uppercase tracking-widest text-v2-muted border-b border-v2-border">
                                                <th className="px-5 py-3">Organization</th>
                                                <th className="px-5 py-3">Plan</th>
                                                <th className="px-5 py-3">Status</th>
                                                <th className="px-5 py-3">Renews</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-v2-border/20">
                                            {subscriptions.length === 0 ? (
                                                <tr><td colSpan="4" className="px-5 py-10 text-center text-v2-muted italic">No subscriptions found.</td></tr>
                                            ) : subscriptions.map(sub => {
                                                const matchedOrg = orgs.find(o => o.id === sub.org_id || o.id === String(sub.org_id));
                                                const plan = mgmtPlans.find(p => p.id === sub.plan_id || p.id === String(sub.plan_id));
                                                return (
                                                    <tr key={sub.id} className="hover:bg-v2-header/10 transition-colors">
                                                        <td className="px-5 py-3 font-semibold">{matchedOrg?.name || sub.org_id?.toString().slice(0, 8)}</td>
                                                        <td className="px-5 py-3">
                                                            <span className="text-[10px] font-bold bg-v2-accent/10 text-v2-accent px-2 py-0.5 rounded-full">{plan?.name || '—'}</span>
                                                        </td>
                                                        <td className="px-5 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${sub.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                                                {sub.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3 text-xs text-v2-muted">
                                                            {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* System Config */}
                    {activeTab === 'config' && (
                        <div className="max-w-4xl mx-auto space-y-8">
                            <div className="v2-card">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                    <Settings size={20} className="text-v2-accent" />
                                    Master Platform Settings
                                </h3>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Platform Name</label>
                                            <input className="v2-input" defaultValue="AYTME" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-v2-muted">Support Email</label>
                                            <input className="v2-input" defaultValue="ops@aytme.com" />
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-v2-background border border-v2-border">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-bold text-sm">Maintenance Mode</h4>
                                                <p className="text-xs text-v2-muted">Redirect all traffic to a maintenance page.</p>
                                            </div>
                                            <button className="w-12 h-6 rounded-full bg-v2-muted/20 relative">
                                                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-v2-muted" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4">
                                        <button className="v2-button secondary py-2 px-6 text-xs font-bold">Discard Changes</button>
                                        <button className="v2-button py-2 px-6 text-xs font-bold bg-v2-accent text-white">Save Configuration</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
