import { create } from 'zustand';
import { roomService } from '../services/api';

export const useRoomStore = create((set, get) => ({
    rooms: [],
    activeRoom: null,
    selectedRoom: null,
    roomAnalytics: {},
    isLoading: false,
    error: null,

    setRooms: (updater) => set((state) => ({
        rooms: typeof updater === 'function' ? updater(state.rooms) : updater,
    })),
    setActiveRoom: (room) => set({ activeRoom: room }),
    setSelectedRoom: (room) => set({ selectedRoom: room }),

    fetchRooms: async (orgId) => {
        set({ isLoading: true });
        try {
            const rooms = await roomService.listRooms(orgId);
            set({ rooms: rooms || [], error: null });
            return rooms;
        } catch (err) {
            set({ error: 'Failed to fetch rooms' });
            return [];
        } finally {
            set({ isLoading: false });
        }
    },

    createRoom: async (data) => {
        const room = await roomService.createRoom(data);
        set((state) => ({ rooms: [room, ...state.rooms] }));
        return room;
    },

    updateRoom: async (roomId, data) => {
        const updated = await roomService.updateRoom(roomId, data);
        set((state) => ({
            rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, ...updated } : r)),
        }));
        return updated;
    },

    deleteRoom: async (roomId) => {
        await roomService.deleteRoom(roomId);
        set((state) => ({ rooms: state.rooms.filter((r) => r.id !== roomId) }));
    },
}));
