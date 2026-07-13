/**
 * OAuth Manager — Managed OAuth2 + Guided Setup for VIMO
 *
 * Architecture:
 *   MANAGED_PROVIDERS  — VIMO ships with embedded credentials. Users just click Allow.
 *                        GitHub (PKCE), Notion (public OAuth), Canva (public OAuth).
 *   GUIDED_PROVIDERS   — Users create their own developer app once (5 min).
 *                        Instagram/Facebook, LinkedIn, Google.
 *   SIMPLE_CREDENTIAL_PROVIDERS — Single token or key. No OAuth flow.
 *                        Slack, HubSpot, Higgsfield.
 */

import crypto from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';
import * as credentialStore from './credentialStore';

/* ------------------------------------------------------------------ */
/*  Provider Categories                                                */
/* ------------------------------------------------------------------ */

export const MANAGED_PROVIDERS = ['github', 'notion', 'canva', 'linkedin', 'x'] as const;
export const GUIDED_PROVIDERS = [
  'instagram_facebook',
  'google',
  'facebook',
  'tiktok',
  'youtube',
  'pinterest',
  'threads',
  'reddit',
  'medium',
] as const;
export const SIMPLE_CREDENTIAL_PROVIDERS = ['slack', 'hubspot', 'higgsfield'] as const;

export type ManagedProvider = (typeof MANAGED_PROVIDERS)[number];
export type GuidedProvider = (typeof GUIDED_PROVIDERS)[number];
export type SimpleCredentialProvider = (typeof SIMPLE_CREDENTIAL_PROVIDERS)[number];

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  responseType: string;
  additionalParams?: Record<string, string>;
  /** For PKCE flow — requires code_challenge instead of client_secret */
  usePkce?: boolean;
  /** Query param name for the client id (defaults to `client_id`; TikTok uses `client_key`) */
  clientIdParam?: string;
  /** Scope separator (defaults to a space; TikTok uses a comma) */
  scopeSeparator?: string;
  /**
   * How the client credentials are presented on token exchange:
   * - 'body'   (default): client_id + client_secret in the request body
   * - 'basic'  : HTTP Basic auth header (client_id:client_secret), also sent in body
   * - 'public' : public client (PKCE), only client_id in body, no secret
   */
  tokenAuth?: 'body' | 'basic' | 'public';
  /** Pretty name used in logs / errors */
  displayName?: string;
}

export interface OAuthAppCredentials {
  instagram?: { clientId: string; clientSecret: string };
  linkedin?: { clientId: string; clientSecret: string };
  notion?: { clientId: string; clientSecret: string };
  github?: { clientId: string; clientSecret: string };
  slack?: { clientId: string; clientSecret: string };
  canva?: { clientId: string; clientSecret: string };
  google?: { clientId: string; clientSecret: string };
  x?: { clientId: string; clientSecret?: string };
}

export interface SetupStep {
  stepNumber: number;
  title: string;
  description: string;
  actionUrl?: string;
  screenshotDescription?: string;
  inputField?: { key: string; label: string; placeholder: string; isSecret: boolean };
}

export interface SetupGuide {
  title: string;
  estimatedMinutes: number;
  steps: SetupStep[];
  videoGuideUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Provider OAuth Endpoint Configurations                             */
/* ------------------------------------------------------------------ */

export const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  instagram_facebook: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ],
    responseType: 'code',
  },
  instagram: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ],
    responseType: 'code',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['profile', 'openid', 'email', 'w_member_social'],
    responseType: 'code',
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    responseType: 'code',
    additionalParams: { access_type: 'offline', prompt: 'consent' },
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user'],
    responseType: 'code',
    usePkce: true,
  },
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    responseType: 'code',
    additionalParams: { owner: 'user' },
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:history', 'channels:read', 'chat:write', 'users:read'],
    responseType: 'code',
  },
  canva: {
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: ['design:content:read', 'design:content:write', 'folder:read', 'folder:write'],
    responseType: 'code',
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'business_management',
    ],
    responseType: 'code',
    displayName: 'Facebook',
  },
  x: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    responseType: 'code',
    usePkce: true,
    tokenAuth: 'public',
    displayName: 'X',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token',
    scopes: ['user.info.basic', 'video.list'],
    responseType: 'code',
    usePkce: true,
    clientIdParam: 'client_key',
    scopeSeparator: ',',
    displayName: 'TikTok',
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    responseType: 'code',
    additionalParams: { access_type: 'offline', prompt: 'consent' },
    displayName: 'YouTube',
  },
  pinterest: {
    authUrl: 'https://www.pinterest.com/oauth/authorize',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: ['boards:read', 'pins:read', 'pins:write', 'user_account:read'],
    responseType: 'code',
    tokenAuth: 'basic',
    displayName: 'Pinterest',
  },
  threads: {
    authUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    scopes: [
      'threads_basic',
      'threads_content_publish',
      'threads_manage_replies',
      'threads_read_replies',
    ],
    responseType: 'code',
    displayName: 'Threads',
  },
  reddit: {
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['submit', 'identity', 'read'],
    responseType: 'code',
    tokenAuth: 'basic',
    displayName: 'Reddit',
  },
  medium: {
    authUrl: 'https://medium.com/m/oauth/authorize',
    tokenUrl: 'https://api.medium.com/v1/tokens',
    scopes: ['basicProfile', 'publish'],
    responseType: 'code',
    tokenAuth: 'basic',
    displayName: 'Medium',
  },
};

