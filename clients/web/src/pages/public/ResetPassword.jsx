import React, { useState } from 'react';
import { Lock, ShieldCheck, ArrowRight, Activity } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export default function ResetPassword() {
    const navigate = useNavigate();
    const { token } = useParams();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            alert('Password successfully reset');
            navigate('/login');
            setLoading(false);
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2"></div>

            <div className="max-w-md w-full bg-white/80 backdrop-blur-3xl border border-slate-200 rounded-[40px] p-10 md:p-12 shadow-2xl relative z-10 transition-all duration-500">
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">Create New Password</h1>
                    <p className="text-slate-500 mt-2 font-medium">Please enter a strong password for your account.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">New Password</label>
                        <div className="relative group">
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 group-hover:border-indigo-400 rounded-2xl px-5 py-4 pl-12 focus:ring-4 focus:ring-indigo-500/10 outline-none text-slate-800 font-bold transition-all"
                                placeholder="••••••••"
                            />
                            <Lock className="absolute left-4 top-4 text-slate-400 group-hover:text-indigo-500 transition-colors" size={20} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Confirm Password</label>
                        <div className="relative group">
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 group-hover:border-indigo-400 rounded-2xl px-5 py-4 pl-12 focus:ring-4 focus:ring-indigo-500/10 outline-none text-slate-800 font-bold transition-all"
                                placeholder="••••••••"
                            />
                            <ShieldCheck className="absolute left-4 top-4 text-slate-400 group-hover:text-indigo-500 transition-colors" size={20} />
                        </div>
                    </div>

                    {error && <p className="text-rose-500 text-xs font-black uppercase text-center">{error}</p>}

                    <button
                        disabled={loading}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? <Activity className="animate-spin" /> : <>Update Password <ArrowRight size={18} /></>}
                    </button>
                </form>
            </div>
        </div>
    );
}
