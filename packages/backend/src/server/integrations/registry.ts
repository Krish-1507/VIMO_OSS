/**
 * Integration Registry
 *
 * The Integration Engine used to be hard-wired to a single set of Canva
 * dependencies (see engine.ts history). That made `disconnect` best-effort and
 * capped VIMO at one integration.
 *
 * This registry is the fix: every integration (AI Designer/Canva today, more
 * tomorrow) registers a `catalogId` plus a factory that returns the
 * `IntegrationEngineDeps` it needs. The engine resolves deps *per connection*
 * from here, so disconnect/health/invoke always know which integration they
 * are talking to, and adding a new integration is a one-line registration.
 */
import type { IntegrationEngineDeps } from './engine';
import { createCanvaIntegrationDeps } from './canvaDeps';

export interface IntegrationCatalogEntry {
  catalogId: string;
  displayName: string;
  category: string;
  connectLabel: string;
  /** Returns a fresh deps object for a connection to this integration. */
  getDeps: () => IntegrationEngineDeps;
}

class IntegrationRegistry {
  private entries = new Map<string, IntegrationCatalogEntry>();

  register(entry: IntegrationCatalogEntry): void {
    this.entries.set(entry.catalogId, entry);
  }

  get(catalogId: string): IntegrationCatalogEntry | undefined {
    return this.entries.get(catalogId);
  }

  has(catalogId: string): boolean {
    return this.entries.has(catalogId);
  }

  list(): IntegrationCatalogEntry[] {
    return Array.from(this.entries.values());
  }
}

export const integrationRegistry = new IntegrationRegistry();

let registered = false;

/**
 * Registers the built-in integrations exactly once. Lazily required to avoid a
 * module-init cycle between canvaDeps → db → (eventually) this file.
 */
export function registerBuiltInIntegrations(): void {
  if (registered) return;
  registered = true;

  integrationRegistry.register({
    catalogId: 'canva_ai_designer',
    displayName: 'AI Designer',
    category: 'design',
    connectLabel: 'Connect AI Designer (Canva)',
    getDeps: () => createCanvaIntegrationDeps(),
  });
}
