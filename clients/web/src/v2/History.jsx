import React, { useState, useEffect } from 'react';
import { roomService } from '../services/api';
import { History as HistoryIcon, Activity, Video } from 'lucide-react';
import toast from 'react-hot-toast';

export default function History() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await roomService.listRooms();
            setSessions(data || []);
        } catch (error) {
            toast.error('Failed to fetch session history');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="v2-app p-8">
            <header className="v2-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-semibold">Session History</h1>
                    <p className="text-v2-muted">Recent translation and voice sessions</p>
                </div>
            </header>

            <div className="max-w-4xl mx-auto">
                {loading ? (
                    <div className="flex justify-center p-20">
                        <Activity className="animate-spin text-v2-accent" size={32} />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="v2-card text-center py-20">
                        <HistoryIcon className="mx-auto text-v2-border mb-4" size={48} />
                        <p className="text-v2-muted">No session history found.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sessions.map(session => (
                            <div key={session.id} className="v2-card flex justify-between items-center hover:border-v2-accent transition-colors cursor-default group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <Video size={20} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-semibold">{session.name}</p>
                                        <p className="text-v2-muted text-xs">
                                            {session.primary_lang} → {session.secondary_lang}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                    <p className="text-v2-text font-semibold">{session.created_at ? new Date(session.created_at).toLocaleDateString() : 'Active'}</p>
                                    {session.policy?.current_mode && (
                                        <span className="v2-badge text-[10px]">
                                            Mode: {session.policy.current_mode}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
