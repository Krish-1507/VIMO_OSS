/**
 * Brand Roast Service — brutal-but-constructive analysis of a brand's marketing
 *
 * Analyses the brand profile, recent posts, campaigns, competitors, and optional
 * website content to generate a comprehensive roast with actionable fixes.
 */

import crypto from 'crypto';
import { generateText } from 'ai';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles, scheduledPosts, campaigns, brandRoasts, competitorProfiles, competitorSnapshots } from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';

/* ------------------------------------------------------------------ */
/*  TypeScript Interfaces                                              */
/* ------------------------------------------------------------------ */

export interface RoastItem {
  problem: string;
  severity: 'brutal' | 'bad' | 'fixable';
  fix: string;
  example: string;
}

export interface BrandRoast {
  roastId: string;
  brandName: string;
  overallScore: number;
  positioningProblems: RoastItem[];
  messagingProblems: RoastItem[];
  contentProblems: RoastItem[];
  competitorGaps: RoastItem[];
  funnelProblems: RoastItem[];
  quickWins: string[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helper — strip HTML tags from a string                             */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/*  roastBrand — the main roast function                               */
/* ------------------------------------------------------------------ */

export async function roastBrand(params: {
  brandProfileId: string;
  websiteUrl?: string;
  instagramHandle?: string;
}): Promise<BrandRoast> {
  const { brandProfileId, websiteUrl } = params;

  // --- Step 1: Load the full brand profile ---
  const profile = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  if (!profile) {
    throw new Error(`Brand profile ${brandProfileId} not found`);
  }

  const toneKeywords = profile.toneKeywordsJson || '[]';

  // --- Step 2: Load last 20 published posts ---
  const posts = db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.brandProfileId, brandProfileId))
    .orderBy(desc(scheduledPosts.createdAt))
    .all()
    .filter((p) => p.status === 'published')
    .slice(0, 20);

  const postPreviews = posts
    .map((p) => {
      const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
      const perf = meta.performance || {};
      return `[${p.platform}] "${p.content.slice(0, 120)}..." (engagement: ${perf.engagementRate || 'N/A'}%)`;
    })
    .join('\n');

  // --- Step 3: Load last 3 campaigns ---
  const campaignRows = db
    .select()
    .from(campaigns)
    .where(eq(campaigns.brandProfileId, brandProfileId))
    .orderBy(desc(campaigns.createdAt))
    .all()
    .slice(0, 3);

  const campaignSummary = campaignRows
    .map((c) => `Campaign: ${c.name} (goal: ${c.goal}, status: ${c.status})`)
    .join('\n');

  // --- Step 4: Load all competitor profiles and their latest snapshots ---
  const competitors = db
    .select()
    .from(competitorProfiles)
    .where(eq(competitorProfiles.brandProfileId, brandProfileId))
    .all();

  const competitorData = competitors
    .map((comp) => {
      const snap = db
        .select()
        .from(competitorSnapshots)
        .where(eq(competitorSnapshots.competitorProfileId, comp.id))
        .orderBy(desc(competitorSnapshots.createdAt))
        .all()[0] || null;
      return `${comp.competitorName} (@${comp.platformHandle}) — Followers: ${comp.followersCount || 'N/A'}${snap ? `, Theme: ${snap.topContentTheme || 'N/A'}` : ''}`;
    })
    .join('\n');

