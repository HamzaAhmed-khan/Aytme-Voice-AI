import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, UserPlus, RefreshCw, ChevronRight, Zap, ShieldCheck, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '../services/api';
import toast from 'react-hot-toast';

export default function Signup({ onSignup, onNavigateLogin }) {
 const navigate = useNavigate();
 const location = useLocation();
 const [fullName, setFullName] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [loading, setLoading] = useState(false);

 // OTP state
 const [otpStep, setOtpStep] = useState(false);
 const [otp, setOtp] = useState(['', '', '', '', '', '']);
 const [otpLoading, setOtpLoading] = useState(false);
 const [otpError, setOtpError] = useState('');
 const [resending, setResending] = useState(false);
 const otpRefs = useRef([]);

 const rawReturnTo = new URLSearchParams(location.search).get('returnTo');
 const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
	 ? rawReturnTo
	 : '/dashboard';

 const handleSubmit = async (e) => {
 e.preventDefault();
 setLoading(true);
 try {
 await authService.signup(email, password, fullName);
 await authService.login(email, password);
 // Credentials valid — now request OTP
 try {
   await authService.requestOtp(email);
   toast.success('Verification code sent to your email');
   setOtpStep(true);
   setOtpError('');
   setOtp(['', '', '', '', '', '']);
   setTimeout(() => otpRefs.current[0]?.focus(), 100);
 } catch (otpErr) {
   console.warn('[Signup] OTP request failed, proceeding without OTP:', otpErr);
   // If OTP service unavailable, proceed directly
   toast.success('Account Created! Welcome to Aytme V2');
   if (onSignup) onSignup(returnTo);
   else navigate(returnTo);
 }
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Registration failed');
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

 const verifyOtp = async (code) => {
   setOtpLoading(true);
   setOtpError('');
   try {
     await authService.loginOtp(email, code);
     toast.success('Account Created! Welcome to Aytme V2');
     if (onSignup) onSignup(returnTo);
     else navigate(returnTo);
   } catch (err) {
     setOtpError('Invalid verification code. Please try again.');
     setOtp(['', '', '', '', '', '']);
     setTimeout(() => otpRefs.current[0]?.focus(), 100);
   } finally {
     setOtpLoading(false);
   }
 };

 const handleResendOtp = async () => {
   setResending(true);
   try {
     await authService.requestOtp(email);
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
 NEW<br />
 <span className="text-v2-accent">VOICE</span><br />
 ACCOUNT
 </h1>
 <p className="text-v2-muted text-xl max-w-sm font-medium leading-relaxed">
 Join the future of voice communication.
 Professional grade AI translation.
 </p>
 </div>

<div className="border-t border-v2-border pt-12"></div>
 </div>

 {/* Auth Panel */}
 <div className="flex-1 flex items-center justify-center p-8 bg-v2-bg">
 <AnimatePresence mode="wait">
 {!otpStep ? (
 <motion.div 
 key="signup-form"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 className="w-full max-w-md v2-card shadow-lg"
 >
 <div className="mb-12">
 <h2 className="text-4xl font-bold mb-2">Create Account</h2>
 <p className="text-v2-muted">Join the V2 translation network</p>
 </div>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div>
 <label htmlFor="signupName" className="v2-label">Full Name</label>
 <div className="relative">
 <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
 <input
 id="signupName"
 name="fullName"
 type="text"
 className="v2-input pl-12"
 placeholder="Alex Rivera"
 value={fullName}
 onChange={(e) => setFullName(e.target.value)}
 required
 />
 </div>
 </div>

 <div>
 <label htmlFor="signupEmail" className="v2-label">Email Address</label>
 <div className="relative">
 <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
 <input
 id="signupEmail"
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
 <label htmlFor="signupPassword" className="v2-label">Password</label>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" size={18} />
 <input
 id="signupPassword"
 name="password"
 type="password"
 className="v2-input pl-12"
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 minLength={8}
 />
 </div>
 </div>

 <button
 type="submit"
 disabled={loading}
 className="v2-btn w-full flex items-center justify-center gap-2 py-4 shadow-md hover:shadow-lg transition-all"
 >
 {loading ? <RefreshCw className="animate-spin" size={18} /> : <UserPlus size={18} />}
 Create Account
 </button>
 </form>

 <div className="mt-12 text-center">
 <p className="text-v2-muted text-sm mb-4">Already have an account?</p>
 <button 
 onClick={() => {
	 if (onNavigateLogin) onNavigateLogin(returnTo);
	 else navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
 }}
 className="text-v2-accent font-bold hover:underline inline-flex items-center gap-1"
 >
 Sign In <ChevronRight size={16} />
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
   <h2 className="text-3xl font-bold mb-2">Verify Your Email</h2>
   <p className="text-v2-muted text-sm">
     We've sent a 6-digit verification code to<br />
     <span className="font-bold text-v2-text">{email}</span>
   </p>
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


  {/* Skip OTP (temporary - until email service is configured) */}
  <button
    onClick={() => {
      toast.success('Account Created! Welcome to Aytme V2');
      if (onSignup) onSignup(returnTo);
      else navigate(returnTo);
    }}
    className="w-full text-center text-v2-muted text-sm font-medium hover:text-v2-accent transition-colors py-2 mb-2"
  >
    Skip for now &rarr;
  </button>
 {/* Resend + Back */}
 <div className="flex items-center justify-between mt-6">
   <button 
     onClick={() => {
       setOtpStep(false);
       setOtpError('');
       // Remove stored token since user abandoned OTP
       localStorage.removeItem('token');
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
