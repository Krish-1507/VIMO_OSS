import { FastifyInstance } from 'fastify';
import { formatError } from '../lib/errorFormatter';
import { generateReelsScript, type ReelsDuration, type ReelsStyle } from '../services/reelsScriptService';

export default async function reelsScriptRoutes(app: FastifyInstance) {
  // POST /api/content/reels-script — generate a Reels script
  app.post('/api/content/reels-script', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        topic: string;
        targetDuration: number;
        reelsStyle: string;
      };

      if (!body.brandProfileId || !body.topic) {
        return reply.status(400).send({ error: 'brandProfileId and topic are required.' });
      }

      const validDurations = [15, 30, 60, 90];
      const duration = validDurations.includes(body.targetDuration)
        ? (body.targetDuration as ReelsDuration)
        : 30;

      const validStyles: ReelsStyle[] = ['talking_head', 'slideshow', 'tutorial', 'trending_audio'];
      const style = validStyles.includes(body.reelsStyle as ReelsStyle)
        ? (body.reelsStyle as ReelsStyle)
        : 'talking_head';

      const script = await generateReelsScript({
        brandProfileId: body.brandProfileId,
        topic: body.topic,
        targetDuration: duration,
        reelsStyle: style,
      });

      return reply.status(200).send(script);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
