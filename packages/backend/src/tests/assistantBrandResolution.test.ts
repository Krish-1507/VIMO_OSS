/**
 * Assistant brand resolution — the agent must act on the ACTIVE brand.
 *
 * The motto is a conversational Marketing Agent. Before this fix the chat
 * endpoint silently used the first brand row for every user, so multi-brand
 * users got advice and actions for the wrong business. This test locks in
 * the priority: explicit choice → Default Brand (Settings) → first brand,
 * with stale ids falling through instead of 400ing.
 *
 * Real in-memory DB, no mocks — the resolver under test is VIMO's own code.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, brandProfiles } from '../db/schema';
import { resolveActiveBrand } from '../routes/assistant';

const NOW = () => new Date().toISOString();

function seedBrand(id: string, name: string) {
  db.insert(brandProfiles)
    .values({
      id,
      name,
      industry: 'Software',
      audience: 'Marketers',
      toneKeywordsJson: JSON.stringify(['bold']),
      examplePostsJson: JSON.stringify([]),
      createdAt: NOW(),
      updatedAt: NOW(),
    })
    .run();
}

function setDefaultBrand(id: string | null) {
  db.delete(appSettings).where(eq(appSettings.key, 'defaultBrandId')).run();
  if (id !== null) {
    db.insert(appSettings).values({ key: 'defaultBrandId', value: id, updatedAt: NOW() }).run();
  }
}

describe('resolveActiveBrand', () => {
  beforeEach(() => {
    db.delete(appSettings).where(eq(appSettings.key, 'defaultBrandId')).run();
    db.delete(brandProfiles).run();
    seedBrand('brand-a', 'Alpha');
    seedBrand('brand-b', 'Beta');
    setDefaultBrand('brand-a');
  });

  it('prefers the explicit caller choice over the Default Brand', async () => {
    const brand = await resolveActiveBrand('brand-b');
    expect(brand?.id).toBe('brand-b');
  });

  it('falls back to the Default Brand when no id is given', async () => {
    const brand = await resolveActiveBrand();
    expect(brand?.id).toBe('brand-a');
  });

  it('falls through on a stale id instead of failing', async () => {
    const brand = await resolveActiveBrand('deleted-long-ago');
    expect(brand?.id).toBe('brand-a');
  });

  it('falls back to the first brand when no Default Brand is set', async () => {
    setDefaultBrand(null);
    const brand = await resolveActiveBrand();
    expect(brand?.id).toBe('brand-a');
  });

  it('ignores a Default Brand that no longer exists', async () => {
    setDefaultBrand('ghost-brand');
    const brand = await resolveActiveBrand();
    expect(brand?.id).toBe('brand-a');
  });

  it('returns null when no brands exist', async () => {
    db.delete(brandProfiles).run();
    const brand = await resolveActiveBrand();
    expect(brand).toBeNull();
  });
});
