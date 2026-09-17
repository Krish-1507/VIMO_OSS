/**
 * CMO playbooks + brand-aware creative briefs.
 *
 * Playbooks encode how top operators think (pillars, hooks, social search,
 * winner loops, cadence, signal metrics) as data the Director and assistant
 * reason over. The creative builder turns raw ideas into directed visual
 * briefs (brand DNA + craft + anti-slop negatives + platform sizing).
 * Pure logic + real in-memory DB reads — no network anywhere.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';
import {
  listPlaybooks,
  getPlaybook,
  buildPlaybookBlock,
} from '../services/cmoPlaybooks';
import { buildCreativePrompt } from '../services/creativeBriefService';

const BRAND = 'brand_creative_test';

function seedBrand(dna: unknown): void {
  db.delete(brandProfiles).where(eq(brandProfiles.id, BRAND)).run();
  const now = new Date().toISOString();
  db.insert(brandProfiles)
    .values({
      id: BRAND,
      name: 'Northwind Coffee',
      industry: 'Food & Beverage',
      audience: 'Commuters',
      toneKeywordsJson: JSON.stringify(['warm', 'bold']),
      examplePostsJson: JSON.stringify([]),
      contentDNA: typeof dna === 'string' ? dna : JSON.stringify(dna),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe('cmoPlaybooks', () => {
  it('ships a full operator curriculum', () => {
    const list = listPlaybooks();
    expect(list.length).toBeGreaterThanOrEqual(10);
    const ids = list.map((p) => p.id);
    for (const expected of [
      'rule-of-two',
      'pillars',
      'hooks',
      'social-search',
      'cta-every-post',
      'winner-loop',
      'seventy-thirty',
      'response-speed',
      'cadence',
      'signal-metrics',
      'authentic-voice',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('matches topics by id, name, and keywords', () => {
    expect(getPlaybook('pillars')?.name).toMatch(/pillar/i);
    expect(getPlaybook('how often should I post')?.id).toBe('cadence');
    expect(getPlaybook('hook retention video')?.id).toBe('hooks');
  });

  it('returns null for empty or unmatched topics', () => {
    expect(getPlaybook('')).toBeNull();
    expect(getPlaybook('   ')).toBeNull();
    expect(getPlaybook('xyzzy quantum teapot') ).toBeNull();
  });

  it('builds a compact Director prompt block naming every playbook', () => {
    const block = buildPlaybookBlock();
    expect(block).toMatch(/ground at least one opportunity/i);
    for (const p of listPlaybooks()) {
      expect(block).toContain(p.name);
    }
  });
});

describe('buildCreativePrompt', () => {
  beforeEach(() => {
    seedBrand({
      brandAesthetic: 'cozy urban minimalism',
      toneOfVoice: 'warm and a little cheeky',
      colors: { primary: '#6F4E37', secondary: '#F5F0E8' },
      visualStyleKeywords: ['morning light', 'ceramic', 'steam'],
    });
  });

  it('injects brand DNA, craft, negatives, and platform sizing', () => {
    const brief = buildCreativePrompt({
      brandProfileId: BRAND,
      prompt: 'a barista pouring latte art',
      platform: 'tiktok',
      style: 'authentic',
    });
    expect(brief.platform).toBe('tiktok');
    expect(brief.width).toBe(1080);
    expect(brief.height).toBe(1920);
    expect(brief.prompt).toContain('a barista pouring latte art');
    expect(brief.prompt).toContain('#6F4E37');
    expect(brief.prompt).toContain('cozy urban minimalism');
    expect(brief.prompt).toContain('morning light');
    expect(brief.prompt).toMatch(/garbled|watermark/i);
    expect(brief.prompt).toMatch(/candid|smartphone|natural light/i);
  });

  it('switches craft direction by style', () => {
    const minimal = buildCreativePrompt({ brandProfileId: BRAND, prompt: 'new seasonal menu', style: 'minimal' });
    const bold = buildCreativePrompt({ brandProfileId: BRAND, prompt: 'new seasonal menu', style: 'bold' });
    expect(minimal.prompt).toMatch(/whitespace|minimal/i);
    expect(bold.prompt).toMatch(/high-contrast|dramatic/i);
    expect(minimal.prompt).not.toBe(bold.prompt);
  });

  it('passes through safely with no brand or corrupt DNA', () => {
    const orphan = buildCreativePrompt({ prompt: 'just an idea' });
    expect(orphan.prompt).toContain('just an idea');
    expect(orphan.width).toBe(1080);
    expect(orphan.height).toBe(1350);

    seedBrand('{{{not json');
    const corrupt = buildCreativePrompt({ brandProfileId: BRAND, prompt: 'just an idea' });
    expect(corrupt.prompt).toContain('just an idea');
  });
});
