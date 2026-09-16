import type { SocialAccount, SocialPlatform, VimoSocialConnectionState } from './types';
import api from '../lib/api';

class VimoSocialService {
  private connectionState: VimoSocialConnectionState = {
    isConnected: false,
    accounts: [],
    isLoading: false,
    error: null,
  };

  private listeners: ((state: VimoSocialConnectionState) => void)[] = [];

  private oauthPopups: Map<string, Window | null> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  private notify() {
    this.listeners.forEach((cb) => cb(this.connectionState));
  }

  subscribe(cb: (state: VimoSocialConnectionState) => void) {
    this.listeners.push(cb);
    cb(this.connectionState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  getState(): VimoSocialConnectionState {
    return { ...this.connectionState };
  }

  async loadState(): Promise<void> {
    try {
      const statusRes = await api.get('/api/social-accounts/status');
      if (statusRes.data.isConnected) {
        const accountsRes = await api.get('/api/social-accounts/connected');
        this.connectionState = {
          isConnected: true,
          connectionId: statusRes.data.connectionId,
          connectedAt: statusRes.data.connectedAt,
          accounts: this.mapAccounts(accountsRes.data.accounts || []),
          isLoading: false,
          error: null,
        };
      } else {
        this.connectionState = {
          isConnected: false,
          accounts: [],
          isLoading: false,
          error: null,
        };
      }
      this.notify();
    } catch {
      this.connectionState = {
        ...this.connectionState,
        isLoading: false,
      };
      this.notify();
    }
  }

  async connect(): Promise<void> {
    this.connectionState = { ...this.connectionState, isLoading: true, error: null };
    this.notify();

    try {
      await this.loadState();
      this.connectionState = { ...this.connectionState, isLoading: false };
      this.notify();
    } catch (err: any) {
      this.connectionState = {
        ...this.connectionState,
        isLoading: false,
        error: err?.message || 'Connection failed. Please try again.',
      };
      this.notify();
    }
  }

  async disconnect(): Promise<void> {
    try {
      await api.post('/api/social-accounts/disconnect/all', {});
    } catch (err) {
      // best-effort
      console.warn('[vimo] best-effort operation failed:', err);
    }
    this.connectionState = {
      isConnected: false,
      accounts: [],
      isLoading: false,
      error: null,
    };
    this.notify();
  }

  async refreshAccounts(): Promise<void> {
    if (!this.connectionState.isConnected) {
      await this.loadState();
      return;
    }
    this.connectionState = { ...this.connectionState, isLoading: true };
    this.notify();

    try {
      const res = await api.post('/api/social-accounts/refresh', {});
      this.connectionState = {
        ...this.connectionState,
        accounts: this.mapAccounts(res.data.accounts || []),
        isLoading: false,
        isConnected: true,
      };
      this.notify();
    } catch {
      this.connectionState = { ...this.connectionState, isLoading: false };
      this.notify();
    }
  }

  async selectAccounts(_accountIds: string[]): Promise<void> {
    this.connectionState = {
      ...this.connectionState,
      accounts: this.connectionState.accounts.map((a) => ({
        ...a,
        isConnected: _accountIds.includes(a.id),
      })),
    };
    this.notify();
  }

  async initiateOAuth(platform: string): Promise<{ authUrl: string; connectorId: string; needsSetup?: boolean; setupGuide?: any }> {
    const res = await api.get(`/api/social-accounts/connect/${platform}`);
    if (res.data.needsSetup) {
      return { authUrl: '', connectorId: '', needsSetup: true, setupGuide: res.data.setupGuide };
    }
    return { authUrl: res.data.authUrl, connectorId: res.data.connectorId };
  }

  openOAuthPopup(platform: string, authUrl: string, connectorId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const popup = window.open(
        authUrl,
        `vimo-oauth-${platform}`,
        'width=600,height=700,left=200,top=100'
      );

      // Popup blocked — fail fast with a clear signal instead of hanging on polling
      if (!popup) {
        console.warn(`[vimo] auth popup blocked for ${platform}`);
        resolve(false);
        return;
      }

      this.oauthPopups.set(connectorId, popup);

      let resolved = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let popupCheckTimer: ReturnType<typeof setInterval> | undefined;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      let graceScheduled = false;
      // Safety timeout — abandon after 5 minutes so we never poll forever
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;

      const finalize = async (success: boolean) => {
        if (resolved) return;
        resolved = true;
        if (pollTimer) clearInterval(pollTimer);
        if (popupCheckTimer) clearInterval(popupCheckTimer);
        if (graceTimer) clearTimeout(graceTimer);
        if (expiryTimer) clearTimeout(expiryTimer);
        this.pollTimers.delete(connectorId);
        this.oauthPopups.delete(connectorId);
        try { popup?.close(); } catch (err) { console.warn('[vimo] failed to close auth popup:', err); }
        if (success) {
          await this.loadState();
        }
        resolve(success);
      };

      pollTimer = setInterval(async () => {
        try {
          const statusRes = await api.get(`/api/social-accounts/oauth-status/${connectorId}`);
          if (statusRes.data?.status === 'active') {
            finalize(true);
          } else if (statusRes.status === 410) {
            // Connector gone (abandoned handshake) — treat as cancel
            finalize(false);
          }
        } catch (err: any) {
          if (err?.response?.status === 410) finalize(false);
        }
      }, 1500);
      this.pollTimers.set(connectorId, pollTimer);

      popupCheckTimer = setInterval(() => {
        if (popup?.closed && !graceScheduled) {
          graceScheduled = true;
          if (popupCheckTimer) clearInterval(popupCheckTimer);
          graceTimer = setTimeout(async () => {
            try {
              const finalCheck = await api.get(`/api/social-accounts/oauth-status/${connectorId}`);
              if (finalCheck.data?.status === 'active') {
                finalize(true);
              } else {
                finalize(false);
              }
            } catch {
              finalize(false);
            }
          }, 2000);
        }
      }, 800);

      expiryTimer = setTimeout(() => {
        finalize(false);
      }, 5 * 60 * 1000);
    });
  }

  cleanup() {
    for (const [, timer] of this.pollTimers) clearInterval(timer);
    this.pollTimers.clear();
    // Close any OAuth popups that the user may have left open. We do NOT
    // resolve any pending promises — the caller (store.closeSetup) treats
    // that as the user cancelling the flow.
    for (const [, popup] of this.oauthPopups) {
      try {
        popup?.close();
      } catch (err) {
        // already gone
        console.warn('[vimo] best-effort operation failed:', err);
      }
    }
    this.oauthPopups.clear();
  }

  private mapAccounts(accounts: any[]): SocialAccount[] {
    return accounts.map((a: any) => ({
      id: a.id,
      platform: a.platform as SocialPlatform,
      name: a.name || `${a.platform} Account`,
      handle: a.handle || '',
      avatarUrl: a.avatarUrl,
      followerCount: a.followerCount || 0,
      isConnected: a.isConnected !== false,
      lastSyncAt: new Date().toISOString(),
      health: a.health || 'good',
      healthMessage: a.healthMessage,
      permissions: a.permissions || [],
      stats: a.stats || {
        postsThisMonth: 0,
        lastPostDaysAgo: null,
        engagementRate: 0,
        avgLikes: 0,
        avgComments: 0,
        reach: 0,
      },
    }));
  }
}

export const vimoSocialService = new VimoSocialService();
