import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import path from 'path';
import { eq } from 'drizzle-orm';
import { sanitizeUserInput } from '../lib/promptSanitizer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vectordb = require('vectordb');
import { db } from '../db';
import { brandProfiles, appSettings } from '../db/schema';

const VECTOR_DB_DIR = path.resolve(process.cwd(), './data/vectors');

export async function getEffectiveBrandProfileId(brandProfileId?: string): Promise<string> {
  if (brandProfileId) return brandProfileId;
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'defaultBrandId')).get();
  if (row?.value) return row.value;
  
  // Last resort: first brand profile
  const first = await db.select().from(brandProfiles).limit(1).get();
  if (first) return first.id;
  
  throw new Error('No brand profile specified and no default set.');
}

type BrandProfile = {
  id: string;
  name: string;
  industry: string;
  audience: string;
  toneKeywords: string[];
  examplePosts: string[];
  voiceFingerprint?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function buildPrompt(profile: BrandProfile): Promise<string> {
  const tone = profile.toneKeywords.map(sanitizeUserInput).join(', ');
  const examples = profile.examplePosts
    .map((p, idx) => `Post ${idx + 1}: ${sanitizeUserInput(p)}`)
    .join('\n');
  return [
    'You are a brand voice analyst. Analyze the following brand information and example posts, then produce a detailed brand voice fingerprint as a JSON object.',
    `Brand Name: ${sanitizeUserInput(profile.name)}`,
    `Industry: ${sanitizeUserInput(profile.industry)}`,
    `Target Audience: ${sanitizeUserInput(profile.audience)}`,
    `Tone Keywords: ${tone}`,
    'Example Posts:',
    examples,
    "Return ONLY valid JSON with these fields: writingStyle (string, 2-3 sentences describing how this brand writes), sentenceStructure (string, describes typical sentence length and structure), vocabularyLevel (enum: 'simple' | 'professional' | 'technical' | 'mixed'), emojiUsage (enum: 'none' | 'minimal' | 'moderate' | 'heavy'), punctuationStyle (string), commonPhrases (array of up to 5 phrases characteristic of this brand), thingsToAvoid (array of up to 5 things this brand should never say or do), channelVariants (object with keys 'linkedin', 'instagram', 'twitter', 'tiktok', each describing how the tone shifts for that platform).",
  ].join('\n');
}

export async function generateVoiceFingerprint(profile: BrandProfile): Promise<string> {
  try {
    const text = await callWithProviderChain(
      'brand voice analysis',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt: await buildPrompt(profile),
        });
        return t;
      },
      () => {
        // Fallback: generate a minimal fingerprint from profile data
        return JSON.stringify({
          writingStyle: `${profile.name} creates content for ${profile.audience} in the ${profile.industry} industry.`,
          sentenceStructure: 'Mixed sentence lengths with engaging hooks.',
          vocabularyLevel: 'professional',
          emojiUsage: 'moderate',
          punctuationStyle: 'Standard with occasional emphasis.',
          commonPhrases: profile.toneKeywords.slice(0, 3).map(k => `Related to ${k}`),
          thingsToAvoid: ['Being too generic', 'Over-promising', 'Ignoring the audience', 'Inconsistent posting', 'Keyword stuffing'],
          channelVariants: {
            linkedin: 'Professional and educational',
            instagram: 'Visual and conversational',
            twitter: 'Concise and punchy',
            tiktok: 'Casual and trend-aware',
          },
        });
      }
    );
    const parsed = JSON.parse(text.trim());
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({
      writingStyle: `${profile.name} creates content for ${profile.audience} in the ${profile.industry} industry.`,
      sentenceStructure: 'Mixed sentence lengths.',
      vocabularyLevel: 'professional',
      emojiUsage: 'moderate',
      punctuationStyle: 'Standard.',
      commonPhrases: [],
      thingsToAvoid: ['Being too generic'],
      channelVariants: { linkedin: 'Professional', instagram: 'Visual', twitter: 'Concise', tiktok: 'Casual' },
    });
  }
}

