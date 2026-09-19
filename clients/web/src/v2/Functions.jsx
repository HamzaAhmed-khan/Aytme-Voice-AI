import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Users, Radio, ArrowRight,
  Globe2, Languages, Sparkles, Mic, Zap, ShieldCheck
} from 'lucide-react';

const MODES = [
  {
    icon: MessageSquare,
    title: 'Conversation',
    subtitle: '1-on-1 Translation',
    description: 'This is for two people having a back-and-forth conversation. One person speaks, the app translates, then the other person speaks and the app translates back. This is the easiest mode for two people who want to talk to each other.',
    features: ['Integrated AI Voice', 'Dual-channel captions', 'End-to-end encryption'],
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-200/50',
    hoverBorder: 'hover:border-emerald-400',
    route: '/mode/conversation',
  },
  {
    icon: Users,
    title: 'Talk Together',
    subtitle: 'Group Collaboration',
    description: 'Use one device to one speaker one listener. Take turns speaking and listening. Ideal for asking directions or having a quick and short conversation.',
    features: ['Multi-speaker grid', 'Per-user native captions', 'Meeting transcripts'],
    color: 'text-v2-accent',
    bgColor: 'bg-v2-accent/10',
    borderColor: 'border-v2-accent/20',
    hoverBorder: 'hover:border-v2-accent',
    route: '/mode/group',
  },
  {
    icon: Radio,
    title: 'Broadcast',
    subtitle: 'Global Streaming',
    description: 'This is for one speaker and one or many listeners. The speaker is the only one who talks. The listeners join and only listen to the translated audio. This is best for sermons, lectures, presentations, meetings, and events.',
    features: ['Unlimited listener capacity', 'Edge-rendered subtitles', 'Live audience analytics'],
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-200/50',
    hoverBorder: 'hover:border-rose-400',
    route: '/mode/broadcast',
  },
];

export default function Functions() {
  const navigate = useNavigate();

  return (
    <div className="v2-page space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="max-w-3xl space-y-4">
        <div className="flex items-center gap-2 text-v2-accent font-bold uppercase tracking-[0.2em] text-[10px]">
          <Zap size={12} strokeWidth={3} />
          SaaS Capabilities
        </div>
        <h1 className="text-5xl font-semibold text-v2-text tracking-tighter uppercase">Intelligent Modes</h1>
        <p className="text-v2-muted text-lg font-medium leading-relaxed">
          Select a specialized engine optimized for your specific real-time translation requirements.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {MODES.map((mode) => (
          <div
            key={mode.title}
            onClick={() => navigate(mode.route)}
            className={`v2-card group cursor-pointer border-2 p-10 transition-all duration-500 ${mode.borderColor} ${mode.hoverBorder} hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] flex flex-col`}
          >
            {/* Icon */}
            <div className={`w-16 h-16 rounded-2xl ${mode.bgColor} flex items-center justify-center mb-8 shadow-inner group-hover:rotate-3 transition-transform`}>
              <mode.icon size={32} className={mode.color} />
            </div>

            {/* Badge */}
            <div className={`inline-flex w-fit px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${mode.bgColor} ${mode.color} mb-6`}>
              {mode.subtitle}
            </div>

            {/* Title & Description */}
            <h3 className="text-2xl font-bold text-v2-text mb-4 tracking-tight uppercase group-hover:text-v2-accent transition-colors">
              {mode.title}
            </h3>
            <p className="text-v2-muted text-sm leading-relaxed font-medium mb-8 flex-1">
              {mode.description}
            </p>

            {/* Feature List */}
            <ul className="space-y-4 mb-10 border-t border-v2-border/10 pt-8">
              {mode.features.map(f => (
                <li key={f} className="flex items-center gap-3 text-xs font-bold text-v2-text uppercase tracking-tight opacity-70 group-hover:opacity-100 transition-opacity">
                  <div className={`w-1.5 h-1.5 rounded-full bg-current ${mode.color}`} />
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className={`flex items-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all ${mode.color} group-hover:gap-4`}>
              Load UI <ArrowRight size={16} />
            </div>
          </div>
        ))}
      </div>

      {/* Infrastructure Note */}
      <footer className="v2-card bg-slate-50/50 border-slate-200/50 flex flex-col md:flex-row items-center justify-between p-8 gap-6 mt-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm border border-v2-border/30">
            <ShieldCheck className="text-emerald-500" size={32} />
          </div>
          <div>
            <h4 className="font-bold text-v2-text uppercase tracking-tight">Global Infrastructure</h4>
            <p className="text-xs text-v2-muted font-medium">All modes transition through our high-performance WebRTC & AI pipeline.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="px-5 py-2 rounded-lg bg-white border border-v2-border/40 text-[10px] font-bold text-v2-muted uppercase tracking-widest shadow-sm">
            99.9% Uptime
          </div>
          <div className="px-5 py-2 rounded-lg bg-white border border-v2-border/40 text-[10px] font-bold text-v2-muted uppercase tracking-widest shadow-sm">
            &lt; 300ms Latency
          </div>
        </div>
      </footer>
    </div>
  );
}
