import { create } from 'zustand';
import api from '../lib/api';

interface OnboardingState {
  isComplete: boolean;
  currentStep: number;
  completedSteps: string[];
  isLoading: boolean;
  nextStep: () => void;
  prevStep: () => void;
  completeStep: (name: string) => Promise<void>;
  finishOnboarding: () => void;
  resetOnboarding: () => Promise<void>;
  loadStatus: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isComplete: false,
  currentStep: 0,
  completedSteps: [],
  isLoading: true,

  nextStep: () => {
    set((s) => {
      const next = Math.min(s.currentStep + 1, 4);
      return { currentStep: next };
    });
  },

  prevStep: () => {
    set((s) => {
      const prev = Math.max(s.currentStep - 1, 0);
      return { currentStep: prev };
    });
  },

  completeStep: async (name: string) => {
    try {
      const res = await api.post('/api/settings/onboarding/complete-step', { step: name });
      set({
        isComplete: res.data.isComplete,
        currentStep: res.data.currentStep,
        completedSteps: res.data.completedSteps,
      });
    } catch {
      // ignore
    }
  },

  finishOnboarding: () => {
    set({ isComplete: true });
  },

  resetOnboarding: async () => {
    try {
      await api.post('/api/settings/onboarding/reset');
    } catch {
      // ignore
    }
  },

  loadStatus: async () => {
    try {
      const res = await api.get('/api/settings/onboarding');
      set({
        isComplete: res.data.isComplete,
        currentStep: res.data.currentStep,
        completedSteps: res.data.completedSteps,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
