/**
 * Skills — discoverable agent procedures that sharpen with use.
 *
 * Skills ship as `.skill.md` files (frontmatter + steps) and load with zero
 * dependencies, in dev and in dist alike. These tests lock in: the shipped
 * catalog parses, unknown skills resolve to null (never throw), and the
 * learning loop (`save_lesson` persistence shape) matches the real schema.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { listSkills, getSkill, skillsCatalog } from '../skills/loader';
import { db } from '../db';
import { marketingMemory } from '../db/schema';
import { eq } from 'drizzle-orm';

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

describe('skills loader', () => {
  it('loads the shipped catalog with names, triggers, and bodies', () => {
    const skills = listSkills(SKILLS_DIR);
    expect(skills.length).toBeGreaterThanOrEqual(5);
    const names = skills.map((s) => s.name);
    for (const expected of ['launch-post', 'pillar-plan', 'winner-repurpose', 'brand-roast-fix', 'weekly-review']) {
      expect(names).toContain(expected);
    }
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(10);
      expect(skill.body.length).toBeGreaterThan(50);
    }
  });

  it('returns full instructions for a known skill', () => {
    const skill = getSkill('launch-post', SKILLS_DIR);
    expect(skill).not.toBeNull();
    expect(skill?.body).toMatch(/schedule_post/);
  });

  it('returns null (never throws) for unknown skills', () => {
    expect(getSkill('does-not-exist', SKILLS_DIR)).toBeNull();
    expect(getSkill('  ', SKILLS_DIR)).toBeNull();
  });

  it('exposes a compact catalog for prompts', () => {
    const catalog = skillsCatalog(SKILLS_DIR);
    expect(catalog[0]).toHaveProperty('name');
    expect(catalog[0]).toHaveProperty('description');
    expect(catalog[0]).toHaveProperty('when_to_use');
    expect((catalog[0] as any).body).toBeUndefined();
  });
});

describe('learning loop persistence shape', () => {
  it('stores a lesson the way save_lesson does', async () => {
    const now = new Date().toISOString();
    const id = `lesson-test-${Date.now()}`;
    await db
      .insert(marketingMemory)
      .values({
        id,
        brandProfileId: 'brand-skills-test',
        entryType: 'lesson',
        entryDate: now.split('T')[0],
        weekLabel: 'test-week',
        summary: 'Hooks with numbers beat hooks with questions for this audience.',
        metrics: null,
        sentiment: 'neutral',
        tags: 'skill,learning',
        linkedEntityId: null,
        linkedEntityType: 'skill',
        lessonsJson: null,
        createdAt: now,
      })
      .run();
    const row = db.select().from(marketingMemory).where(eq(marketingMemory.id, id)).get();
    expect(row?.summary).toContain('Hooks with numbers');
    db.delete(marketingMemory).where(eq(marketingMemory.id, id)).run();
  });
});
