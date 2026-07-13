import { create } from 'zustand';
import type { VimoSocialConnectionState, SocialPlatform } from './types';
import { vimoSocialService } from './vimoSocialService';
import api from '../lib/api';

interface SocialAccountsStore extends VimoSocialConnectionState {
  setupStep: number;
  selectedAccountIds: string[];
  isSetupOpen: boolean;
  oauthInProgress: boolean;
  connectingPlatform: SocialPlatform | null;

  openSetup: () => void;
  closeSetup: () => void;
  setSetupStep: (step: number) => void;
  toggleAccountSelection: (id: string) => void;
  connectVimoSocial: () => Promise<void>;
  disconnectVimoSocial: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  confirmAccountSelection: () => Promise<void>;
  reconnectAccount: (id: string) => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  connectPlatform: (platform: SocialPlatform) => Promise<void>;
  connectBluesky: (handle: string, appPassword: string) => Promise<void>;
}

export const useSocialAccountsStore = create<SocialAccountsStore>((set, get) => {
  vimoSocialService.subscribe((state) => {
    set({
      isConnected: state.isConnected,
      connectionId: state.connectionId,
      connectedAt: state.connectedAt,
      accounts: state.accounts,
      isLoading: state.isLoading,
      error: state.error,
    });
  });

  vimoSocialService.loadState();

  return {
    ...vimoSocialService.getState(),
    setupStep: 0,
    selectedAccountIds: [],
    isSetupOpen: false,
    oauthInProgress: false,
    connectingPlatform: null,

    openSetup: () => {
      set({ isSetupOpen: true, setupStep: 0, selectedAccountIds: [], error: null });
      vimoSocialService.loadState();
    },

    closeSetup: () => {
      set({ isSetupOpen: false, setupStep: 0 });
      vimoSocialService.cleanup();
    },

    setSetupStep: (step: number) => set({ setupStep: step }),

    toggleAccountSelection: (id: string) => {
      set((state) => {
        const has = state.selectedAccountIds.includes(id);
        return {
          selectedAccountIds: has
            ? state.selectedAccountIds.filter((x) => x !== id)
            : [...state.selectedAccountIds, id],
        };
      });
    },

    connectVimoSocial: async () => {
      set({ setupStep: 2, isLoading: true, error: null });
      try {
        await vimoSocialService.connect();
        const { accounts } = get();
        const connectedAccountIds = accounts.filter((a) => a.isConnected).map((a) => a.id);
        set({
          setupStep: 3,
          isLoading: false,
          selectedAccountIds: connectedAccountIds,
        });
      } catch {
        set({ isLoading: false, error: 'Connection failed. Please try again.' });
      }
    },

    disconnectVimoSocial: async () => {
      await vimoSocialService.disconnect();
      set({ selectedAccountIds: [] });
    },

    refreshAccounts: async () => {
      await vimoSocialService.refreshAccounts();
    },

    confirmAccountSelection: async () => {
      const { selectedAccountIds } = get();
      set({ isLoading: true });
      await vimoSocialService.selectAccounts(selectedAccountIds);
      try {
        // The OAuth / app-password flows have already created the real
        // connectors (with credentials). We only need to register the
        // Social Accounts pack so VIMO knows it can publish/analyze.
        await api.post('/api/packs/install', {
          packId: 'social-accounts',
          packName: 'Social Accounts',
          category: 'social_accounts',
        });
      } catch {
        // best-effort
      }
      set({ setupStep: 4, isLoading: false });
    },

    connectBluesky: async (handle: string, appPassword: string) => {
      set({ oauthInProgress: true, connectingPlatform: 'bluesky' });
      try {
        await api.post('/api/social-accounts/connect-app-password', {
          provider: 'bluesky',
          handle,
          appPassword,
        });
        await vimoSocialService.refreshAccounts();
        set({ setupStep: 3 });
      } catch (err: any) {
        set({ error: err?.response?.data?.error || `Failed to connect Bluesky` });
      }
      set({ oauthInProgress: false, connectingPlatform: null });
    },

    reconnectAccount: async (id: string) => {
      const { accounts } = get();
      const account = accounts.find((a) => a.id === id);
      if (!account) return;

      set({ isLoading: true, connectingPlatform: account.platform });
      try {
        const result = await vimoSocialService.initiateOAuth(account.platform);
        const success = await vimoSocialService.openOAuthPopup(account.platform, result.authUrl, result.connectorId);
        if (success) {
          await vimoSocialService.refreshAccounts();
        }
      } catch {
        // ignore
      }
      set({ isLoading: false, connectingPlatform: null });
    },

    disconnectAccount: async (id: string) => {
      const { accounts } = get();
      const account = accounts.find((a) => a.id === id);
      if (!account) return;

      try {
        await api.post(`/api/social-accounts/disconnect/${account.platform}`, {});
      } catch {
        // best-effort
      }
      set((state) => ({
        accounts: state.accounts.map((a) =>
          a.id === id ? { ...a, isConnected: false, permissions: [] } : a
        ),
      }));
    },

    connectPlatform: async (platform: SocialPlatform) => {
      set({ oauthInProgress: true, connectingPlatform: platform });
      try {
        const result = await vimoSocialService.initiateOAuth(platform);
        if (result.needsSetup) {
          const err = new Error(`Connection needs setup for ${platform}`);
          (err as any).needsSetup = true;
          (err as any).setupGuide = result.setupGuide;
          (err as any).platform = platform;
          set({ oauthInProgress: false, connectingPlatform: null });
          throw err;
        }
        const success = await vimoSocialService.openOAuthPopup(platform, result.authUrl, result.connectorId);
        if (success) {
          await vimoSocialService.refreshAccounts();
          set({ setupStep: 3 });
        }
      } catch (err: any) {
        if (err?.needsSetup) throw err;
        set({ error: `Failed to connect ${platform}` });
      }
      set({ oauthInProgress: false, connectingPlatform: null });
    },
  };
});
