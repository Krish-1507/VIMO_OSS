/**
 * Simplified OAuth Flow for VIMO
 * 
 * One-click OAuth for non-technical users:
 * User clicks Connect -> OAuth popup opens -> User logs in -> User clicks Allow -> 
 -> Returns (access token + refresh token) -> VIMO stores them encrypted -> Connected
 */

import crypto from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors } from '../db/schema';
import * as credentialStore from './credentialStore';

/* ------------------------------------------------------------------ */
/*  OAuth Provider Configurations (Simplified)                          */
/* ------------------------------------------------------------------ */

export interface SimpleOAuthConfig {
  provider: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  additionalParams?: Record<string, string>;
}

export const SIMPLE_OAUTH_PROVIDERS: SimpleOAuthConfig[] = [
  {
    provider: 'instagram',
    name: 'Instagram',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'],
  },
  {
    provider: 'linkedin',
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'rw_organization_admin'],
  },
  {
    provider: 'canva',
    name: 'Canva',
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: ['design:content:read', 'design:content:write', 'folder:read', 'folder:write'],
  },
  {
    provider: 'google',
    name: 'Google (Analytics, Drive, YouTube)',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
    ],
    additionalParams: { access_type: 'offline', prompt: 'consent' },
  },
  {
    provider: 'slack',
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:history', 'channels:read', 'chat:write', 'users:read'],
  },
  {
    provider: 'notion',
    name: 'Notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    additionalParams: { owner: 'user' },
  },
  {
    provider: 'github',
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user'],
  },
  {
    provider: 'pinterest',
    name: 'Pinterest',
    authUrl: 'https://www.pinterest.com/oauth',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: ['boards:read', 'pins:read', 'pins:write'],
  },
  {
    provider: 'reddit',
    name: 'Reddit',
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['read', 'submit', 'identity'],
    additionalParams: { duration: 'permanent' },
  },
  {
    provider: 'figma',
    name: 'Figma',
    authUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    scopes: ['file_read', 'file_write'],
  },
  {
    provider: 'trello',
    name: 'Trello',
    authUrl: 'https://trello.com/1/OAuthAuthorizeToken',
    tokenUrl: 'https://trello.com/1/OAuthGetAccessToken',
    scopes: ['read', 'write'],
  },
  {
    provider: 'asana',
    name: 'Asana',
    authUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    scopes: ['default'],
  },
  {
    provider: 'dropbox',
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.content.read', 'files.content.write'],
  },
];

/* ------------------------------------------------------------------ */
/*  Simplified OAuth Flow Functions                                     */
/* ------------------------------------------------------------------ */

interface PendingOAuthState {
  connectorId: string;
  provider: string;
  codeVerifier?: string;
  createdAt: number;
}

const pendingOAuthStates = new Map<string, PendingOAuthState>();

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingOAuthStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingOAuthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return Buffer.from(hash).toString('base64url');
}

export function generateOAuthState(
  connectorId: string,
  provider: string,
  codeVerifier?: string
): string {
  const state = crypto.randomBytes(32).toString('hex');
  pendingOAuthStates.set(state, {
    connectorId,
    provider,
    codeVerifier,
    createdAt: Date.now(),
  });
  return state;
}

export function verifyOAuthState(state: string): {
  connectorId: string;
  provider: string;
  codeVerifier?: string;
} | null {
  const data = pendingOAuthStates.get(state);
  if (!data) return null;
  if (Date.now() - data.createdAt > 10 * 60 * 1000) {
    pendingOAuthStates.delete(state);
    return null;
  }
  return {
    connectorId: data.connectorId,
    provider: data.provider,
    codeVerifier: data.codeVerifier,
  };
}

export function getAuthUrl(
  provider: string,
  state: string,
  codeChallenge?: string
): string {
  const config = SIMPLE_OAUTH_PROVIDERS.find((p) => p.provider === provider);
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  const params = new URLSearchParams({
    client_id: getOAuthClientId(provider),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  if (codeChallenge) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', 'S256');
  }

  if (config.additionalParams) {
    Object.entries(config.additionalParams).forEach(([key, value]) => {
      params.append(key, value);
    });
  }

  return `${config.authUrl}?${params.toString()}`;
}

// Get OAuth client ID from environment variables
function getOAuthClientId(provider: string): string {
  const envVar = `VIMO_${provider.toUpperCase()}_CLIENT_ID`;
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Missing required environment variable: ${envVar}. Please set it in your .env file.`);
  }
  return value;
}

// Get OAuth client secret from environment variables
function getOAuthClientSecret(provider: string): string {
  const envVar = `VIMO_${provider.toUpperCase()}_CLIENT_SECRET`;
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Missing required environment variable: ${envVar}. Please set it in your .env file.`);
  }
  return value;
}

// Check if OAuth credentials are configured for a provider
export function areOAuthCredentialsConfigured(provider: string): boolean {
  try {
    const clientId = process.env[`VIMO_${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`VIMO_${provider.toUpperCase()}_CLIENT_SECRET`];
    return !!(clientId && clientSecret);
  } catch {
    return false;
  }
}

// Get redirect URI
function getRedirectUri(): string {
  const baseUrl = process.env.VIMO_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/api/auth/oauth/callback`;
}

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier?: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const config = SIMPLE_OAUTH_PROVIDERS.find((p) => p.provider === provider);
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  // Check if credentials are configured
  if (!areOAuthCredentialsConfigured(provider)) {
    throw new Error(
      `OAuth credentials for ${provider} are not configured. ` +
      `Please set VIMO_${provider.toUpperCase()}_CLIENT_ID and ` +
      `VIMO_${provider.toUpperCase()}_CLIENT_SECRET in your .env file.`
    );
  }

  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: getOAuthClientId(provider),
    client_secret: getOAuthClientSecret(provider),
  };

  if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }

  try {
    const response = await axios.post(config.tokenUrl, new URLSearchParams(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    const data = response.data;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error: any) {
    if (error.response) {
      const errorData = error.response.data;
      throw new Error(
        `OAuth token exchange failed: ${errorData.error_description || errorData.error || error.response.statusText}`
      );
    }
    throw new Error(`OAuth token exchange failed: ${error.message}`);
  }
}

export async function createConnectorFromOAuth(
  provider: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<{ connectorId: string; name: string }> {
  // Create the connector
  const connectorId = crypto.randomUUID();
  const config = SIMPLE_OAUTH_PROVIDERS.find((p) => p.provider === provider);
  const name = config?.name || provider;

  await db.insert(connectors).values({
    id: connectorId,
    name,
    type: 'social',
    provider,
    status: 'active',
    configJson: JSON.stringify({}),
    encryptedCredentials: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Store credentials securely
  await credentialStore.storeCredential(connectorId, 'accessToken', accessToken);
  if (refreshToken) {
    await credentialStore.storeCredential(connectorId, 'refreshToken', refreshToken);
  }
  if (expiresAt) {
    await credentialStore.storeCredential(connectorId, 'tokenExpiresAt', String(expiresAt));
  }

  return { connectorId, name };
}