/* ------------------------------------------------------------------ */
/*  Managed Provider Default Credentials (env vars w/ defaults)        */
/* ------------------------------------------------------------------ */

/** GitHub — uses PKCE, no client_secret needed */
function getGithubClientId(): string {
  return process.env.VIMO_GITHUB_CLIENT_ID || 'Iv23li6XoXRs3YB6h5jB';
}

/** Notion — public integration */
function getNotionCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: process.env.VIMO_NOTION_CLIENT_ID || '',
    clientSecret: process.env.VIMO_NOTION_CLIENT_SECRET || '',
  };
}

/** Canva — public OAuth app */
function getCanvaCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: process.env.VIMO_CANVA_CLIENT_ID || '',
    clientSecret: process.env.VIMO_CANVA_CLIENT_SECRET || '',
  };
}

/** LinkedIn — public OAuth app (managed, one-click like GitHub/Notion/Canva). */
function getLinkedInCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: process.env.VIMO_LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.VIMO_LINKEDIN_CLIENT_SECRET || '',
  };
}

/**
 * X (Twitter) — public OAuth 2.0 client (PKCE, no secret). VIMO ships the app
 * client id so users connect with one click; no key pasting required.
 */
function getXCredentials(): { clientId: string; clientSecret?: string } {
  return {
    clientId: process.env.VIMO_X_CLIENT_ID || '',
  };
}

