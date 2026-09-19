import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, RefreshCw, ChevronRight, Zap, ShieldCheck, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '../services/api';
import toast from 'react-hot-toast';

// Keys for persisting OTP flow state across navigation
const OTP_EMAIL_KEY = 'aytme_otp_email';
const OTP_PENDING_KEY = 'aytme_otp_pending';

function clearOtpState() {
  localStorage.removeItem(OTP_EMAIL_KEY);
  localStorage.removeItem(OTP_PENDING_KEY);
}

export default function Login({ onLogin, onNavigateSignup }) {
 const navigate = useNavigate();
 const location = useLocation();

 // Restore OTP flow state from localStorage (survives navigation)
 const savedEmail = localStorage.getItem(OTP_EMAIL_KEY) || '';
 const savedOtpPending = localStorage.getItem(OTP_PENDING_KEY) === 'true';

 const [email, setEmail] = useState(savedEmail || '');
 const [password, setPassword] = useState('');
 const [loading, setLoading] = useState(false);

 // OTP state
 const [otpStep, setOtpStep] = useState(savedOtpPending);
 const [otp, setOtp] = useState(['', '', '', '', '', '']);
 const [otpLoading, setOtpLoading] = useState(false);
 const [otpError, setOtpError] = useState('');
 const [resending, setResending] = useState(false);
 const otpRefs = useRef([]);

 const rawReturnTo = new URLSearchParams(location.search).get('returnTo');
 const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
	 ? rawReturnTo
	 : '/dashboard';

 // Focus first OTP input when entering OTP step
 useEffect(() => {
   if (otpStep) {
     setTimeout(() => otpRefs.current[0]?.focus(), 200);
   }
 }, [otpStep]);

 const handleLogin = async (e) => {
 e.preventDefault();
 setLoading(true);
 try {
   // Validate credentials WITHOUT storing token
   // Token is only stored after OTP verification (loginOtp)
   await authService.validateCredentials(email, password);

   // Credentials valid — now request OTP
   try {
     await authService.requestOtp(email);
     toast.success('Verification code sent to your email');
     // Persist OTP flow state so it survives navigation
     localStorage.setItem(OTP_EMAIL_KEY, email);
     localStorage.setItem(OTP_PENDING_KEY, 'true');
     setOtpStep(true);
     setOtpError('');
     setOtp(['', '', '', '', '', '']);
   } catch (otpErr) {
     console.error('[Login] OTP request failed:', otpErr);
     toast.error('Failed to send verification code. Please try again.');
   }
 } catch (err) {
   toast.error(err.response?.data?.detail || 'Login failed');
 } finally {
   setLoading(false);
 }
 };

 const handleOtpChange = (index, value) => {
   const digit = value.replace(/\D/g, '').slice(-1);
   const newOtp = [...otp];
   newOtp[index] = digit;
   setOtp(newOtp);
   setOtpError('');

   if (digit && index < 5) {
     otpRefs.current[index + 1]?.focus();
   }

   // Auto-submit when all 6 digits filled
   if (digit && index === 5 && newOtp.every(d => d !== '')) {
     verifyOtp(newOtp.join(''));
   }
 };

 const handleOtpKeyDown = (index, e) => {
   if (e.key === 'Backspace' && !otp[index] && index > 0) {
     otpRefs.current[index - 1]?.focus();
   }
 };

 const handleOtpPaste = (e) => {
   const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
   if (pasted.length === 6) {
     const newOtp = pasted.split('');
     setOtp(newOtp);
     otpRefs.current[5]?.focus();
     verifyOtp(pasted);
     e.preventDefault();
   }
 };

 // Use the persisted email from localStorage (survives navigation)
 const otpEmail = localStorage.getItem(OTP_EMAIL_KEY) || email;

 const verifyOtp = async (code) => {
   setOtpLoading(true);
   setOtpError('');
   try {
     // loginOtp stores the token in localStorage on success
     await authService.loginOtp(otpEmail, code);
     // Clean up OTP flow state
     clearOtpState();
     toast.success('Welcome to Aytme V2');
     if (onLogin) onLogin(returnTo);
     else navigate(returnTo);
   } catch (err) {
     const status = err.response?.status;
     if (status === 410) {
       setOtpError('Code expired. Please request a new one.');
     } else if (status === 429) {
       setOtpError('Too many attempts. Please wait and try again.');
     } else {
       setOtpError('Incorrect code. Please check and try again.');
     }
     setOtp(['', '', '', '', '', '']);
     setTimeout(() => otpRefs.current[0]?.focus(), 100);
   } finally {
     setOtpLoading(false);
   }
 };

 const handleResendOtp = async () => {
   setResending(true);
   try {
     await authService.requestOtp(otpEmail);
     toast.success('New verification code sent');
     setOtpError('');
     setOtp(['', '', '', '', '', '']);
     setTimeout(() => otpRefs.current[0]?.focus(), 100);
   } catch (err) {
     toast.error('Failed to resend code');
   } finally {
     setResending(false);
   }
 };

 return (
 <div className="v2-app min-h-screen flex flex-col lg:flex-row">
 {/* Branding Panel */}
 <div className="hidden lg:flex flex-col justify-between w-1/2 p-24 bg-v2-header border-r border-v2-border">
  <div className="flex items-center mb-12">
    <div style={{
      maxWidth: '220px',
      maxHeight: '56px',
      width: 'auto',
      height: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden',
    }}>
      <img 
        src="/logo.png" 
        alt="AYTME" 
        style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left' }} 
      />
    </div>
  </div>

 <div className="space-y-4">
 <h1 className="text-[7rem] font-semibold tracking-tighter leading-[0.8] text-v2-text">
 REAL<br />
 <span className="text-v2-accent">TIME</span><br />
 VOICE
 </h1>
 <p className="text-v2-muted text-xl max-w-sm font-medium leading-relaxed">
 Break language barriers with low-latency AI translation.
 V2.0 Engine • High Fidelity
 </p>
 </div>

 <div className="flex gap-12 border-t border-v2-border pt-12">
 <div className="space-y-1">
 <p className="text-v2-text font-semibold text-2xl tracking-tighter ">&lt;300ms</p>
 <p className="text-v2-muted text-[10px] font-bold uppercase tracking-[0.2em]">Latency</p>
 </div>
 <div className="space-y-1">
 <p className="text-v2-text font-semibold text-2xl tracking-tighter ">256-bit</p>
 <p className="text-v2-muted text-[10px] font-bold uppercase tracking-[0.2em]">AES</p>
 </div>
 </div>
 </div>

 {/* Auth Panel */}
 <div className="flex-1 flex items-center justify-center p-8 bg-v2-bg">
 <AnimatePresence mode="wait">
 {!otpStep ? (
 <motion.div 
 key="login-form"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 className="w-full max-w-md v2-card shadow-lg"
 >
 <div className="mb-12">
 <h2 className="text-4xl font-bold mb-2">Sign In</h2>
 <p className="text-v2-muted">Access your translation portal</p>
 </div>

 <form onSubmit={handleLogin} className="space-y-6">
 <div>
 <label htmlFor="loginEmail" className="v2-label">Email Address</label>
 <div className="relative">
 <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
 <input
 id="loginEmail"
 name="email"
 type="email"
 className="v2-input pl-12"
 placeholder="you@example.com"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 required
 />
 </div>
 </div>

 <div>
 <label htmlFor="loginPassword" className="v2-label">Password</label>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
 <input
 id="loginPassword"
 name="password"
 type="password"
 className="v2-input pl-12"
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 />
 </div>
 </div>

 <button
 type="submit"
 disabled={loading}
 className="v2-btn w-full flex items-center justify-center gap-2 py-4 shadow-md hover:shadow-lg transition-all"
 >
 {loading ? <RefreshCw className="animate-spin" size={18} /> : <LogIn size={18} />}
 Sign In
 </button>
 </form>

 <div className="mt-12 text-center">
 <p className="text-v2-muted text-sm mb-4">Don't have an account?</p>
 <button 
 onClick={() => {
	 if (onNavigateSignup) onNavigateSignup(returnTo);
	 else navigate(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
 }}
 className="text-v2-accent font-bold hover:underline inline-flex items-center gap-1"
 >
 Create Account <ChevronRight size={16} />
 </button>
 </div>
 </motion.div>
 ) : (
 /* ── OTP VERIFICATION SCREEN ── */
 <motion.div
 key="otp-form"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 className="w-full max-w-md v2-card shadow-lg"
 >
 <div className="mb-10 text-center">
   <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
     <ShieldCheck size={32} className="text-indigo-600" />
   </div>
   <h2 className="text-3xl font-bold mb-2">Verify Your Identity</h2>
   <p className="text-v2-muted text-sm">
     We've sent a 6-digit verification code to<br />
     <span className="font-bold text-v2-text">{otpEmail}</span>
   </p>
   <p className="text-v2-muted text-xs mt-2 opacity-60">Code expires in 10 minutes</p>
 </div>

 {/* OTP Input */}
 <div className="flex justify-center gap-3 mb-6" onPaste={handleOtpPaste}>
   {otp.map((digit, i) => (
     <input
       key={i}
       ref={el => otpRefs.current[i] = el}
       type="text"
       inputMode="numeric"
       maxLength={1}
       value={digit}
       onChange={e => handleOtpChange(i, e.target.value)}
       onKeyDown={e => handleOtpKeyDown(i, e)}
       className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all
         ${otpError ? 'border-rose-400 bg-rose-50 text-rose-600' : digit ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-v2-border bg-v2-header text-v2-text'}
         focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100`}
       disabled={otpLoading}
     />
   ))}
 </div>

 {/* Error */}
 {otpError && (
   <motion.p 
     initial={{ opacity: 0, y: -5 }} 
     animate={{ opacity: 1, y: 0 }}
     className="text-rose-500 text-sm text-center font-bold mb-4"
   >
     {otpError}
   </motion.p>
 )}

 {/* Submit OTP */}
 <button
   onClick={() => {
     const code = otp.join('');
     if (code.length === 6) verifyOtp(code);
     else setOtpError('Please enter all 6 digits');
   }}
   disabled={otpLoading || otp.some(d => !d)}
   className="v2-btn w-full flex items-center justify-center gap-2 py-4 shadow-md hover:shadow-lg transition-all mb-4"
 >
   {otpLoading ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
   Verify Code
 </button>

{/* Resend + Back */}
 <div className="flex items-center justify-between mt-6">
   <button 
     onClick={() => {
       setOtpStep(false);
       setOtpError('');
       clearOtpState();
     }}
     className="text-v2-muted text-sm font-bold hover:text-v2-text inline-flex items-center gap-1 transition-colors"
   >
     <ArrowLeft size={14} /> Back
   </button>
   <button
     onClick={handleResendOtp}
     disabled={resending}
     className="text-v2-accent text-sm font-bold hover:underline inline-flex items-center gap-1 disabled:opacity-50"
   >
     {resending ? <RefreshCw className="animate-spin" size={14} /> : <Mail size={14} />}
     Resend Code
   </button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>
 );
}
