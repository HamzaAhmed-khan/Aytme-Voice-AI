import React, { useState } from 'react';
import { Mail, Lock, LogIn, ShieldCheck, RefreshCw, KeyRound, ArrowRight, Zap, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '../../services/api';
import toast from 'react-hot-toast';

export default function Login({ onLogin, onNavigateSignup }) {
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const [loginMode, setLoginMode] = useState('password'); // 'password' or 'otp'
    const [email, setEmail] = useState(isDev ? 'admin@aytme.io' : '');
    const [password, setPassword] = useState(isDev ? 'admin123' : '');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await authService.login(email, password);
            toast.success('Login successful. Welcome back!');
            if (onLogin) onLogin();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Login failed. Check your email and password.');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestOtp = async () => {
        if (!email) { toast.error('Please enter your email'); return; }
        setLoading(true);
        try {
            await authService.requestOtp(email);
            setOtpSent(true);
            toast.success('Verification code sent to your email');
        } catch (err) {
            toast.error('System error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpLogin = async (e) => {
        e.preventDefault();
        if (!otp) { toast.error('Verification code is required'); return; }
        setLoading(true);
        try {
            await authService.loginOtp(email, otp);
            toast.success('Login Successful.');
            if (onLogin) onLogin();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Invalid or expired code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col lg:flex-row relative overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Ultra-Premium Background Layer */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 blur-[180px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full animate-pulse delay-700" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
            </div>

            {/* Left Branding Panel - Hidden on Mobile, Premium on Desktop */}
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
                            REAL<br />
                            <span className="bg-gradient-to-br from-indigo-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">TIME</span><br />
                            VOICE
                        </h1>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-slate-400 text-lg xl:text-xl max-w-sm font-medium leading-relaxed"
                    >
                        Break language barriers with low-latency AI translation.
                        Professional grade communication for global teams.
                    </motion.p>
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex gap-12 border-t border-white/5 pt-12"
                >
                    {[
                        { val: '<300ms', label: 'Latency' },
                        { val: '256-bit', label: 'AES' },
                        { val: 'v2.0', label: 'Engine' }
                    ].map((stat, i) => (
                        <div key={i} className="space-y-1 opacity-70 hover:opacity-100 transition-opacity cursor-default">
                            <p className="text-white font-black text-2xl tracking-tighter italic">{stat.val}</p>
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">{stat.label}</p>
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Right Auth Panel - Centered on Mobile, Half-screen on Desktop */}
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
                    <div className="absolute -inset-4 bg-indigo-500/5 blur-3xl rounded-[60px] -z-10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000" />

                    <div className="mb-12 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-4xl sm:text-5xl font-black italic tracking-tighter text-white uppercase">Sign In</h2>
                            <div className="w-10 h-1 bg-white/10 rounded-full" />
                        </div>

                        <div className="flex gap-1.5 p-1 bg-black/40 rounded-2xl w-fit border border-white/5">
                            <button
                                onClick={() => { setLoginMode('password'); setOtpSent(false); }}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${loginMode === 'password' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Password
                            </button>
                            <button
                                onClick={() => setLoginMode('otp')}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${loginMode === 'otp' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Email Code
                            </button>
                        </div>
                    </div>

                    <form onSubmit={loginMode === 'password' ? handlePasswordLogin : handleOtpLogin} className="space-y-6">
                        <div className="space-y-5">
                            <div className="group space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 group-focus-within:text-indigo-400 transition-colors">Email Address</label>
                                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] focus-within:border-white/30 focus-within:bg-white/[0.06] transition-all">
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
                                    <input
                                        type="email"
                                        placeholder="you@example.com"
                                        className="w-full bg-transparent pl-16 pr-6 py-6 outline-none font-bold text-white placeholder:text-slate-700 transition-all text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-indigo-500 transition-all duration-500 group-focus-within:w-full" />
                                </div>
                            </div>

                            {loginMode === 'password' ? (
                                <div className="group space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 group-focus-within:text-blue-400 transition-colors">Password</label>
                                    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] focus-within:border-white/30 focus-within:bg-white/[0.06] transition-all">
                                        <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
                                        <input
                                            type="password"
                                            placeholder="••••••••••••"
                                            className="w-full bg-transparent pl-16 pr-6 py-6 outline-none font-bold text-white placeholder:text-slate-700 transition-all text-sm"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                        <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-blue-500 transition-all duration-500 group-focus-within:w-full" />
                                    </div>
                                </div>
                            ) : (
                                <AnimatePresence mode="wait">
                                    {otpSent ? (
                                        <motion.div
                                            key="otp"
                                            initial={{ opacity: 0, scale: 0.98 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="space-y-2"
                                        >
                                            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] text-center block">Enter Code</label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    placeholder="0 0 0 0 0 0"
                                                    className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-3xl px-8 py-7 outline-none focus:border-emerald-400 focus:bg-emerald-500/10 transition-all font-black text-white text-4xl tracking-[0.4em] text-center"
                                                    value={otp}
                                                    onChange={(e) => setOtp(e.target.value)}
                                                    maxLength={6}
                                                    required
                                                />
                                                <div className="absolute inset-0 rounded-3xl pointer-events-none border border-emerald-500/20 animate-pulse" />
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.button
                                            key="request"
                                            type="button"
                                            onClick={handleRequestOtp}
                                            className="w-full py-6 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white rounded-3xl font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                                {loading ? <RefreshCw className="animate-spin" size={14} /> : <KeyRound size={14} className="group-hover:rotate-45 transition-transform" />}
                                            </div>
                                            Send Code
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            )}
                        </div>

                        {(loginMode === 'password' || otpSent) && (
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-6 bg-white text-slate-950 rounded-3xl font-black text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-[0_24px_60px_-12px_rgba(255,255,255,0.2)] hover:shadow-[0_32px_80px_-12px_rgba(255,255,255,0.3)] hover:-translate-y-1 active:scale-[0.97] active:translate-y-0 disabled:opacity-50 group"
                            >
                                {loading ? <RefreshCw className="animate-spin" size={18} /> : <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />}
                                Sign In
                            </button>
                        )}
                    </form>

                    <div className="mt-12 flex flex-col items-center gap-8">
                        <div className="flex items-center gap-4 w-full opacity-30">
                            <div className="h-[1px] flex-1 bg-white" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em]">Auth</span>
                            <div className="h-[1px] flex-1 bg-white" />
                        </div>

                        <button
                            onClick={onNavigateSignup}
                            className="group flex flex-col items-center gap-2"
                        >
                            <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Don't have an account?</span>
                            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-[0.2em] border-b border-white/0 group-hover:border-indigo-500 transition-all pb-0.5">
                                Create Account <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