function getManagedCredentials(provider: string): { clientId: string; clientSecret?: string } | null {
  switch (provider) {
    case 'github':
      return { clientId: getGithubClientId() };
    case 'notion':
      return getNotionCredentials();
    case 'canva':
      return getCanvaCredentials();
    case 'linkedin':
      return getLinkedInCredentials();
    case 'x':
      return getXCredentials();
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  PKCE Helpers                                                       */
/* ------------------------------------------------------------------ */

export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return Buffer.from(hash).toString('base64url');
}

/* ------------------------------------------------------------------ */
/*  Guided Setup Content                                               */
/* ------------------------------------------------------------------ */

function hasValidClientCredentials(provider: string): boolean {
  const creds = getManagedCredentials(provider);
  if (!creds) return false;
  return !!creds.clientId && creds.clientId !== `your_${provider}_client_id`;
}

export const GUIDED_SETUP_CONTENT: Record<string, SetupGuide> = {
  instagram_facebook: {
    title: 'Set up Instagram connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Facebook Developers',
        description: 'Go to developers.facebook.com, click "My Apps", then "Create App". Choose "Business" as the app type.',
        actionUrl: 'https://developers.facebook.com/',
      },
      {
        stepNumber: 2,
        title: 'Add Instagram product',
        description: 'In your app dashboard, click "Add Product" and add "Instagram Basic Display".',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'In Instagram Basic Display settings, paste the redirect address below into "Valid OAuth Redirect URIs".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback/instagram_facebook`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your App ID',
        description: 'From the top of your App Dashboard, copy the App ID number.',
        inputField: { key: 'clientId', label: 'App ID', placeholder: '1234567890', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your App Secret',
        description: 'Go to Settings > Basic, reveal and copy the App Secret.',
        inputField: { key: 'clientSecret', label: 'App Secret', placeholder: 'Your app secret', isSecret: true },
      },
    ],
  },
  linkedin: {
    title: 'Set up LinkedIn connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open LinkedIn Developer Portal',
        description: 'Go to developer.linkedin.com/apps and click "Create app".',
        actionUrl: 'https://www.linkedin.com/developers/apps',
      },
      {
        stepNumber: 2,
        title: 'Fill in app details',
        description: 'Enter your app name, select your LinkedIn Company Page, upload a logo, and agree to terms.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'In the Auth tab, add the redirect address below.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback/linkedin`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy Client ID and Secret',
        description: 'From the Auth tab, copy the Client ID and Client Secret.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your LinkedIn Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Paste Client Secret',
        description: 'Paste the Client Secret from LinkedIn.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your LinkedIn Client Secret', isSecret: true },
      },
      {
        stepNumber: 6,
        title: 'Request permissions',
        description: 'In the Products tab, request access to "Share on LinkedIn" and "Sign In with LinkedIn".',
      },
    ],
  },
  google: {
    title: 'Set up Google connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Google Cloud Console',
        description: 'Go to console.cloud.google.com and create a new project called "VIMO".',
        actionUrl: 'https://console.cloud.google.com/',
      },
      {
        stepNumber: 2,
        title: 'Enable required APIs',
        description: 'In the API Library, enable: Google Analytics Data API, Google Drive API, Google Calendar API, and Gmail API.',
      },
      {
        stepNumber: 3,
        title: 'Create OAuth credentials',
        description: 'Go to Credentials, click "Create Credentials", select "OAuth client ID", and choose "Web Application".',
      },
      {
        stepNumber: 4,
        title: 'Add redirect address',
        description: 'Add the redirect address below to the Authorized Redirect URIs.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback/google`,
          isSecret: false,
        },
      },
      {
        stepNumber: 5,
        title: 'Copy Client ID',
        description: 'Copy the Client ID from the credentials page.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your Google Client ID', isSecret: false },
      },
      {
        stepNumber: 6,
        title: 'Copy Client Secret',
        description: 'Copy the Client Secret from the credentials page.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Google Client Secret', isSecret: true },
      },
    ],
  },
  canva: {
    title: 'Set up Canva connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Canva Developers',
        description: 'Go to canva.com/developers and click "My Apps", then "Create App".',
        actionUrl: 'https://www.canva.com/developers/',
      },
      {
        stepNumber: 2,
        title: 'Create a new app',
        description: 'Enter your app name (e.g., "VIMO"), add a description, and set the redirect URL below.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'In your app settings, add the redirect address below to the "Allowed Redirect URLs" field.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your App ID',
        description: 'From the app dashboard, copy the App ID (Client ID).',
        inputField: { key: 'clientId', label: 'App ID / Client ID', placeholder: 'Your Canva Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your App Secret',
        description: 'Click "Show" next to Client Secret and copy it.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Canva Client Secret', isSecret: true },
      },
    ],
  },
  facebook: {
    title: 'Set up Facebook connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Facebook Developers',
        description: 'Go to developers.facebook.com, click "My Apps", then "Create App". Choose "Business" as the app type.',
        actionUrl: 'https://developers.facebook.com/',
      },
      {
        stepNumber: 2,
        title: 'Add Facebook Login',
        description: 'In your app dashboard, click "Add Product" and add "Facebook Login" (Web).',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'In Facebook Login > Settings, add the redirect address below to "Valid OAuth Redirect URIs".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your App ID',
        description: 'From the top of your App Dashboard, copy the App ID number.',
        inputField: { key: 'clientId', label: 'App ID', placeholder: '1234567890', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your App Secret',
        description: 'Go to Settings > Basic, reveal and copy the App Secret.',
        inputField: { key: 'clientSecret', label: 'App Secret', placeholder: 'Your app secret', isSecret: true },
      },
    ],
  },
  x: {
    title: 'Set up X (Twitter) connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open X Developer Portal',
        description: 'Go to developer.x.com and create a new app under your project.',
        actionUrl: 'https://developer.x.com/en/portal/dashboard',
      },
      {
        stepNumber: 2,
        title: 'Enable OAuth 2.0',
        description: 'In "User authentication settings", set App permissions to "Read and write", type to "Web App", and enable OAuth 2.0.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Add the redirect address below to "Callback URI / Redirect URL".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client ID',
        description: 'From the "Keys and tokens" page, copy the OAuth 2.0 Client ID.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your X Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your Client Secret',
        description: 'Copy the OAuth 2.0 Client Secret.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your X Client Secret', isSecret: true },
      },
    ],
  },
  tiktok: {
    title: 'Set up TikTok connection',
    estimatedMinutes: 6,
    steps: [
      {
        stepNumber: 1,
        title: 'Open TikTok for Developers',
        description: 'Go to developers.tiktok.com and click "Manage apps" then "Connect an app".',
        actionUrl: 'https://developers.tiktok.com/',
      },
      {
        stepNumber: 2,
        title: 'Configure OAuth',
        description: 'Set the app type to "Web App", add the redirect URL below, and request the "Display Basic Videos" and "Upload Videos" scopes.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Add the redirect address below to "Redirect domain / URL".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client Key',
        description: 'From the app credentials page, copy the Client Key.',
        inputField: { key: 'clientId', label: 'Client Key', placeholder: 'Your TikTok Client Key', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your Client Secret',
        description: 'Copy the Client Secret.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your TikTok Client Secret', isSecret: true },
      },
    ],
  },
  youtube: {
    title: 'Set up YouTube connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Google Cloud Console',
        description: 'Go to console.cloud.google.com and open (or create) the project behind your Google app.',
        actionUrl: 'https://console.cloud.google.com/apis/credentials',
      },
      {
        stepNumber: 2,
        title: 'Enable YouTube APIs',
        description: 'In the API Library, enable "YouTube Data API v3" and "YouTube Analytics API".',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Add the redirect address below to the OAuth client\'s "Authorized redirect URIs".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client ID',
        description: 'Copy the Client ID from the OAuth credentials.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your Google Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your Client Secret',
        description: 'Copy the Client Secret.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Google Client Secret', isSecret: true },
      },
    ],
  },
  pinterest: {
    title: 'Set up Pinterest connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Pinterest Developers',
        description: 'Go to developers.pinterest.com and click "Create app".',
        actionUrl: 'https://developers.pinterest.com/docs/getting-started/authentication/',
      },
      {
        stepNumber: 2,
        title: 'Configure app',
        description: 'Set the app to "Web app", add the redirect URL below, and request the boards, pins, and user account scopes.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Add the redirect address below to "Redirect URIs".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your App ID',
        description: 'From the app details, copy the App ID.',
        inputField: { key: 'clientId', label: 'App ID', placeholder: 'Your Pinterest App ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your App Secret',
        description: 'Copy the App Secret.',
        inputField: { key: 'clientSecret', label: 'App Secret', placeholder: 'Your Pinterest App Secret', isSecret: true },
      },
    ],
  },
  threads: {
    title: 'Set up Threads connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Meta for Developers',
        description: 'Threads uses the Meta Graph API. In developers.facebook.com, open your app and add the "Threads" product.',
        actionUrl: 'https://developers.facebook.com/docs/threads/',
      },
      {
        stepNumber: 2,
        title: 'Configure Threads',
        description: 'Add the redirect URL below and request the threads_basic, threads_content_publish, and threads_manage_replies scopes.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Add the redirect address below to "Valid OAuth Redirect URIs".',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your App ID',
        description: 'Copy the App ID from your app dashboard.',
        inputField: { key: 'clientId', label: 'App ID', placeholder: '1234567890', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your App Secret',
        description: 'Copy the App Secret.',
        inputField: { key: 'clientSecret', label: 'App Secret', placeholder: 'Your app secret', isSecret: true },
      },
    ],
  },
  reddit: {
    title: 'Set up Reddit connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Reddit Apps',
        description: 'Go to reddit.com/prefs/apps and click "create another app…".',
        actionUrl: 'https://www.reddit.com/prefs/apps',
      },
      {
        stepNumber: 2,
        title: 'Configure app',
        description: 'Choose "web app", set the redirect URL below, and note your client id (under the app name) and secret.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Set the redirect address below as the app\'s redirect uri.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client ID',
        description: 'The client id is the string shown under your app\'s name.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your Reddit Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your Client Secret',
        description: 'Copy the secret shown next to "secret".',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Reddit Client Secret', isSecret: true },
      },
    ],
  },
  medium: {
    title: 'Set up Medium connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Medium Settings',
        description: 'Go to medium.com/me/settings/security and scroll to "Integration tokens".',
        actionUrl: 'https://medium.com/me/settings/security',
      },
      {
        stepNumber: 2,
        title: 'Register an application',
        description: 'Create an OAuth app at medium.com/me/applications with the redirect URL below.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect address',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 3,
        title: 'Copy your Client ID',
        description: 'Copy the Client ID from your Medium application.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your Medium Client ID', isSecret: false },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client Secret',
        description: 'Copy the Client Secret.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Medium Client Secret', isSecret: true },
      },
    ],
  },
  github: {
    title: 'Set up GitHub connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open GitHub Settings',
        description: 'Go to github.com/settings/developers and click "OAuth Apps", then "New OAuth App".',
        actionUrl: 'https://github.com/settings/developers',
      },
      {
        stepNumber: 2,
        title: 'Register a new OAuth app',
        description: 'Enter "VIMO" as the Application Name, your homepage URL, and the redirect URL below.',
      },
      {
        stepNumber: 3,
        title: 'Add redirect address',
        description: 'Set the Authorization callback URL to the address below.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this callback URL',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client ID',
        description: 'After creating the app, copy the Client ID.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your GitHub Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Generate and copy a Client Secret',
        description: 'Click "Generate a new client secret" and copy the value shown.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your GitHub Client Secret', isSecret: true },
      },
    ],
  },
  notion: {
    title: 'Set up Notion connection',
    estimatedMinutes: 5,
    steps: [
      {
        stepNumber: 1,
        title: 'Open Notion Integrations',
        description: 'Go to notion.so/my-integrations and click "New integration".',
        actionUrl: 'https://www.notion.so/my-integrations',
      },
      {
        stepNumber: 2,
        title: 'Create a new integration',
        description: 'Enter "VIMO" as the name, select the workspace, and upload an icon.',
      },
      {
        stepNumber: 3,
        title: 'Set redirect address',
        description: 'Under "Capabilities", add the redirect address below.',
        inputField: {
          key: 'redirectUri',
          label: 'Copy this redirect URL',
          placeholder: `http://localhost:${process.env.PORT || 3000}/api/auth/oauth/callback`,
          isSecret: false,
        },
      },
      {
        stepNumber: 4,
        title: 'Copy your Client ID',
        description: 'From the Integration Settings page, copy the Client ID.',
        inputField: { key: 'clientId', label: 'Client ID', placeholder: 'Your Notion Client ID', isSecret: false },
      },
      {
        stepNumber: 5,
        title: 'Copy your Client Secret',
        description: 'Click "Show" next to Client Secret and copy it.',
        inputField: { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Notion Client Secret', isSecret: true },
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Pending OAuth States (in-memory CSRF prevention)                   */
/* ------------------------------------------------------------------ */

interface PendingState {
  connectorId: string;
  provider: string;
  codeVerifier?: string;
  createdAt: number;
}

const pendingStates = new Map<string, PendingState>();

setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

/* ------------------------------------------------------------------ */
/*  Credential Helpers                                                 */
/* ------------------------------------------------------------------ */

export async function getOAuthAppCredentials(): Promise<OAuthAppCredentials> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'oauthAppCredentials'))
    .get();

  if (!row) return {};
  try {
    return JSON.parse(row.value) as OAuthAppCredentials;
  } catch {
    return {};
  }
}

export async function setOAuthAppCredentials(credentials: OAuthAppCredentials): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      key: 'oauthAppCredentials',
      value: JSON.stringify(credentials),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(credentials), updatedAt: new Date().toISOString() },
    });
}

