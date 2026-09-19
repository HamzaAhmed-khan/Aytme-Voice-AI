import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 Zap, Globe2, Mic, Radio, Users, ArrowRight, CheckCircle2,
 Shield, Sparkles, MessageSquare, Headphones, Volume2,
 ChevronRight, Star, Play, Menu, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import InstallButton from '../components/shared/InstallButton';

const FEATURES = [
 {
  icon: MessageSquare,
  title: 'Conversation Mode',
  description: '1-on-1 private translated conversations with two-way voice processing.',
  color: '#5ce19c',
  route: '/dashboard',
  tag: 'Live',
 },
 {
  icon: Users,
  title: 'Talk Together',
  description: 'Use one device to one speaker one listener. Take turns speaking and listening. Ideal for asking directions or having a quick and short conversation.',
  color: '#60a5fa',
  route: '/dashboard',
  tag: 'Group',
 },
 {
  icon: Radio,
  title: 'Broadcast Mode',
  description: 'One speaker, many listeners. Broadcast your message with live AI translation to any language.',
  color: '#f472b6',
  route: '/dashboard',
  tag: 'Broadcast',
 },
];

const STATS = [
 { value: '50+', label: 'Languages' },
 { value: '<300ms', label: 'Latency' },
 { value: '99.9%', label: 'Uptime' },
 { value: '24/7', label: 'Support' },
];

const TESTIMONIALS = [
 { name: 'Sarah Chen', role: 'VP Global Ops, TechForge', text: 'AYTME eliminated our language barriers overnight. Conference calls with our Tokyo office are seamless now.' },
 { name: 'Marco Rossi', role: 'CEO, EuroConnect', text: 'The translation quality is remarkable. It feels like everyone in the room speaks the same language.' },
 { name: 'Priya Sharma', role: 'Head of L&D, GlobalEd', text: 'We use AYTME for all our training sessions. Trainers speak once, and learners hear it in their language instantly.' },
];

