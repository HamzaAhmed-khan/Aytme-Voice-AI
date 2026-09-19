import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, UserPlus, ArrowRight, Zap, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function Signup({ onSignup, onNavigateLogin }) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const setPendingPlan = useAuthStore(state => state.setPendingPlan);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await authService.signup(email, password, fullName);
            await authService.login(email, password);
            toast.success('Account Created! Welcome to AYTME.');
            onSignup();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col lg:flex-row relative overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Ultra-Premium Background Layer */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-blue-600/10 blur-[180px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[150px] rounded-full animate-pulse delay-700" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
            </div>

            {/* Left Branding Panel */}
            <div className="hidden lg:flex flex-col justify-between w-[40%] xl:w-[45%] p-16 xl:p-24 z-10 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl relative">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4"
                >
                    <div className="w-12 h-12 bg-white flex items-center justify-center rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.2)] group cursor-pointer transition-transform hover:scale-110">
                        <Zap className="text-slate-950 w-7 h-7" fill="currentColor" />
                    </div>
                    <span className="text-3xl font-black tracking-tighter italic text-white uppercase antialiased">AYTME</span>
                </motion.div>

                <div className="space-y-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <h1 className="text-[7rem] xl:text-[9rem] font-black italic tracking-tighter leading-[0.8] text-white">
                            NEW<br />
                            <span className="bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">VOICE</span><br />
                            ACCOUNT
                        </h1>
                    </motion.div>

                    <div className="space-y-4">
                        {[
                            'Instant Real-time Translation',
                            'Multi-language Support',
                            'High-Fidelity AI Voices',
                            'Enterprise Security'
                        ].map((feat, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + (i * 0.1) }}
                                className="flex items-center gap-3 text-slate-400"
                            >
                                <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                    <CheckCircle2 size={12} className="text-indigo-400" />
                                </div>
                                <span className="font-bold text-[10px] uppercase tracking-[0.2em]">{feat}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-white/5 pt-12"></div>
            </div>

            {/* Right Auth Panel */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-24 z-10 relative overflow-y-auto">
                {/* Mobile Identity */}
                <div className="absolute top-8 left-8 lg:hidden flex items-center gap-3">
                    <div className="w-10 h-10 bg-white flex items-center justify-center rounded-xl shadow-xl">
                        <Zap className="text-slate-950 w-5 h-5" fill="currentColor" />
                    </div>
                    <span className="text-xl font-black italic text-white uppercase tracking-tighter">AYTME</span>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-[500px] bg-white/[0.03] border border-white/10 rounded-[48px] p-8 sm:p-12 xl:p-16 shadow-[0_48px_100px_-24px_rgba(0,0,0,0.6)] backdrop-blur-2xl relative group/card"
                >
                    {/* Interior Glow */}
                    <div className="absolute -inset-4 bg-blue-500/5 blur-3xl rounded-[60px] -z-10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000" />

                    <div className="mb-12 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-4xl sm:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">Create<br />Account</h2>
                            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                                <UserPlus className="text-white/40" size={20} />
                            </div>
                        </div>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Join the future of voice</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="group space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 group-focus-within:text-blue-400 transition-colors">Full Name</label>
                                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] focus-within:border-white/30 focus-within:bg-white/[0.06] transition-all">
                                    <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Alex Rivera"
                                        className="w-full bg-transparent pl-16 pr-6 py-6 outline-none font-bold text-white placeholder:text-slate-700 transition-all text-sm"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                    />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-blue-500 transition-all duration-500 group-focus-within:w-full" />
                                </div>
                            </div>

                            <div className="group space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 group-focus-within:text-indigo-400 transition-colors">Email Address</label>
                                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] focus-within:border-white/30 focus-within:bg-white/[0.06] transition-all">
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
                                    <input
                                        type="email"
                                        placeholder="alex@aytme.io"
                                        className="w-full bg-transparent pl-16 pr-6 py-6 outline-none font-bold text-white placeholder:text-slate-700 transition-all text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-indigo-500 transition-all duration-500 group-focus-within:w-full" />
                                </div>
                            </div>

                            <div className="group space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 group-focus-within:text-purple-400 transition-colors">Password</label>
                                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] focus-within:border-white/30 focus-within:bg-white/[0.06] transition-all">
                                    <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
                                    <input
                                        type="password"
                                        placeholder="••••••••••••"
                                        className="w-full bg-transparent pl-16 pr-6 py-6 outline-none font-bold text-white placeholder:text-slate-700 transition-all text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                    />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-purple-500 transition-all duration-500 group-focus-within:w-full" />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-6 bg-white text-slate-950 rounded-3xl font-black text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-[0_24px_60px_-12px_rgba(255,255,255,0.2)] hover:shadow-[0_32px_80px_-12px_rgba(255,255,255,0.3)] hover:-translate-y-1 active:scale-[0.97] active:translate-y-0 disabled:opacity-50 group"
                        >
                            {loading ? <RefreshCw className="animate-spin" size={18} /> : <UserPlus size={18} className="group-hover:translate-x-1 transition-transform" />}
                            Create Account
                        </button>
                    </form>

                    <div className="mt-12 flex flex-col items-center gap-8">
                        <div className="flex items-center gap-4 w-full opacity-30">
                            <div className="h-[1px] flex-1 bg-white" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em]">Redirect</span>
                            <div className="h-[1px] flex-1 bg-white" />
                        </div>

                        <button
                            onClick={onNavigateLogin}
                            className="group flex flex-col items-center gap-2"
                        >
                            <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Already have an account?</span>
                            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-[0.2em] border-b border-white/0 group-hover:border-blue-500 transition-all pb-0.5">
                                Sign In <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
