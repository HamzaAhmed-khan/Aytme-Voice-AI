import React from 'react';
import { motion } from 'framer-motion';

export default function Visualizer({ isActive, color = "indigo", barCount = 6 }) {
    const getColor = () => {
        if (color === 'indigo') return 'bg-gradient-to-t from-indigo-500 to-blue-400';
        if (color === 'white') return 'bg-white';
        if (color === 'emerald') return 'bg-gradient-to-t from-emerald-500 to-teal-400';
        return 'bg-slate-500';
    };

    return (
        <div className="flex items-end gap-[3px] h-6 px-2 py-1 rounded-lg bg-black/5">
            {[...Array(barCount)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={isActive ? {
                        height: [4, 16, 8, 20, 6],
                        opacity: [0.6, 1, 0.8, 1, 0.6]
                    } : {
                        height: 2,
                        opacity: 0.3
                    }}
                    transition={{
                        duration: 0.6 + (i * 0.1),
                        repeat: Infinity,
                        delay: i * 0.05,
                        ease: "easeInOut"
                    }}
                    className={`w-[3px] rounded-full shadow-[0_0_8px_rgba(79,70,229,0.2)] ${getColor()}`}
                />
            ))}
        </div>
    );
}
