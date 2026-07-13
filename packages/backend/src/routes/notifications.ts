import { FastifyInstance } from 'fastify';
import { formatError } from '../lib/errorFormatter';
import { getRecentNotifications, getUnreadCount, markAllAsRead } from '../services/notificationService';

export default async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — get recent notifications + unread count
  app.get('/api/notifications', async (request, reply) => {
    try {
      const notifications = await getRecentNotifications(10);
      const unreadCount = await getUnreadCount();
      return reply.status(200).send({ notifications, unreadCount });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/notifications/read-all — mark all as read
  app.post('/api/notifications/read-all', async (request, reply) => {
    try {
      await markAllAsRead();
      return reply.status(200).send({ success: true });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