function getTableName(brandProfileId: string) {
  return `brand_examples_${brandProfileId}`;
}

export async function initVectorStore(brandProfileId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqliteVec: any = await (vectordb as unknown as { connect: (dir: string) => Promise<unknown> }).connect(VECTOR_DB_DIR);
  const tableName = getTableName(brandProfileId);
  try {
    await sqliteVec.table(tableName);
  } catch (e) {
    await sqliteVec.createTable(tableName, [
      { name: 'id' },
      { name: 'text' },
      { name: 'vector', dimension: 1536 },
    ]);
  }
}

function escapeDoubleQuotes(text: string): string {
  return text.replace(/"/g, '\\"');
}

async function createEmbedding(text: string): Promise<number[]> {
  const embedPrompt = `Convert the following text into a JSON array of 1536 numbers (approximate dense embedding for semantic retrieval). Only output the JSON array, nothing else.
Text: "${escapeDoubleQuotes(text)}"`;
  const raw = await callWithProviderChain(
    'brand voice analysis',
    async (provider, modelId) => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt: embedPrompt,
      });
      return t;
    },
    () => JSON.stringify(new Array(1536).fill(0).map((_, i) => Math.sin(text.length + i * 0.5) * 0.1))
  );
  let vector: number[];
  try {
    const arr = JSON.parse(raw.trim());
    if (!Array.isArray(arr)) throw new Error('not an array');
    vector = arr.map((v) => (typeof v === 'number' ? v : parseFloat(v) || 0));
    if (vector.length < 1536) {
      vector = [...vector, ...new Array(1536 - vector.length).fill(0)];
    } else if (vector.length > 1536) {
      vector = vector.slice(0, 1536);
    }
  } catch {
    vector = new Array(1536).fill(0).map((_, i) => Math.sin(text.length + i * 0.5) * 0.1);
  }
  return vector;
}

export async function addExampleToVectorStore(brandProfileId: string, examplePost: string): Promise<void> {
  const vector = await createEmbedding(examplePost);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqliteVec: any = await (vectordb as unknown as { connect: (dir: string) => Promise<unknown> }).connect(VECTOR_DB_DIR);
  const tableName = getTableName(brandProfileId);
  let tbl;
  try {
    tbl = await sqliteVec.table(tableName);
  } catch {
    await initVectorStore(brandProfileId);
    tbl = await sqliteVec.table(tableName);
  }

  await tbl.add([{ id: randomUUID(), text: examplePost, vector }]);
}

export async function getRelevantExamples(brandProfileId: string, topic: string, limit = 3): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqliteVec: any = await (vectordb as unknown as { connect: (dir: string) => Promise<unknown> }).connect(VECTOR_DB_DIR);
  const tableName = getTableName(brandProfileId);
  let tbl;
  try {
    tbl = await sqliteVec.table(tableName);
  } catch {
    return [];
  }

  const vector = await createEmbedding(topic);

  try {
    const results = await tbl.vectorSearch(vector).limit(limit).toArray();
    if (!results || results.length === 0) return [];
    return results.map((r: { text?: string }) => r.text || '').filter(Boolean);
  } catch {
    return [];
  }
}

export async function buildBrandContext(brandProfileId: string, topic: string): Promise<string> {
  const row = await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
  if (!row) {
    throw new Error(`Brand profile ${brandProfileId} not found`);
  }

  const sanitizedTopic = sanitizeUserInput(topic);
  const examples = await getRelevantExamples(brandProfileId, sanitizedTopic);

  const exampleText = examples.map((e, i) => `Example ${i + 1}: ${sanitizeUserInput(e)}`).join('\n');
  return [
    'BRAND VOICE PROFILE:',
    `Name: ${sanitizeUserInput(row.name)}`,
    `Audience: ${sanitizeUserInput(row.audience)}`,
    `Tone: ${row.toneKeywordsJson}`,
    `Voice Fingerprint: ${row.voiceFingerprint || 'N/A'}`,
    'RELEVANT EXAMPLE POSTS (write in a similar style to these):',
    exampleText,
  ].join('\n');
}
