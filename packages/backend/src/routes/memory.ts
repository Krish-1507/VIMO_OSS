import { FastifyInstance } from 'fastify';
import {
  getTimeline,
  getWeeklyGroupedTimeline,
  generateMemoryInsight,
} from '../services/memoryTimelineService';
import { formatError } from '../lib/errorFormatter';

export default async function memoryRoutes(app: FastifyInstance) {
  // GET /api/memory/timeline — returns the filtered timeline
  app.get('/api/memory/timeline', async (request, reply) => {
    try {
      const query = request.query as {
        brandProfileId: string;
        limit?: string;
        entryTypes?: string;
        fromDate?: string;
        toDate?: string;
      };

      if (!query.brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }

      const entryTypes = query.entryTypes
        ? query.entryTypes.split(',').map((t) => t.trim()) as any[]
        : undefined;

      const timeline = await getTimeline({
        brandProfileId: query.brandProfileId,
        limit: query.limit ? parseInt(query.limit, 10) : 100,
        entryTypes,
        fromDate: query.fromDate,
        toDate: query.toDate,
      });

      return { timeline };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/memory/weekly — returns the weekly grouped timeline
  app.get('/api/memory/weekly', async (request, reply) => {
    try {
      const query = request.query as {
        brandProfileId: string;
        weeksBack?: string;
      };

      if (!query.brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }

      const weeksBack = query.weeksBack ? parseInt(query.weeksBack, 10) : 12;
      const weekly = await getWeeklyGroupedTimeline(query.brandProfileId, weeksBack);

      return { weekly };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/memory/insight — generate an insight from the timeline
  app.post('/api/memory/insight', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        question: string;
      };

      if (!body.brandProfileId || !body.question) {
        return reply.status(400).send({ error: 'brandProfileId and question are required' });
      }

      const insight = await generateMemoryInsight(body.brandProfileId, body.question);

      return { insight };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