export default function LandingPageV2() {
 const navigate = useNavigate();
 const [activeFeature, setActiveFeature] = useState(0);
 const [isVisible, setIsVisible] = useState(false);
 const [isMobile, setIsMobile] = useState(window.innerWidth < 800);
 const [menuOpen, setMenuOpen] = useState(false);

 useEffect(() => {
  const handleResize = () => setIsMobile(window.innerWidth < 800);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
 }, []);

 useEffect(() => {
  setIsVisible(true);
  const interval = setInterval(() => {
   setActiveFeature(prev => (prev + 1) % FEATURES.length);
  }, 4000);
  return () => clearInterval(interval);
 }, []);

 return (
  <div className="v2-app" style={{ 
   background: 'var(--v2-bg)', 
   width: '100%', 
   overflowX: 'hidden',
   boxSizing: 'border-box',
   position: 'relative'
  }}>
   {/* ── Navigation ─────────────────────────────────────── */}
   <nav style={{
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(250, 255, 243, 0.95)', backdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--v2-border)',
    padding: isMobile ? '1rem 1.25rem' : '1.25rem 2rem',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{ 
     maxWidth: 1200, margin: '0 auto', 
     display: 'flex', justifyContent: 'space-between', alignItems: 'center',
     width: '100%', boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
       <div style={{
        maxWidth: isMobile ? '130px' : '180px',
        maxHeight: isMobile ? '36px' : '48px',
        width: 'auto',
        height: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden',
        marginRight: '2rem'
       }}>
        <img 
          src="/logo.png" 
          alt="AYTME" 
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left' }} 
        />
       </div>
      </div>

     {isMobile ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
       <InstallButton isMobile={true} />
       <button 
        onClick={() => setMenuOpen(!menuOpen)} 
        style={{ background: 'none', border: 'none', color: 'var(--v2-text)', cursor: 'pointer', padding: 4 }}
       >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
       </button>
      </div>
     ) : (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
       <InstallButton isMobile={false} />
       <button
        onClick={() => navigate('/login')}
        style={{
         padding: '0.65rem 1.5rem', borderRadius: 12, fontWeight: 600,
         border: '1px solid var(--v2-border)', background: 'white',
         cursor: 'pointer', transition: 'all 0.2s'
        }}
       >
        Sign In
       </button>
       <button
        onClick={() => navigate('/signup')}
        className="v2-btn"
        style={{ padding: '0.65rem 1.75rem', display: 'flex', alignItems: 'center', gap: 8 }}
       >
        Get Started <ArrowRight size={16} />
       </button>
      </div>
     )}
    </div>

    {/* Mobile Dropdown */}
    <AnimatePresence>
     {isMobile && menuOpen && (
      <motion.div
       initial={{ opacity: 0, height: 0 }}
       animate={{ opacity: 1, height: 'auto' }}
       exit={{ opacity: 0, height: 0 }}
       style={{ overflow: 'hidden', background: 'white', borderTop: '1px solid var(--v2-border)' }}
      >
       <div style={{ padding: '2rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
         onClick={() => { navigate('/login'); setMenuOpen(false); }}
         style={{
          width: '100%', padding: '1rem', borderRadius: 16, fontWeight: 700,
          border: '1px solid var(--v2-border)', background: 'white',
          cursor: 'pointer'
         }}
        >
         Sign In
        </button>
        <button
         onClick={() => { navigate('/signup'); setMenuOpen(false); }}
         className="v2-btn"
         style={{ 
          width: '100%', padding: '1.1rem', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 8 
         }}
        >
         Get Started <ArrowRight size={18} />
        </button>
       </div>
      </motion.div>
     )}
    </AnimatePresence>
   </nav>

   {/* ── Hero Section ───────────────────────────────────── */}
   <section style={{
    maxWidth: 1200, margin: '0 auto', 
    padding: isMobile ? '4rem 1.25rem 3rem' : '6rem 2rem 5rem',
    textAlign: 'center',
    opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
    transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{
     display: 'inline-flex', alignItems: 'center', gap: 8,
     padding: '0.4rem 1.25rem', borderRadius: 999,
     background: 'var(--v2-header)', border: '1px solid var(--v2-border)',
     fontSize: isMobile ? 11 : 13, fontWeight: 700, color: 'var(--v2-accent)',
     marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em'
    }}>
     <Sparkles size={14} fill="currentColor" />
     AI-Powered Real-Time Translation
    </div>

    <h1 style={{
     fontSize: isMobile ? '2.5rem' : 'clamp(2.5rem, 6vw, 4.5rem)', 
     fontWeight: 900,
     lineHeight: 1.1, letterSpacing: '-0.04em',
     color: 'var(--v2-text)', maxWidth: 900, margin: '0 auto 1.5rem',
    }}>
     Break Language{' '}
     <span style={{
      background: 'linear-gradient(135deg, var(--v2-accent), #3b82f6)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
     }}>
      Barrier
     </span>
    </h1>

    <p style={{
     fontSize: isMobile ? '1rem' : 'clamp(1rem, 2vw, 1.25rem)',
     color: 'var(--v2-text-muted)', maxWidth: 640, margin: '0 auto 2.5rem',
     lineHeight: 1.6
    }}>
     Speak in your language. Be understood everywhere. AYTME translates voice
     in real-time with near-zero latency — for conversations, meetings, and broadcasts.
    </p>

    <div style={{ 
     display: 'flex', gap: 16, justifyContent: 'center', 
     flexDirection: isMobile ? 'column' : 'row',
     marginBottom: '3.5rem' 
    }}>
     <button
      onClick={() => navigate('/signup')}
      className="v2-btn"
      style={{
       padding: '1.25rem 2.5rem', fontSize: 16, borderRadius: 16,
       display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 10,
       boxShadow: '0 8px 32px rgba(92, 225, 156, 0.3)'
      }}
     >
      Start Free — 30 Days <ArrowRight size={18} />
     </button>
     {!isMobile && (
      <button
       onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
       style={{
        padding: '1.1rem 2rem', fontSize: 16, borderRadius: 16,
        fontWeight: 600, border: '1px solid var(--v2-border)',
        background: 'white', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'all 0.2s'
       }}
      >
       <Play size={16} fill="var(--v2-accent)" style={{ color: 'var(--v2-accent)' }} />
       See How It Works
      </button>
     )}
    </div>

    {/* Stats Row */}
    <div style={{
     display: 'grid', 
     gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', 
     gap: isMobile ? 16 : 24,
     maxWidth: 700, margin: '0 auto',
     padding: isMobile ? '2rem 1rem' : '2.5rem', borderRadius: 24,
     background: 'white', border: '1px solid var(--v2-border)',
     width: '100%', boxSizing: 'border-box'
    }}>
     {STATS.map(s => (
      <div key={s.label} style={{ textAlign: 'center' }}>
       <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: 'var(--v2-text)', letterSpacing: '-0.03em' }}>{s.value}</div>
       <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--v2-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
      </div>
     ))}
    </div>
   </section>

   {/* ── Features / Functions ────────────────────────────── */}
   <section id="features" style={{ 
    maxWidth: 1200, margin: '0 auto', 
    padding: isMobile ? '3rem 1.25rem' : '5rem 2rem',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
     <h2 style={{ fontSize: isMobile ? '2rem' : 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>
      Three Powerful Modes
     </h2>
     <p style={{ color: 'var(--v2-text-muted)', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
      Choose the right mode for every scenario — from 1:1 calls to global broadcasts.
     </p>
    </div>

    <div style={{ 
     display: 'grid', 
     gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
     gap: isMobile ? 16 : 24,
     width: '100%', boxSizing: 'border-box'
    }}>
     {FEATURES.map((f, i) => (
      <div
       key={f.title}
       onMouseEnter={() => setActiveFeature(i)}
       style={{
        background: 'white',
        border: `2px solid ${activeFeature === i ? f.color : 'var(--v2-border)'}`,
        borderRadius: 24, padding: isMobile ? '2rem 1.5rem' : '2.5rem 2rem',
        cursor: 'pointer',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: (!isMobile && activeFeature === i) ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: activeFeature === i ? `0 12px 40px ${f.color}22` : 'none',
       }}
      >
       <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: `${f.color}15`, display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        transition: 'all 0.3s'
       }}>
        <f.icon size={28} style={{ color: f.color }} />
       </div>
       <div style={{
        display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: 999,
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.15em', background: `${f.color}15`, color: f.color,
        marginBottom: 12
       }}>
        {f.tag}
       </div>
       <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>{f.title}</h3>
       <p style={{ color: 'var(--v2-text-muted)', lineHeight: 1.6, fontSize: 15, marginBottom: 16 }}>
        {f.description}
       </p>
       <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: f.color, fontWeight: 700, fontSize: 14 }}>
        Explore <ChevronRight size={16} />
       </div>
      </div>
     ))}
    </div>
   </section>

   {/* ── Pricing Section ─────────────────────────────────── */}
   <section id="pricing" style={{
    maxWidth: 1200, margin: '0 auto', 
    padding: isMobile ? '3rem 1.25rem' : '5rem 2rem',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
     <h2 style={{ fontSize: isMobile ? '2rem' : 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>
      Simple, Fair Pricing
     </h2>
     <p style={{ color: 'var(--v2-text-muted)', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
      One plan. Infinite possibilities. First month is on us.
     </p>
    </div>

    <div style={{
     maxWidth: 440, margin: '0 auto',
     background: 'white', borderRadius: 32,
     border: '2px solid var(--v2-accent)',
     padding: isMobile ? '2.5rem 1.5rem' : '3.5rem 2.5rem', textAlign: 'center',
     boxShadow: '0 16px 64px rgba(92, 225, 156, 0.15)',
     position: 'relative', overflow: 'hidden',
     width: '100%', boxSizing: 'border-box'
    }}>
     <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: 4, background: 'linear-gradient(90deg, var(--v2-accent), #3b82f6)'
     }} />
     <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '0.35rem 1rem', borderRadius: 999,
      background: 'var(--v2-header)', border: '1px solid var(--v2-accent)',
      fontSize: 11, fontWeight: 800, color: 'var(--v2-accent)',
      textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20
     }}>
      <Star size={12} fill="currentColor" /> Premium Access
     </div>

     <h3 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4, letterSpacing: '-0.03em' }}>AYTME Alpha</h3>

     <div style={{ marginBottom: 20 }}>
      <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em' }}>$4.99</span>
      <span style={{ fontSize: 16, color: 'var(--v2-text-muted)', fontWeight: 600 }}>/mo</span>
     </div>

     <div style={{
      padding: '0.8rem 1rem', borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(92,225,156,0.1), rgba(59,130,246,0.1))',
      fontSize: 14, fontWeight: 700, color: 'var(--v2-accent)',
      marginBottom: 28,
     }}>
      🎉 30-Day Free Trial Included
     </div>

     <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', marginBottom: 28 }}>
      {[
       'Unlimited translation minutes',
       'Access all 50 languages',
       'All 3 conferencing modes',
       'Real-time captions & text',
       'Meeting history & history',
       'Priority AI processing',
      ].map(item => (
       <li key={item} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0.7rem 0', borderBottom: '1px solid #f0f4ee',
        fontSize: 14, fontWeight: 500
       }}>
        <CheckCircle2 size={16} style={{ color: 'var(--v2-accent)', flexShrink: 0 }} />
        {item}
       </li>
      ))}
     </ul>

     <button
      onClick={() => navigate('/signup')}
      className="v2-btn"
      style={{
       width: '100%', padding: '1.1rem', fontSize: 16, borderRadius: 16,
       boxShadow: '0 6px 24px rgba(92, 225, 156, 0.3)',
       display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 8
      }}
     >
      Claim Free Month <ArrowRight size={18} />
     </button>
     <p style={{ fontSize: 11, color: 'var(--v2-text-muted)', marginTop: 14, fontWeight: 600 }}>
      No credit card required to start
     </p>
    </div>
   </section>

   {/* ── Testimonials ────────────────────────────────────── */}
   <section style={{ 
    maxWidth: 1200, margin: '0 auto', 
    padding: isMobile ? '3rem 1.25rem' : '5rem 2rem',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
     <h2 style={{ fontSize: isMobile ? '2rem' : 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>
      Global Recognition
     </h2>
    </div>

    <div style={{ 
     display: 'grid', 
     gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
     gap: 20,
     width: '100%', boxSizing: 'border-box'
    }}>
     {TESTIMONIALS.map(t => (
      <div key={t.name} className="v2-card" style={{ padding: '2rem' }}>
       <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[1,2,3,4,5].map(s => <Star key={s} size={16} fill="#fbbf24" style={{ color: '#fbbf24' }} />)}
       </div>
       <p style={{ color: 'var(--v2-text)', lineHeight: 1.7, marginBottom: 20, fontSize: 14 }}>
        "{t.text}"
       </p>
       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
         width: 40, height: 40, borderRadius: 12,
         background: 'var(--v2-header)', display: 'flex',
         alignItems: 'center', justifyContent: 'center',
         fontWeight: 800, fontSize: 14, color: 'var(--v2-accent)'
        }}>
         {t.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
         <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
         <div style={{ fontSize: 12, color: 'var(--v2-text-muted)' }}>{t.role}</div>
        </div>
       </div>
      </div>
     ))}
    </div>
   </section>

   {/* ── CTA Section ─────────────────────────────────────── */}
   <section style={{
    maxWidth: 1200, margin: '0 auto', 
    padding: isMobile ? '2rem 1.25rem 4rem' : '3rem 2rem 5rem',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{
     background: 'linear-gradient(135deg, #1a202c, #2d3748)',
     borderRadius: 32, padding: isMobile ? '3.5rem 1.5rem' : '5rem 4rem',
     textAlign: 'center', position: 'relative', overflow: 'hidden'
    }}>
     <div style={{
      position: 'absolute', top: -100, right: -100,
      width: 300, height: 300, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(92,225,156,0.15), transparent)',
     }} />
     <h2 style={{
      fontSize: isMobile ? '1.75rem' : 'clamp(1.75rem, 4vw, 2.75rem)', 
      fontWeight: 900,
      letterSpacing: '-0.03em', color: 'white', marginBottom: 16
     }}>
      Join the Communication Revolution
     </h2>
     <p style={{ color: '#a0aec0', fontSize: 16, maxWidth: 500, margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
      Experience seamless multilingual conversations in minutes.
     </p>
     <button
      onClick={() => navigate('/signup')}
      className="v2-btn"
      style={{
       padding: '1.25rem 3rem', fontSize: 16, borderRadius: 16,
       display: 'inline-flex', alignItems: 'center', gap: 10,
       boxShadow: '0 8px 32px rgba(92, 225, 156, 0.3)'
      }}
     >
      Get Started Now <ArrowRight size={18} />
     </button>
    </div>
   </section>

   {/* ── Footer ──────────────────────────────────────────── */}
   <footer style={{
    borderTop: '1px solid var(--v2-border)',
    padding: '3rem 1.25rem', textAlign: 'center',
    width: '100%', boxSizing: 'border-box'
   }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 8, marginBottom: 12 }}>
      <img src="/logo.png" alt="AYTME Logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
      <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.03em' }}>AYTME</span>
     </div>
     <p style={{ fontSize: 13, color: 'var(--v2-text-muted)', marginBottom: 8, fontWeight: 500 }}>
      Artificial Intelligence for Real-time Interpretation.
     </p>
     <p style={{ fontSize: 11, color: 'var(--v2-text-muted)', opacity: 0.8 }}>
      © {new Date().getFullYear()} AYTME. Crafted for global connection.
     </p>
    </div>
   </footer>
  </div>
 );
}