/* ------------------------------------------------------------------ */
/*  Provider Classification Helpers                                   */
/* ------------------------------------------------------------------ */

function getOAuthProviderKey(provider: string): string {
  if (provider === 'instagram') return 'instagram_facebook';
  if (provider === 'instagram_facebook') return 'instagram_facebook';
  if (provider === 'twitter') return 'x';
  if (['google-analytics', 'google-drive', 'google-ads'].includes(provider)) return 'google';
  return provider;
}

export { getOAuthProviderKey };

export function isManagedProvider(provider: string): boolean {
  const key = getOAuthProviderKey(provider);
  return (MANAGED_PROVIDERS as readonly string[]).includes(key);
}

export function isGuidedProvider(provider: string): boolean {
  const key = getOAuthProviderKey(provider);
  return (GUIDED_PROVIDERS as readonly string[]).includes(key);
}

export function isSimpleCredentialProvider(provider: string): boolean {
  return (SIMPLE_CREDENTIAL_PROVIDERS as readonly string[]).includes(provider);
}

export function getProviderCategory(provider: string): 'managed' | 'guided' | 'simple' | 'oauth' {
  const key = getOAuthProviderKey(provider);
  if (isManagedProvider(key)) return 'managed';
  if (isGuidedProvider(key)) return 'guided';
  if (isSimpleCredentialProvider(provider)) return 'simple';
  return 'oauth';
}

