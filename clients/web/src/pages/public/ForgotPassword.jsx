import React, { useState } from 'react';
import { Mail, ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setSent(true);
            setLoading(false);
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2"></div>

            <div className="max-w-md w-full bg-white/80 backdrop-blur-3xl border border-slate-200 rounded-[40px] p-10 md:p-12 shadow-2xl relative z-10 transition-all duration-500">
                {!sent ? (
                    <>
                        <button onClick={() => navigate('/login')} className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors mb-10 text-xs font-black uppercase tracking-widest">
                            <ArrowLeft size={16} /> Back to Sign In
                        </button>

                        <div className="mb-10">
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">Password Recovery</h1>
                            <p className="text-slate-500 mt-2 font-medium">Enter your email and we'll send you a rescue link.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Email Address</label>
                                <div className="relative group">
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 group-hover:border-indigo-400 rounded-2xl px-5 py-4 pl-12 focus:ring-4 focus:ring-indigo-500/10 outline-none text-slate-800 font-bold transition-all"
                                        placeholder="johndoe@example.com"
                                    />
                                    <Mail className="absolute left-4 top-4 text-slate-400 group-hover:text-indigo-500 transition-colors" size={20} />
                                </div>
                            </div>

                            <button
                                disabled={loading}
                                className="w-full py-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                            >
                                {loading ? 'Sending...' : <>Send Recovery Link <Send size={18} /></>}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="text-center py-6 animate-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-emerald-200 shadow-lg">
                            <CheckCircle size={40} />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 mb-3">Email Sent!</h2>
                        <p className="text-slate-500 mb-10 leading-relaxed font-medium">
                            We've sent a recovery link to <span className="text-indigo-600 font-bold">{email}</span>. Please check your inbox (and spam folder).
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full py-5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-2xl font-black transition-all active:scale-95"
                        >
                            Return to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
