import { FastifyInstance } from 'fastify';
import {
  requestApproval,
  approveRequest,
  rejectRequest,
  getApprovalQueue,
  getApprovalQueueCount,
  approveAllByType,
  getApprovalSettings,
  updateApprovalSettings,
  type ApprovalRequestType,
} from '../services/approvalService';
import { formatError } from '../lib/errorFormatter';

export default async function approvalRoutes(app: FastifyInstance) {
  // GET /api/approvals/queue — returns all pending approval requests
  app.get('/api/approvals/queue', async (_request, reply) => {
    try {
      const queue = await getApprovalQueue();
      return { queue };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/approvals/queue/count — returns just the count of pending items
  app.get('/api/approvals/queue/count', async (_request, reply) => {
    try {
      const count = await getApprovalQueueCount();
      return { count };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/approvals/:id/approve — approve a specific request
  app.post('/api/approvals/:id/approve', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await approveRequest(id);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send(formatError(err));
    }
  });

  // POST /api/approvals/:id/reject — reject a specific request
  app.post('/api/approvals/:id/reject', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string } || {};
      await rejectRequest(id, body.reason);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send(formatError(err));
    }
  });

  // POST /api/approvals/approve-all — approve all pending requests of a specified type
  app.post('/api/approvals/approve-all', async (request, reply) => {
    try {
      const body = request.body as { requestType: ApprovalRequestType };
      if (!body.requestType) {
        return reply.status(400).send({ error: 'requestType is required' });
      }
      const count = await approveAllByType(body.requestType);
      return { success: true, approvedCount: count };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/settings/approval-mode — returns current mode and rules
  app.get('/api/settings/approval-mode', async (_request, reply) => {
    try {
      const settings = await getApprovalSettings();
      return settings;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/settings/approval-mode — update current mode and/or rules
  app.post('/api/settings/approval-mode', async (request, reply) => {
    try {
      const body = request.body as { mode?: string; rules?: Record<string, unknown> };
      await updateApprovalSettings({
        mode: body.mode as any,
        rules: body.rules as any,
      });
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });
}
