import React from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { motion, AnimatePresence } from 'framer-motion';

export default function InstallButton({ isMobile }) {
  const { isInstallable, promptInstall, isTooltipVisible, isIOS, isAndroid } = usePWAInstall();

  if (!isInstallable) return null;

  return (
    <div className="relative flex items-center">
      <motion.button
        whileHover={{ scale: 1.05, translateY: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={promptInstall}
        className={`
          flex items-center gap-2 font-black transition-all duration-300
          bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600
          text-white shadow-[0_8px_20px_rgba(79,70,229,0.3)]
          hover:shadow-[0_12px_30px_rgba(79,70,229,0.5)]
          border border-white/20
          ${isMobile 
            ? 'px-4 py-2 rounded-full text-xs uppercase tracking-wider' 
            : 'px-6 py-2.5 rounded-xl text-sm uppercase tracking-widest'}
        `}
      >
        <Download size={isMobile ? 16 : 18} strokeWidth={3} className="animate-bounce-subtle" />
        <span>Get App</span>
      </motion.button>

      <AnimatePresence>
        {isTooltipVisible && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full right-0 mt-3 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl z-50 text-white text-sm"
            style={{ width: isMobile ? 'min(85vw, 220px)' : '240px' }}
          >
            <div className="flex flex-col gap-2 text-center pointer-events-none">
              {isIOS ? (
                <p>To install, tap <span className="text-indigo-400 font-bold">Share</span> below then <span className="text-indigo-400 font-bold">Add to Home Screen</span></p>
              ) : isAndroid ? (
                <p>To install, tap the <span className="text-indigo-400 font-bold">Three Dots ⋮</span> menu and select <span className="text-indigo-400 font-bold">Install App</span></p>
              ) : (
                <p>To install, click the <span className="text-indigo-400 font-bold">Install App</span> icon in your address bar</p>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute -top-1.5 right-4 w-3 h-3 bg-slate-900 border-l border-t border-white/10 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
