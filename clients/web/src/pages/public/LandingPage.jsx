import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Activity, Shield, Zap, Globe,
    ArrowRight, MessageSquare, Headphones, BarChart3,
    CheckCircle2, Play, ChevronRight, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: '4.99',
        desc: 'Perfect for getting started with audio conferencing.',
        features: ['250 minutes included', '2 active rooms', '24h transcript retention', 'Audio only', 'Community support']
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '9.99',
        popular: true,
        desc: 'Best for growing teams with video and conversations.',
        features: ['1,000 minutes included', '10 active rooms', '30 days transcript retention', 'Video & conversations', 'Priority support']
    },
    {
        id: 'premium',
        name: 'Premium',
        price: '19.99',
        desc: 'Full features for enterprises including broadcast.',
        features: ['3,000 minutes included', '50 active rooms', '90 days retention', 'Broadcast & full features', 'Dedicated support']
    }
];

export default function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden selection:bg-indigo-500/30 font-sans">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Activity className="text-white w-6 h-6" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter uppercase italic">AYTME</span>
                    </div>

                    <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#preview" className="hover:text-white transition-colors">Product</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-4">
                            <Link to="/login" className="px-5 py-2 text-sm font-semibold hover:text-indigo-400 transition-colors">
                                Login
                            </Link>
                            <Link to="/signup" className="px-6 py-2.5 bg-white text-black text-sm font-bold rounded-full transition-all active:scale-95">
                                Join
                            </Link>
                        </div>
                        
                        {/* Hamburger Button */}
                        <button 
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="lg:hidden p-2 text-white/70 hover:text-white bg-white/5 rounded-xl border border-white/10"
                        >
                            {mobileMenuOpen ? <X size={24} /> : <BarChart3 size={24} className="rotate-90" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Panel */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="lg:hidden bg-slate-900 border-b border-white/5 overflow-hidden"
                        >
                            <div className="p-6 flex flex-col gap-6 text-lg font-bold">
                                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">Features</a>
                                <a href="#preview" onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">Product</a>
                                <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">Pricing</a>
                                <hr className="border-white/5" />
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <Link to="/login" className="v2-btn-secondary text-center py-4">Login</Link>
                                    <Link to="/signup" className="v2-btn text-center py-4 bg-white text-black font-black">Join Free</Link>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-48 pb-32 px-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full pointer-events-none">
                    <div className="absolute top-40 left-10 w-72 h-72 bg-indigo-500/20 rounded-full blur-[120px] animate-pulse"></div>
                    <div className="absolute top-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]"></div>
                </div>

                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
                        <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-ping"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Live AI Real-time Sentiment Analysis</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tight leading-[0.95] md:leading-[0.9] mb-8">
                        BRIDGE THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">LANGUAGE</span> GAP
                    </h1>

                    <p className="text-base md:text-xl text-slate-400 font-medium max-w-2xl mx-auto mb-10 md:mb-12">
                        Real-time AI voice translation for teams and enterprises. Transcribe, translate, and analyze sentiment across any language, instantly.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <Link to="/signup" className="group px-8 py-4 bg-white text-black font-black rounded-2xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 hover:shadow-2xl hover:shadow-white/10">
                            Start Free Trial
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a href="#preview" className="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 font-bold rounded-2xl transition-all flex items-center gap-3">
                            <Play size={18} />
                            Watch Demo
                        </a>
                    </div>
                </div>

                {/* Hero Video Section */}
                <div id="preview" className="max-w-6xl mx-auto mt-24 relative p-4 bg-white/5 border border-white/10 rounded-[32px] overflow-hidden backdrop-blur-3xl group">
                    <div className="aspect-[16/9] bg-slate-900 rounded-[24px] overflow-hidden relative shadow-2xl">
                        <video
                            src="/hero-video.mp4"
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>

                        {/* Floating Labels */}
                        <div className="absolute bottom-8 left-8 p-4 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl animate-in slide-in-from-left-4 duration-1000">
                            <div className="flex items-center gap-3">
                                <Activity className="text-emerald-400 w-5 h-5" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Latency</p>
                                    <p className="text-sm font-bold text-emerald-400">240ms</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Laptop Preview / Product Showcase */}
            <section className="py-24 px-6 bg-slate-950">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full"></div>
                        <img
                            src="/laptop-preview.png"
                            alt="AYTME Dashboard"
                            className="relative z-10 w-full max-w-2xl mx-auto drop-shadow-2xl animate-in fade-in duration-1000"
                        />
                    </div>
                    <div>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-8 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent italic leading-[1.1]">
                            SEAMLESS <br />ADMINISTRATION.
                        </h2>
                        <div className="space-y-6">
                            {[
                                { title: "Organization Scoped", desc: "Manage members, billing, and rooms at scale with enterprise-grade organization controls." },
                                { title: "Real-time Monitoring", desc: "Watch transcripts and sentiment pulses as they happen in every room." },
                                { title: "Analytics & Export", desc: "Detailed usage metrics and one-click export to CSV or JSON formats." }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="mt-1 w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 size={14} className="text-indigo-400" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold mb-1">{item.title}</h4>
                                        <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="py-32 px-6 border-y border-white/5 bg-slate-900/20">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 md:mb-24">
                        <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-6 italic uppercase">Enterprise Power.</h2>
                        <p className="text-slate-400 font-medium max-w-2xl mx-auto text-sm md:text-base">Built for the world's most demanding communication needs with cutting-edge AI processing.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { icon: Zap, title: "Low Latency", desc: "Sub-second translation speed powered by custom worker nodes and OpenAI Realtime." },
                            { icon: Globe, title: "100+ Languages", desc: "Support for all major world languages with dialect-specific accuracy and prosody." },
                            { icon: Shield, title: "Enterprise Security", desc: "End-to-end encryption, SSO, and granular RBAC controls for your data." },
                            { icon: MessageSquare, title: "Sentiment Pulse", desc: "Real-time emotional tracking to gauge dialogue effectiveness and team morale." },
                            { icon: Headphones, title: "High Fidelity", desc: "Crystal clear audio synthesis with emotive prosody and natural voice profiles." },
                            { icon: BarChart3, title: "Usage Analytics", desc: "Deep insights into communication volume, resource usage, and platform efficiency." }
                        ].map((f, i) => (
                            <div key={i} className="group p-8 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-indigo-500/5 hover:border-indigo-500/20 transition-all hover:-translate-y-1">
                                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors text-indigo-400">
                                    <f.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-32 px-6 relative">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6 uppercase italic">Simple Pricing.</h2>
                        <p className="text-slate-400 font-medium">No hidden fees. Scale as you grow.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {PLANS.map((plan) => (
                            <div
                                key={plan.id}
                                className={`relative p-8 rounded-3xl border transition-all flex flex-col ${plan.popular
                                        ? 'bg-gradient-to-b from-indigo-500/10 to-transparent border-indigo-500/50 scale-105 z-10 ring-4 ring-indigo-500/20'
                                        : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                                    }`}
                            >
                                {plan.popular && (
                                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                        Most Popular
                                    </span>
                                )}
                                <div className="mb-8">
                                    <h3 className="text-2xl font-black mb-2 uppercase italic tracking-tight">{plan.name}</h3>
                                    <p className="text-slate-400 text-sm font-medium leading-tight h-10">{plan.desc}</p>
                                </div>
                                <div className="mb-8">
                                    <span className="text-5xl font-black italic px-1">${plan.price}</span>
                                    <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">/ month</span>
                                </div>
                                <div className="space-y-4 mb-10 flex-grow">
                                    {plan.features.map((feat, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <CheckCircle2 size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-300">{feat}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setSelectedPlan(plan)}
                                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all active:scale-95 ${plan.popular
                                            ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-xl shadow-indigo-500/25'
                                            : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                                        }`}
                                >
                                    Choose {plan.name}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Plan Details Modal */}
            {selectedPlan && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300">
                        <button
                            onClick={() => setSelectedPlan(null)}
                            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="p-8 pb-0">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-4">
                                <Zap size={12} className="text-indigo-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{selectedPlan.name} Plan</span>
                            </div>
                            <h3 className="text-3xl font-black uppercase italic mb-2">Plan Details</h3>
                            <p className="text-slate-400 font-medium mb-8">Review the full capabilities of the {selectedPlan.name} tier.</p>
                        </div>

                        <div className="p-8 pt-0 space-y-6">
                            <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                                <h4 className="text-sm font-black uppercase tracking-tighter text-slate-500 mb-4 italic">Included Features</h4>
                                <div className="grid grid-cols-1 gap-4">
                                    {selectedPlan.features.map((f, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                            <span className="text-sm font-bold text-slate-200">{f}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <span className="text-sm font-bold text-slate-200">Custom API Access</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <span className="text-sm font-bold text-slate-200">24/7 Monitoring</span>
                                    </div>
                                </div>
                            </div>

                            <Link
                                to={`/signup?plan=${selectedPlan.id}`}
                                className="block w-full py-4 bg-white text-black text-center font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Proceed with {selectedPlan.name}
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* CTA Section */}
            <section className="py-32 px-6">
                <div className="max-w-5xl mx-auto relative p-12 overflow-hidden bg-indigo-600 rounded-[48px] text-center shadow-2xl shadow-indigo-600/25">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-blue-700"></div>
                    <div className="relative z-10">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8 text-white uppercase italic leading-none">
                            Ready to Bridge <br />the GAP?
                        </h2>
                        <Link to="/signup" className="inline-flex items-center gap-3 px-10 py-5 bg-white text-indigo-600 font-black rounded-2xl transition-all hover:scale-105 active:scale-95 hover:shadow-2xl">
                            GET STARTED NOW
                            <ArrowRight size={24} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-16 border-t border-white/5 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <Activity className="text-indigo-500 w-8 h-8" />
                            <span className="text-3xl font-black tracking-tighter uppercase italic">AYTME</span>
                        </div>
                        <p className="text-slate-500 text-sm max-w-xs font-medium">
                            Real-time AI voice translation for the modern, global enterprise.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-12 md:gap-24">
                        <div>
                            <h4 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-6">Product</h4>
                            <div className="flex flex-col gap-4 text-slate-400 text-sm font-medium">
                                <a href="#features" className="hover:text-white transition-colors">Features</a>
                                <a href="#preview" className="hover:text-white transition-colors">Demo</a>
                                <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-6">Legal</h4>
                            <div className="flex flex-col gap-4 text-slate-400 text-sm font-medium">
                                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                                <a href="#" className="hover:text-white transition-colors">Terms</a>
                                <a href="#" className="hover:text-white transition-colors">Security</a>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/5 text-center text-slate-600 text-xs font-bold uppercase tracking-widest">
                    © 2026 Meshed Incorporated. All rights reserved. AYTME is a product of Meshed Inc.
                </div>
            </footer>
        </div>
    );
}
