import fs from 'fs';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '../../.env');

const PROVIDER_ENV_MAP: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  custom: ['CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_MODEL_NAME'],
};

function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

function serializeEnv(entries: Map<string, string>, headerLines: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const h of headerLines) {
    if (h.startsWith('#') || h.trim() === '') {
      lines.push(h);
    } else {
      const eqIdx = h.indexOf('=');
      if (eqIdx === -1) { lines.push(h); continue; }
      const key = h.slice(0, eqIdx).trim();
      seen.add(key);
      if (entries.has(key)) {
        const val = entries.get(key)!;
        lines.push(`${key}=${val.includes(' ') ? `"${val}"` : val}`);
        entries.delete(key);
      } else {
        lines.push(h);
      }
    }
  }
  for (const [key, val] of entries) {
    lines.push(`${key}=${val.includes(' ') ? `"${val}"` : val}`);
  }
  return lines.join('\n') + '\n';
}

function getProviderEnvKeys(provider: string): string[] {
  return PROVIDER_ENV_MAP[provider] || [];
}

export async function syncEnvForProvider(
  provider: string,
  credentials: Record<string, string>,
  config?: Record<string, unknown>
): Promise<void> {
  const envKeys = getProviderEnvKeys(provider);
  if (envKeys.length === 0) return;

  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  } catch {
    content = '';
  }

  const headerLines = content ? content.split('\n') : [];
  const entries = parseEnv(content);

  for (const key of envKeys) {
    if (key === 'OPENAI_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'ANTHROPIC_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'GOOGLE_GENERATIVE_AI_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'GROQ_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'OPENROUTER_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'MISTRAL_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'CUSTOM_LLM_API_KEY' && credentials.apiKey) {
      entries.set(key, credentials.apiKey);
    } else if (key === 'CUSTOM_LLM_BASE_URL' && config?.baseUrl) {
      entries.set(key, String(config.baseUrl));
    } else if (key === 'CUSTOM_LLM_MODEL_NAME' && config?.modelName) {
      entries.set(key, String(config.modelName));
    }
  }

  const newContent = serializeEnv(entries, headerLines);
  fs.writeFileSync(ENV_PATH, newContent, 'utf-8');
  console.log(`[EnvWriter] Synced ${provider} credentials to .env`);
}

export async function removeEnvForProvider(provider: string): Promise<void> {
  const envKeys = getProviderEnvKeys(provider);
  if (envKeys.length === 0) return;

  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  } catch {
    return;
  }

  const headerLines = content.split('\n');
  const entries = parseEnv(content);
  for (const key of envKeys) {
    entries.delete(key);
  }

  const newContent = serializeEnv(entries, headerLines);
  fs.writeFileSync(ENV_PATH, newContent, 'utf-8');
  console.log(`[EnvWriter] Removed ${provider} credentials from .env`);
}
