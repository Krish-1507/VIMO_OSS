import { create } from 'zustand';
import api from '../lib/api';

interface BrandProfile {
  id: string;
  name: string;
  industry: string;
  audience: string;
  website?: string;
  toneKeywords: string[];
  examplePosts: string[];
}

interface BrandState {
  profiles: BrandProfile[];
  selectedId: string | null;
  isLoading: boolean;
  fetchProfiles: (force?: boolean) => Promise<void>;
  setSelectedId: (id: string) => void;
  getSelected: () => BrandProfile | null;
}

export const useBrandStore = create<BrandState>((set, get) => ({
  profiles: [],
  selectedId: null,
  isLoading: false,

  fetchProfiles: async (force?: boolean) => {
    if (!force && get().profiles.length > 0) return;
    set({ isLoading: true });
    try {
      const res = await api.get('/api/brand-profiles');
      const profiles = res.data || [];
      const selectedId = profiles.length > 0 ? profiles[0].id : null;
      const savedId = localStorage.getItem('selectedBrandId');
      set({
        profiles,
        selectedId: savedId && profiles.some((p: BrandProfile) => p.id === savedId) ? savedId : selectedId,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setSelectedId: (id: string) => {
    localStorage.setItem('selectedBrandId', id);
    set({ selectedId: id });
  },

  getSelected: () => {
    const state = get();
    return state.profiles.find((p) => p.id === state.selectedId) || null;
  },
}));
