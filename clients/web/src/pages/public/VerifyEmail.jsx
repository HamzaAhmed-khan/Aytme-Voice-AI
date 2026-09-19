import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { CheckCircle2, XCircle, Loader2, ArrowRight, ShieldCheck, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VerifyEmail() {
    const [status, setStatus] = useState('loading'); // loading, success, error
    const [message, setMessage] = useState('Verifying your account...');
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');

        if (!token) {
            setStatus('error');
            setMessage('Verification token is missing.');
            return;
        }

        const verify = async () => {
            try {
                await authService.verifyEmail(token);
                setStatus('success');
                setMessage('Your email has been successfully verified.');
            } catch (err) {
                setStatus('error');
                setMessage(err.response?.data?.detail || 'Email verification failed. The link may have expired.');
            }
        };

        verify();
    }, [location]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white/80 backdrop-blur-3xl border border-slate-200 rounded-[48px] p-12 text-center relative z-10 shadow-2xl"
            >
                <div className="flex justify-center mb-8">
                    <div className="w-20 h-20 rounded-[32px] bg-indigo-50 flex items-center justify-center border border-indigo-200 shadow-lg">
                        <AnimatePresence mode="wait">
                            {status === 'loading' && (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                >
                                    <Loader2 className="text-indigo-500 animate-spin" size={40} />
                                </motion.div>
                            )}
                            {status === 'success' && (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                >
                                    <CheckCircle2 className="text-emerald-500" size={40} />
                                </motion.div>
                            )}
                            {status === 'error' && (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                >
                                    <XCircle className="text-rose-500" size={40} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <h1 className="text-3xl font-black italic tracking-tighter mb-4 uppercase text-slate-800">
                    {status === 'loading' ? 'Authenticating' : status === 'success' ? 'Link Established' : 'Access Denied'}
                </h1>

                <p className="text-slate-500 font-medium leading-relaxed mb-10">
                    {message}
                </p>

                <div className="space-y-4">
                    {status === 'success' ? (
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
                        >
                            Log in to Dashboard <ArrowRight size={16} />
                        </button>
                    ) : status === 'error' ? (
                        <>
                            <button
                                onClick={() => navigate('/signup')}
                                className="w-full py-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border border-slate-200"
                            >
                                Back to Signup
                            </button>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Need help? <Link to="/support" className="text-indigo-500 hover:underline">Contact Support</Link>
                            </p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 opacity-50">
                            <ShieldCheck size={20} className="text-indigo-500" />
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-500">Secure AI Verification</span>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Footer logo/branding */}
            <div className="mt-12 flex items-center gap-3 opacity-30 z-10">
                <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
                    <span className="text-white font-black text-sm italic">A</span>
                </div>
                <span className="text-xs font-black uppercase tracking-[0.4em] text-slate-600">AYTME CORE</span>
            </div>
        </div>
    );
}
