import { create } from 'zustand';

export const useAgentStore = create((set) => ({
    agentStatus: 'idle', // 'idle' | 'connecting' | 'connected' | 'error'
    currentRoomId: null,
    latency: null,
    workerId: null,
    audioStreaming: false,

    setAgentStatus: (status) => set({ agentStatus: status }),
    setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
    setLatency: (latency) => set({ latency }),
    setWorkerId: (workerId) => set({ workerId }),
    setAudioStreaming: (streaming) => set({ audioStreaming: streaming }),

    resetAgent: () => set({
        agentStatus: 'idle',
        currentRoomId: null,
        latency: null,
        workerId: null,
        audioStreaming: false,
    }),
}));