export function isOAuthProvider(provider: string): boolean {
  const oauthKey = getOAuthProviderKey(provider);
  return !!OAUTH_CONFIGS[oauthKey];
}

/**
 * Returns whether a provider can be connected with a single click — i.e. VIMO
 * already holds the app credentials (managed env vars or saved guided creds)
 * so the user only has to approve in their browser. When this is false the
 * user still needs to supply their own app credentials once (guided setup).
 */
export async function isProviderConnectable(provider: string): Promise<boolean> {
  const oauthKey = getOAuthProviderKey(provider);
  const config = OAUTH_CONFIGS[oauthKey];
  if (!config) return false;

  if (isManagedProvider(oauthKey)) {
    const savedCreds = await getOAuthAppCredentials();
    const savedProviderCreds = (savedCreds as any)[oauthKey];
    const envCreds = getManagedCredentials(oauthKey);
    const clientId = savedProviderCreds?.clientId || envCreds?.clientId || '';
    return !!clientId && !clientId.startsWith('your_') && !!envCreds;
  }

  if (isGuidedProvider(oauthKey)) {
    const credentials = await getOAuthAppCredentials();
    const providerCreds = (credentials as any)[oauthKey];
    return !!(providerCreds?.clientId && providerCreds?.clientSecret);
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Param helpers (provider-specific overrides)                       */
/* ------------------------------------------------------------------ */

function applyProviderParamOverrides(params: URLSearchParams, config: OAuthConfig): void {
  if (config.clientIdParam && config.clientIdParam !== 'client_id') {
    const clientId = params.get('client_id');
    if (clientId !== null) {
      params.delete('client_id');
      params.append(config.clientIdParam, clientId);
    }
  }
  if (config.scopeSeparator && config.scopeSeparator !== ' ') {
    const scope = params.get('scope');
    if (scope) {
      params.set('scope', scope.split(' ').join(config.scopeSeparator));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Auth URL Generation                                                */
/* ------------------------------------------------------------------ */

/**
 * Generate the authorization URL for a given provider.
 * For MANAGED_PROVIDERS — uses PKCE (GitHub) or embedded credentials (Notion, Canva).
 * For GUIDED_PROVIDERS — reads user-configured credentials from appSettings.
 * Returns { authUrl } on success, or { needsSetup: true, setupGuide } if credentials missing.
 */
export async function generateAuthUrl(
  provider: string,
  connectorId: string,
  state?: string,
): Promise<{ authUrl: string; codeVerifier?: string } | { needsSetup: true; setupGuide: SetupGuide }> {
  const oauthKey = getOAuthProviderKey(provider);
  const config = OAUTH_CONFIGS[oauthKey];
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }

  // ── MANAGED PROVIDERS (check saved credentials first, then .env) ──
  if (isManagedProvider(oauthKey)) {
    // 1. Check user-saved credentials from in-app guided setup
    const savedCreds = await getOAuthAppCredentials();
    const savedProviderCreds = (savedCreds as any)[oauthKey];
    // 2. Fall back to .env environment variables
    const envCreds = getManagedCredentials(oauthKey);

    const clientId = savedProviderCreds?.clientId || envCreds?.clientId || '';
    const clientSecret = savedProviderCreds?.clientSecret || envCreds?.clientSecret || '';

    if (!clientId || clientId.startsWith('your_')) {
      const guide = GUIDED_SETUP_CONTENT[oauthKey];
      if (guide) {
        return { needsSetup: true, setupGuide: guide };
      }
      throw new Error(
        `No default credentials for ${oauthKey}. Set the VIMO_${oauthKey.toUpperCase()}_CLIENT_ID environment variable.`,
      );
    }

    // Generate state for CSRF
    const stateToken = state || crypto.randomBytes(24).toString('hex');
    const codeVerifier = config.usePkce ? generateCodeVerifier() : undefined;
    const codeChallenge = codeVerifier ? generateCodeChallenge(codeVerifier) : undefined;

    const statePayload = JSON.stringify({ state: stateToken, connectorId, provider: oauthKey });
    const stateEncoded = Buffer.from(statePayload).toString('base64');

    pendingStates.set(stateToken, {
      connectorId,
      provider: oauthKey,
      codeVerifier,
      createdAt: Date.now(),
    });

    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback`;
    const scopes = config.scopes.join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: config.responseType,
      state: stateEncoded,
    });

    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    if (config.additionalParams) {
      for (const [key, value] of Object.entries(config.additionalParams)) {
        params.append(key, value);
      }
    }

    applyProviderParamOverrides(params, config);

    return { authUrl: `${config.authUrl}?${params.toString()}`, codeVerifier };
  }

  // ── GUIDED PROVIDERS ──
  if (isGuidedProvider(oauthKey)) {
    const credentials = await getOAuthAppCredentials();
    const providerCreds = (credentials as any)[oauthKey];

    if (!providerCreds?.clientId || !providerCreds?.clientSecret) {
      // Return setup guide instead of error
      const guide = GUIDED_SETUP_CONTENT[oauthKey];
      if (guide) {
        return { needsSetup: true, setupGuide: guide };
      }
      throw new Error(`Setup guide not available for ${oauthKey}.`);
    }

    const stateToken = state || crypto.randomBytes(24).toString('hex');
    const statePayload = JSON.stringify({ state: stateToken, connectorId, provider: oauthKey });
    const stateEncoded = Buffer.from(statePayload).toString('base64');

    pendingStates.set(stateToken, { connectorId, provider: oauthKey, createdAt: Date.now() });

    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback`;
    const scopes = config.scopes.join(' ');

    const params = new URLSearchParams({
      client_id: providerCreds.clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: config.responseType,
      state: stateEncoded,
    });

    if (config.additionalParams) {
      for (const [key, value] of Object.entries(config.additionalParams)) {
        params.append(key, value);
      }
    }

    applyProviderParamOverrides(params, config);

    return { authUrl: `${config.authUrl}?${params.toString()}` };
  }

  throw new Error(`OAuth provider ${provider} is not configured.`);
}

/* ------------------------------------------------------------------ */
/*  Token Exchange                                                     */
/* ------------------------------------------------------------------ */

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier?: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
}> {
  const oauthKey = getOAuthProviderKey(provider);
  const config = OAUTH_CONFIGS[oauthKey];
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }

  const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = `${baseUrl}/api/auth/oauth/callback`;

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  // Managed providers — check saved credentials first, then .env
  if (isManagedProvider(oauthKey)) {
    const savedCreds = await getOAuthAppCredentials();
    const savedProviderCreds = (savedCreds as any)[oauthKey];
    const envCreds = getManagedCredentials(oauthKey);

    const clientId = savedProviderCreds?.clientId || envCreds?.clientId || '';
    const clientSecret = savedProviderCreds?.clientSecret || envCreds?.clientSecret || '';

    if (config.usePkce && codeVerifier) {
      // PKCE flow — no client_secret
      body.append('client_id', clientId);
      body.append('code_verifier', codeVerifier);
    } else {
      // Notion / Canva — need client secret
      if (!clientId) throw new Error(`No credentials for ${oauthKey}`);
      body.append('client_id', clientId);
      if (clientSecret) body.append('client_secret', clientSecret);
    }
  } else {
    // Guided providers — read from appSettings (LinkedIn, Google, X, Facebook,
    // TikTok, YouTube, Pinterest, Threads, Reddit, Medium, …)
    const credentials = await getOAuthAppCredentials();
    const providerCreds = (credentials as any)[oauthKey];
    if (!providerCreds?.clientId || !providerCreds?.clientSecret) {
      throw new Error(`OAuth credentials not configured for ${provider}. Add them in Social Accounts setup.`);
    }
    const clientId = providerCreds.clientId;
    const clientSecret = providerCreds.clientSecret;
    const tokenAuth = config.tokenAuth || 'body';

    if (tokenAuth === 'public') {
      // Public client (PKCE) — only the client id, no secret
      body.append('client_id', clientId);
    } else {
      body.append('client_id', clientId);
      body.append('client_secret', clientSecret);
      if (tokenAuth === 'basic') {
        headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      }
    }

    // Rename the client id param for providers that use a different name (e.g. TikTok -> client_key)
    if (config.clientIdParam && config.clientIdParam !== 'client_id') {
      const value = body.get('client_id');
      body.delete('client_id');
      body.append(config.clientIdParam, value as string);
    }

    if (oauthKey === 'reddit') {
      headers['User-Agent'] = 'VIMO/1.0 (social connector)';
    }
  }

  const isGithub = oauthKey === 'github';

  const res = await axios.post(config.tokenUrl, body.toString(), { headers });

  let data: Record<string, any>;

  if (isGithub && typeof res.data === 'string') {
    const params = new URLSearchParams(res.data as string);
    data = Object.fromEntries(params.entries());
  } else {
    data = res.data as Record<string, any>;
  }

  const accessToken = data.access_token || data.accessToken;
  if (!accessToken) {
    throw new Error(
      `Failed to exchange code for token: ${data.error_description || data.error || 'Unknown error'}`,
    );
  }

  return {
    accessToken,
    refreshToken: data.refresh_token || data.refreshToken,
    expiresIn: data.expires_in || data.expiresIn,
    tokenType: data.token_type || data.tokenType || 'Bearer',
  };
}

/* ------------------------------------------------------------------ */
/*  Token Refresh                                                      */
/* ------------------------------------------------------------------ */

export async function refreshAccessToken(
  provider: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const oauthKey = getOAuthProviderKey(provider);
  const config = OAUTH_CONFIGS[oauthKey];
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  if (isManagedProvider(oauthKey)) {
    const creds = getManagedCredentials(oauthKey);
    if (!creds) throw new Error(`No managed credentials for ${oauthKey}`);
    body.append('client_id', creds.clientId);
    if (creds.clientSecret) body.append('client_secret', creds.clientSecret);
  } else {
    const credentials = await getOAuthAppCredentials();
    const providerCreds = (credentials as any)[oauthKey];
    if (!providerCreds?.clientId || !providerCreds?.clientSecret) {
      throw new Error(`OAuth credentials not configured for ${provider}`);
    }
    body.append('client_id', providerCreds.clientId);
    body.append('client_secret', providerCreds.clientSecret);
  }

  const res = await axios.post(config.tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  });

  const data = res.data as Record<string, any>;
  return {
    accessToken: data.access_token || data.accessToken,
    expiresIn: data.expires_in || data.expiresIn,
  };
}

/* ------------------------------------------------------------------ */
/*  State Verification                                                 */
/* ------------------------------------------------------------------ */

export async function verifyOAuthState(
  stateEncoded: string,
): Promise<{ connectorId: string; provider: string; codeVerifier?: string } | null> {
  try {
    const decoded = JSON.parse(Buffer.from(stateEncoded, 'base64').toString());
    const { state: stateToken, connectorId, provider } = decoded;

    const stored = pendingStates.get(stateToken);
    if (!stored) return null;

    if (Date.now() - stored.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(stateToken);
      return null;
    }

    if (stored.connectorId !== connectorId || stored.provider !== provider) {
      return null;
    }

    pendingStates.delete(stateToken);

    return { connectorId, provider, codeVerifier: stored.codeVerifier };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider Metadata                                                  */
/* ------------------------------------------------------------------ */

export const OAUTH_PROVIDER_HELP: Record<string, { name: string; docsUrl: string }> = {
  instagram_facebook: { name: 'Instagram/Facebook', docsUrl: 'https://developers.facebook.com/' },
  linkedin: { name: 'LinkedIn', docsUrl: 'https://www.linkedin.com/developers/' },
  google: { name: 'Google', docsUrl: 'https://console.cloud.google.com/apis/credentials' },
  github: { name: 'GitHub', docsUrl: 'https://github.com/settings/developers' },
  notion: { name: 'Notion', docsUrl: 'https://www.notion.so/my-integrations' },
  slack: { name: 'Slack', docsUrl: 'https://api.slack.com/apps' },
  canva: { name: 'Canva', docsUrl: 'https://www.canva.com/developers/' },
};
