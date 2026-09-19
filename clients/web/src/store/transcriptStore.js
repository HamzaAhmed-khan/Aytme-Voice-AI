import { create } from 'zustand';

export const useTranscriptStore = create((set) => ({
    transcripts: [], // Historical transcripts
    liveTranscripts: [], // Streaming transcripts in conference

    setTranscripts: (transcripts) => set({ transcripts }),

    addLiveTranscript: (line) => set((state) => {
        const index = state.liveTranscripts.findIndex(t => t.id === line.id);
        if (index !== -1) {
            const updated = [...state.liveTranscripts];
            updated[index] = { ...updated[index], ...line };
            return { liveTranscripts: updated };
        }
        return { liveTranscripts: [...state.liveTranscripts, line].slice(-100) };
    }),

    clearLiveTranscripts: () => set({ liveTranscripts: [] })
}));
