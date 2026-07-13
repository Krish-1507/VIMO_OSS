/**
 * Brand Roast Routes
 *
 * GET  /api/roast/latest   — returns the most recent brand_roast for the active brand
 * POST /api/roast/generate — generates a fresh roast (may take up to 30s)
 */

import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { brandRoasts } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import { roastBrand } from '../services/brandRoastService';

export default async function roastRoutes(app: FastifyInstance) {
  // GET /api/roast/latest — returns the most recent roast for the brand profile
  app.get('/api/roast/latest', async (request, reply) => {
    try {
      const { brandProfileId } = request.query as { brandProfileId?: string };

      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }

      const latest = db
        .select()
        .from(brandRoasts)
        .where(eq(brandRoasts.brandProfileId, brandProfileId))
        .orderBy(desc(brandRoasts.createdAt))
        .all()[0] || null;

      if (!latest) {
        return reply.status(404).send({ error: 'No roast found for this brand' });
      }

      // Return parsed roast data
      const roastData = JSON.parse(latest.roastJson);
      return {
        ...roastData,
        roastId: latest.id,
        generatedAt: latest.createdAt,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/roast/generate — generates a fresh roast (long timeout)
  app.post('/api/roast/generate', {
    config: { timeout: 60000 },
  }, async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        websiteUrl?: string;
        instagramHandle?: string;
      };

      if (!body.brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }

      const result = await roastBrand({
        brandProfileId: body.brandProfileId,
        websiteUrl: body.websiteUrl,
        instagramHandle: body.instagramHandle,
      });

      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
