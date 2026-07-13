import { FastifyInstance } from 'fastify';
import { formatError } from '../lib/errorFormatter';
import { buildCanvaDeepLink, createDesignFromText } from '../connectors/handlers/canvaHandler';
import { db } from '../db';
import { connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';

export default async function canvaRoutes(app: FastifyInstance) {
  // GET /api/connectors/canva/design-url — get a Canva deep link or create a design
  app.get('/api/connectors/canva/design-url', async (request, reply) => {
    try {
      const { postContent, platform, brandProfileId } = request.query as {
        postContent?: string;
        platform?: string;
        brandProfileId?: string;
      };

      const headline = (postContent || '').slice(0, 100);
      const bodyText = (postContent || '').slice(0, 500);

      // Check if user has a Canva connector connected
      let isConnected = false;
      let canvaUrl = '';

      try {
        const allConnectors = await db.select().from(connectors)
          .where(eq(connectors.provider, 'canva')).all();
        const activeCanva = allConnectors.find((c) => c.status === 'active');

        if (activeCanva) {
          isConnected = true;
          const registry = new ConnectorRegistry(db);
          const config = await registry.getConfig(activeCanva.id);
          const accessToken = await credentialStore.getCredential(activeCanva.id, 'accessToken');

          if (accessToken) {
            const result = await createDesignFromText({
              accessToken,
              designTitle: headline || 'New Design',
              designType: platform === 'instagram' ? 'instagram_post' : 'instagram_post',
              brandColors: [],
              headline,
              bodyText,
            });
            canvaUrl = result.editUrl;
          } else {
            canvaUrl = buildCanvaDeepLink({
              platform: platform || 'instagram',
              headline,
              bodyText,
            });
          }
        } else {
          canvaUrl = buildCanvaDeepLink({
            platform: platform || 'instagram',
            headline,
            bodyText,
          });
        }
      } catch {
        canvaUrl = buildCanvaDeepLink({
          platform: platform || 'instagram',
          headline,
          bodyText,
        });
      }

      return reply.status(200).send({ canvaUrl, isConnected });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
