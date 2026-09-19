import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
    { name: 'Feb 1', minutes: 40 },
    { name: 'Feb 5', minutes: 120 },
    { name: 'Feb 10', minutes: 450 },
    { name: 'Feb 15', minutes: 300 },
    { name: 'Feb 20', minutes: 600 },
    { name: 'Feb 22', minutes: 400 },
];

export default function UsageChart() {
    return (
        <div className="h-[200px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                    <XAxis
                        dataKey="name"
                        hide
                    />
                    <YAxis
                        hide
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#fff'
                        }}
                        itemStyle={{ color: '#818cf8' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="minutes"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorMinutes)"
                        strokeWidth={3}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
