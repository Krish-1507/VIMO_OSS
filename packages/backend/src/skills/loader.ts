/**
 * Skills — reusable agent procedures shipped as markdown.
 *
 * A skill is a `.skill.md` file with YAML-ish frontmatter:
 *
 *   ---
 *   name: launch-post
 *   description: One-line summary shown to the agent.
 *   when_to_use: Trigger phrases and situations.
 *   ---
 *   # Body: the step-by-step procedure the agent follows.
 *
 * The assistant discovers skills with `list_skills` and executes one by
 * reading `use_skill` output and following it with its other tools. Lessons
 * the agent learns end up in brand memory via `save_lesson`, so skills get
 * sharper the longer they run — that is the "learns with you" loop.
 */
import fs from 'fs';
import path from 'path';

export interface SkillDefinition {
  name: string;
  description: string;
  whenToUse: string;
  body: string;
  source: string;
}

export function skillsDirectory(): string {
  // The .skill.md files sit next to this module in src/ AND are copied next
  // to its compiled output by the build script — so this resolves correctly
  // in dev (ts-node), production dist, and Docker alike.
  return __dirname;
}

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {};
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const block = raw.slice(3, end);
      body = raw.slice(end + 4).replace(/^\n/, '');
      for (const line of block.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          fields[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
      }
    }
  }
  return { fields, body: body.trim() };
}

/** Load every valid skill, sorted by name. Invalid files are skipped loudly. */
export function listSkills(dir?: string): SkillDefinition[] {
  const directory = dir || skillsDirectory();
  let files: string[] = [];
  try {
    files = fs.readdirSync(directory).filter((f) => f.endsWith('.skill.md')).sort();
  } catch (err) {
    console.warn('[skills] cannot read skills directory:', (err as Error).message);
    return [];
  }

  const skills: SkillDefinition[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(directory, file), 'utf8');
      const { fields, body } = parseFrontmatter(raw);
      const name = fields.name || file.replace(/\.skill\.md$/, '');
      if (!fields.description || !body) {
        console.warn(`[skills] skipping ${file}: needs description + body`);
        continue;
      }
      skills.push({
        name,
        description: fields.description,
        whenToUse: fields['when_to_use'] || '',
        body,
        source: file,
      });
    } catch (err) {
      console.warn(`[skills] skipping ${file}:`, (err as Error).message);
    }
  }
  return skills;
}

/** Full instructions for one skill, or null when unknown. */
export function getSkill(name: string, dir?: string): SkillDefinition | null {
  const found = listSkills(dir).find((s) => s.name === name.trim());
  return found || null;
}

/** Compact catalog for prompts and listings. */
export function skillsCatalog(dir?: string): Array<{ name: string; description: string; when_to_use: string }> {
  return listSkills(dir).map((s) => ({ name: s.name, description: s.description, when_to_use: s.whenToUse }));
}
