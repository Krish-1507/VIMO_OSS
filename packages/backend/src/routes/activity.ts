import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { directorSessions, marketingMemory, scheduledPosts } from '../db/schema';
import { autopilotSessions } from '../db/schema';
import { getEffectiveBrandProfileId } from '../services/brandBrainService';
import { formatError } from '../lib/errorFormatter';

/* ------------------------------------------------------------------ */
/*  Transparency activity feed                                        */
/* ------------------------------------------------------------------ */

export interface ActivityItem {
  id: string;
  kind: 'research' | 'strategy' | 'content' | 'publish' | 'engagement' | 'director' | 'autopilot' | 'lesson' | 'milestone';
  title: string;
  description: string;
  /** Plain-language reason VIMO took (or recommends) this action. */
  why?: string;
  timestamp: string;
  status?: 'done' | 'planned' | 'monitoring';
}

const DIRECTOR_ACTION_LABEL: Record<string, string> = {
  research: 'Researched trends',
  analyze: 'Analyzed performance',
  create_content: 'Drafted content',
  engage: 'Engaged your audience',
  approve: 'Queued for your approval',
  schedule: 'Scheduled posts',
  capitalise_trend: 'Spotted a trend to ride',
  monitor: 'Monitoring results',
};

function directorKind(category: string): ActivityItem['kind'] {
  switch (category) {
    case 'research': return 'research';
    case 'analyze': return 'strategy';
    case 'create_content': return 'content';
    case 'engage': return 'engagement';
    case 'schedule': return 'publish';
    default: return 'director';
  }
}

const MEMORY_LABEL: Record<string, { kind: ActivityItem['kind']; title: (s: string) => string }> = {
  post_published: { kind: 'publish', title: () => 'Published a post' },
  campaign_started: { kind: 'strategy', title: () => 'Started a campaign' },
  campaign_completed: { kind: 'strategy', title: () => 'Completed a campaign' },
  follower_milestone: { kind: 'milestone', title: () => 'Reached a follower milestone' },
  engagement_spike: { kind: 'engagement', title: () => 'Engagement spike detected' },
  trend_capitalized: { kind: 'director', title: () => 'Capitalized on a trend' },
  lesson_learned: { kind: 'lesson', title: (s) => `Lesson learned: ${s}` },
  strategy_shift: { kind: 'strategy', title: () => 'Adjusted the strategy' },
  director_insight: { kind: 'director', title: () => 'Marketing Director insight' },
};

export default async function activityRoutes(app: FastifyInstance) {
  app.get('/api/activity', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string; limit?: string };
      const brandProfileId = await getEffectiveBrandProfileId(query.brandProfileId);
      const limit = Math.min(parseInt(query.limit || '40', 10), 200);

      const items: ActivityItem[] = [];

      // 1) Director sessions — recommended actions with their "why".
      const sessions = await db
        .select()
        .from(directorSessions)
        .where(eq(directorSessions.brandProfileId, brandProfileId))
        .orderBy(desc(directorSessions.createdAt))
        .limit(5)
        .all();

      for (const s of sessions) {
        let actions: any[] = [];
        try {
          actions = s.recommendedActionsJson ? JSON.parse(s.recommendedActionsJson) : [];
        } catch { /* ignore */ }

        for (const a of actions) {
          items.push({
            id: `director-${s.id}-${a.id}`,
            kind: directorKind(a.category),
            title: DIRECTOR_ACTION_LABEL[a.category] || a.title || 'Recommended action',
            description: a.title || '',
            why: a.reasoning || a.explanation || a.estimatedImpact,
            timestamp: s.createdAt,
            status: 'done',
          });
        }

        if (s.directorSummary) {
          items.push({
            id: `director-summary-${s.id}`,
            kind: 'director',
            title: 'Marketing Director briefing',
            description: s.directorSummary,
            timestamp: s.createdAt,
            status: 'done',
          });
        }
      }

      // 2) Memory timeline — every recorded event.
      const memory = await db
        .select()
        .from(marketingMemory)
        .where(eq(marketingMemory.brandProfileId, brandProfileId))
        .orderBy(desc(marketingMemory.entryDate))
        .limit(limit)
        .all();

      for (const m of memory) {
        const meta = MEMORY_LABEL[m.entryType] || { kind: 'director' as const, title: (s: string) => s };
        let lessons: string[] = [];
        try {
          lessons = m.lessonsJson ? JSON.parse(m.lessonsJson) : [];
        } catch { /* ignore */ }
        items.push({
          id: `memory-${m.id}`,
          kind: meta.kind,
          title: (meta.title as any)(m.summary),
          description: m.summary,
          why: lessons.length > 0 ? lessons.join(' ') : undefined,
          timestamp: m.entryDate,
          status: 'done',
        });
      }

      // 3) Published posts from the scheduler (real, dated activity).
      const posts = await db
        .select()
        .from(scheduledPosts)
        .where(eq(scheduledPosts.brandProfileId, brandProfileId))
        .orderBy(desc(scheduledPosts.scheduledAt))
        .limit(limit)
        .all();

      for (const p of posts) {
        if (p.status !== 'published' && p.status !== 'scheduled') continue;
        items.push({
          id: `post-${p.id}`,
          kind: p.status === 'scheduled' ? 'publish' : 'publish',
          title: p.status === 'scheduled' ? 'Scheduled a post' : 'Published a post',
          description: (p.content || '').slice(0, 140),
          timestamp: p.scheduledAt,
          status: p.status === 'scheduled' ? 'planned' : 'done',
        });
      }

      // 4) Live autopilot session — surface the structured, explainable
      //    timeline (with the "why") when available, else fall back to the log.
      const live = await db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.brandProfileId, brandProfileId))
        .orderBy(desc(autopilotSessions.createdAt))
        .limit(1)
        .all();

      if (live.length > 0) {
        const a = live[0];
        const isLive = a.status !== 'completed' && a.status !== 'failed';

        let timeline: any[] = [];
        try {
          timeline = a.timelineJson ? JSON.parse(a.timelineJson) : [];
        } catch { /* ignore */ }

        if (timeline.length > 0) {
          const actionToKind: Record<string, ActivityItem['kind']> = {
            validate: 'autopilot',
            research: 'research',
            strategy: 'strategy',
            content: 'content',
            schedule: 'publish',
            engage: 'engagement',
            monitor: 'autopilot',
            checkpoint: 'autopilot',
            error: 'autopilot',
          };
          timeline.slice(-12).forEach((entry: any, i: number) => {
            items.push({
              id: `autopilot-${a.id}-${entry.id || i}`,
              kind: actionToKind[entry.action] || 'autopilot',
              title: entry.title || 'Autopilot',
              description: entry.detail || entry.title || '',
              why: entry.why,
              timestamp: entry.timestamp || a.createdAt,
              status: entry.status === 'failed' ? 'done' : (isLive ? 'monitoring' : 'done'),
            });
          });
        } else {
          let log: string[] = [];
          try {
            log = a.logJson ? JSON.parse(a.logJson) : [];
          } catch { /* ignore */ }
          log.slice(-12).forEach((entry: string, i: number) => {
            items.push({
              id: `autopilot-${a.id}-${i}`,
              kind: 'autopilot',
              title: 'Autopilot',
              description: entry,
              timestamp: a.createdAt,
              status: isLive ? 'monitoring' : 'done',
            });
          });
        }
      }

      // Sort newest first.
      items.sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime());

      return { items: items.slice(0, limit) };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