  // --- Step 5: Fetch website content if provided ---
  let websiteContent = '';
  if (websiteUrl) {
    try {
      const response = await fetch(websiteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VIMOBrandRoast/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await response.text();
      websiteContent = stripHtml(html).slice(0, 3000);
    } catch {
      websiteContent = 'Could not fetch website content.';
    }
  }

  // --- Step 6: Call the LLM ---
  const prompt = `You are a brutally honest marketing consultant who has seen thousands of brands succeed and fail. You are about to roast this brand's marketing with the kind of honest feedback that expensive consultants charge $10,000 for. Be direct. Be specific. Be brutal where brutal is warranted. But also be constructive — every problem must have a specific fix. Never be vague.

Brand: ${profile.name}.
Industry: ${profile.industry}.
Audience: ${profile.audience}.
Their stated tone:${toneKeywords}.
Their last 20 posts (content previews):
${postPreviews || 'No published posts yet.'}

Their campaign history:
${campaignSummary || 'No campaigns yet.'}

Their competitors:
${competitorData || 'No competitors tracked yet.'}

Website content (if available):
${websiteContent || 'Not provided.'}

Analyze and return ONLY valid JSON matching this structure exactly:
{
  overallScore: number (0-100 where 0 means their marketing is genuinely terrible and 100 means they are already world class — be honest, most brands score 30-60),
  positioningProblems: array of RoastItem,
  messagingProblems: array of RoastItem,
  contentProblems: array of RoastItem,
  competitorGaps: array of RoastItem,
  funnelProblems: array of RoastItem,
  quickWins: array of 5 strings each being a specific action they could take this week to immediately improve
}

For each RoastItem:
  problem (specific, not generic — name actual posts or actual patterns you observed),
  severity ("brutal" if it is actively hurting them, "bad" if it is a clear weakness, "fixable" if it is minor),
  fix (exactly what to do — specific and actionable),
  example (a concrete example of what good looks like for this exact brand)

Generate at least 2 items per problem category. Do not hold back.`;

  const text = await callWithProviderChain(
    'brand roast',
    async (provider, modelId) => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => JSON.stringify({
      overallScore: 45,
      positioningProblems: [
        { problem: 'Brand positioning is unclear and generic', severity: 'bad', fix: 'Define a specific niche angle that differentiates you from competitors', example: 'Instead of "marketing agency", position as "growth partner for B2B SaaS companies" ' },
        { problem: 'No unique value proposition visible in recent content', severity: 'fixable', fix: 'Lead every post with what makes your brand different, not just what you do', example: 'Start posts with "We help X achieve Y by doing Z differently" ' },
      ],
      messagingProblems: [
        { problem: 'Messaging is inconsistent across platforms', severity: 'bad', fix: 'Create a messaging framework document that all content adheres to', example: 'Define 3 brand pillars and ensure every post maps to one of them' },
        { problem: 'Too much jargon, not enough benefit-driven language', severity: 'fixable', fix: 'Rewrite headlines to focus on customer outcomes, not features', example: 'Change "Our AI-powered platform" to "Save 10 hours a week on content" ' },
      ],
      contentProblems: [
        { problem: 'Content lacks hooks — posts blend into the feed', severity: 'brutal', fix: 'Start every post with a bold promise, question, or statistic', example: '"Most founders waste 20 hours a week on content. Here is the fix." ' },
        { problem: 'Not enough variety in content formats', severity: 'fixable', fix: 'Rotate between carousels, videos, text posts, and polls each week', example: 'Schedule: Mon (carousel), Wed (video tip), Fri (text insight), Sun (poll)' },
      ],
      competitorGaps: [
        { problem: 'Competitors are posting more frequently and with better hooks', severity: 'bad', fix: 'Increase posting frequency to at least 5x per week with a content calendar', example: 'Study competitor X who posts daily and gets 2x your engagement' },
        { problem: 'No counter-positioning against competitors', severity: 'fixable', fix: 'Identify what competitors are NOT doing and dominate that space', example: 'If competitors focus on Instagram, dominate LinkedIn instead' },
      ],
      funnelProblems: [
        { problem: 'No clear call-to-action in most posts', severity: 'brutal', fix: 'End every post with a specific, low-friction CTA', example: '"Comment your biggest challenge and I will reply with a custom fix" ' },
        { problem: 'No lead magnet or conversion path from content', severity: 'bad', fix: 'Create a free resource related to your content and link it in bio', example: '"Download our free 30-day content plan — link in bio" ' },
      ],
      quickWins: [
        'Rewrite your bio to clearly state what you do and who it is for within 3 seconds',
        'Add a specific CTA to your next 5 posts and track click-through rate',
        'Comment on 10 posts from your target audience today to drive initial engagement',
        'Create a simple lead magnet (checklist or template) and add it to your bio link',
        'Audit your last 10 posts and rewrite the hooks using patterns from top performers in your niche',
      ],
    })
  );

  const cleanJson = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleanJson);

  const roastId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Store the roast in the database
  await db.insert(brandRoasts).values({
    id: roastId,
    brandProfileId,
    roastJson: JSON.stringify(parsed),
    overallScore: parsed.overallScore,
    createdAt: now,
  });

  return {
    roastId,
    brandName: profile.name,
    overallScore: parsed.overallScore,
    positioningProblems: parsed.positioningProblems || [],
    messagingProblems: parsed.messagingProblems || [],
    contentProblems: parsed.contentProblems || [],
    competitorGaps: parsed.competitorGaps || [],
    funnelProblems: parsed.funnelProblems || [],
    quickWins: parsed.quickWins || [],
    generatedAt: now,
  };
}
