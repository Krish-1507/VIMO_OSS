import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Demo Mode — zero-config sandbox for non-technical users.
//
// When enabled, VIMO behaves as if a sample brand is fully connected. No backend,
// no API keys, no real accounts required. Everything is clearly labelled "Demo"
// so nobody mistakes the sample data for a real connected brand.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_MODE_KEY = 'vimo_demo_mode';
export const DEMO_BADGE_LABEL = 'Demo';

export interface DemoAccount {
  id: string;
  name: string;
  brand: string;
  email: string;
  initials: string;
}

export interface DemoPost {
  id: string;
  platform: string;
  platformLabel: string;
  text: string;
  thumbnailColor: string;
  likes: number;
  comments: number;
  shares: number;
  publishedAt: string;
  status: 'published' | 'scheduled' | 'draft';
}

export interface DemoOpportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  potentialImpact: string;
  urgency: 'act_now' | 'act_today' | 'act_this_week';
  actionLabel: string;
  actionType: 'navigate' | 'execute' | 'approve_all';
  actionPayload: any;
  isActedOn: boolean;
  detectedAt: string;
}

export interface DemoAnalytics {
  followers: number;
  followersDelta: number;
  engagement: number;
  posts: number;
  reach: number;
  trend: { label: string; value: number }[];
  platforms: { platform: string; label: string; followers: number; color: string }[];
}

export interface DemoComment {
  id: string;
  author: string;
  avatarColor: string;
  text: string;
  platformLabel: string;
  responded: boolean;
  createdAt: string;
}

export interface DemoScheduledPost {
  id: string;
  platformLabel: string;
  platformColor: string;
  text: string;
  scheduledFor: string;
  status: 'queued' | 'pending_approval';
}

export interface DemoBrand {
  name: string;
  tagline: string;
  industry: string;
  voice: string;
}

export interface DemoData {
  account: DemoAccount;
  brand: DemoBrand;
  posts: DemoPost[];
  opportunities: DemoOpportunity[];
  analytics: DemoAnalytics;
  comments: DemoComment[];
  scheduled: DemoScheduledPost[];
  connectedPlatforms: { provider: string; name: string; label: string; color: string }[];
}

interface DemoModeState {
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

function readActive(): boolean {
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const useDemoMode = create<DemoModeState>((set) => ({
  active: readActive(),
  enter: () => {
    try {
      localStorage.setItem(DEMO_MODE_KEY, 'true');
    } catch {
      // ignore
    }
    set({ active: true });
  },
  exit: () => {
    try {
      localStorage.removeItem(DEMO_MODE_KEY);
    } catch {
      // ignore
    }
    set({ active: false });
  },
  toggle: () => (readActive() ? useDemoMode.getState().exit() : useDemoMode.getState().enter()),
}));

export function isDemoMode(): boolean {
  return readActive();
}
