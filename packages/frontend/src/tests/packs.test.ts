/**
 * Pack Marketplace contract — every pack must be set-up-able.
 *
 * Users connect packs through a guided assistant that renders each step by
 * type. A pack with an empty step list, a step missing its payload (e.g. a
 * credential step with no fields), a dangling help-article link, or an icon
 * name no resolver knows will strand the user mid-flow with no error. This
 * suite locks the contract every pack must satisfy, including that every
 * icon string resolves to a real component (the tree-shaken IconResolver
 * allowlist must grow with the catalog).
 */
import { describe, it, expect } from 'vitest';
import * as Icons from 'lucide-react';
import { ALL_PACKS } from '../connector-packs/index';
import type { ConnectorPack } from '../connector-packs/types';
import { resolveIcon } from '../connector-packs/components/IconResolver';

const VALID_CATEGORIES = ['social_accounts', 'knowledge_packs', 'intelligence_packs', 'creative_commerce'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const VALID_STEP_TYPES = [
  'verify_requirements',
  'open_external',
  'instructions',
  'show_credentials_location',
  'paste_credentials',
  'test_connection',
  'success',
  'discovery',
  'oauth_connect',
];
const VALID_CONNECTION_TYPES = ['oauth', 'oauth_manual', 'api_key', 'app_password', 'none'];

const iconMap = Icons as unknown as Record<string, unknown>;

function collectIcons(pack: ConnectorPack): string[] {
  const out: string[] = [pack.icon];
  for (const c of pack.capabilities || []) out.push(c.icon);
  for (const c of pack.whatVimoLearns || []) out.push(c.icon);
  for (const c of pack.whatVimoGenerates || []) out.push(c.icon);
  for (const s of pack.steps || []) {
    for (const d of s.discoveryItems || []) out.push(d.icon);
  }
  if (pack.discoveredInfo) for (const d of pack.discoveredInfo.items) out.push(d.icon);
  if (pack.postConnectionValue) for (const m of pack.postConnectionValue.metrics) out.push(m.icon);
  return [...new Set(out.filter(Boolean))];
}

describe('pack catalog contract', () => {
  it('has unique ids and providers', () => {
    const ids = ALL_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_PACKS.length).toBeGreaterThan(0);
  });

  for (const pack of ALL_PACKS) {
    describe(`pack ${pack.id}`, () => {
      it('has complete metadata', () => {
        expect(pack.name.trim().length).toBeGreaterThan(0);
        expect(pack.description.trim().length).toBeGreaterThan(0);
        expect(pack.provider.trim().length).toBeGreaterThan(0);
        expect(VALID_CATEGORIES).toContain(pack.category);
        expect(VALID_DIFFICULTIES).toContain(pack.difficulty);
        expect(pack.estimatedSetupTime.trim().length).toBeGreaterThan(0);
        expect(VALID_CONNECTION_TYPES).toContain(pack.connectionType);
      });

      it('has a completable setup flow (non-empty steps, unique ids, valid types)', () => {
        expect(pack.steps.length).toBeGreaterThan(0);
        const stepIds = pack.steps.map((s) => s.id);
        expect(new Set(stepIds).size).toBe(stepIds.length);
        for (const step of pack.steps) {
          expect(VALID_STEP_TYPES).toContain(step.type);
          expect(step.title.trim().length).toBeGreaterThan(0);
        }
      });

      it('steps carry the payload their type renders', () => {
        for (const step of pack.steps) {
          if (step.type === 'paste_credentials' || step.type === 'show_credentials_location') {
            expect(
              step.credentialFields?.length || 0,
              `${pack.id}/${step.id}: credential step needs credentialFields`,
            ).toBeGreaterThan(0);
          }
          if (step.type === 'test_connection') {
            expect(
              step.testChecks?.length || 0,
              `${pack.id}/${step.id}: test step needs testChecks`,
            ).toBeGreaterThan(0);
          }
          if (step.type === 'open_external') {
            expect(
              step.externalUrl,
              `${pack.id}/${step.id}: external step needs externalUrl`,
            ).toBeTruthy();
          }
        }
      });

      it('help article links resolve', () => {
        const ids = new Set((pack.helpArticles || []).map((a) => a.id));
        for (const step of pack.steps) {
          for (const ref of step.helpArticleIds || []) {
            expect(ids.has(ref), `${pack.id}/${step.id}: unknown help article ${ref}`).toBe(true);
          }
        }
      });

      it('validation rules reference real credential fields', () => {
        const fields = new Set<string>();
        for (const step of pack.steps) {
          for (const f of step.credentialFields || []) fields.add(f.key);
        }
        for (const rule of pack.validationRules || []) {
          expect(fields.has(rule.field), `${pack.id}: rule for unknown field ${rule.field}`).toBe(true);
        }
      });

      it('every icon resolves to a real lucide component', () => {
        for (const name of collectIcons(pack)) {
          expect(iconMap[name], `${pack.id}: unknown icon "${name}"`).toBeTruthy();
          expect(resolveIcon(name)).toBe(iconMap[name]);
        }
      });

      it('success action routes are in-app paths', () => {
        for (const action of pack.successActions || []) {
          if (action.route) {
            expect(action.route.startsWith('/'), `${pack.id}: route must start with /`).toBe(true);
          }
        }
      });
    });
  }
});
