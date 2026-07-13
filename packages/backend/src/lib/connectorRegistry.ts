import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors } from '../db/schema';
import type { Connector } from '@shared/types';
import * as credentialStore from './credentialStore';

export type ConnectorStatus = 'active' | 'inactive' | 'error' | 'rate_limited';

export class ConnectorRegistry {
  constructor(private db: typeof import('../db').db) {}

  async getAll(): Promise<Connector[]> {
    const rows = await this.db.select().from(connectors).all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type as Connector['type'],
      provider: row.provider,
      status: row.status as Connector['status'],
      config: JSON.parse(row.configJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getById(id: string): Promise<Connector | null> {
    const row = await this.db.select().from(connectors).where(eq(connectors.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type as Connector['type'],
      provider: row.provider,
      status: row.status as Connector['status'],
      config: JSON.parse(row.configJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(data: Omit<Connector, 'id' | 'createdAt' | 'updatedAt'>): Promise<Connector> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const connector: Connector = {
      id,
      name: data.name,
      type: data.type,
      provider: data.provider,
      status: data.status,
      config: data.config,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(connectors).values({
      id: connector.id,
      name: connector.name,
      type: connector.type,
      provider: connector.provider,
      status: connector.status,
      configJson: JSON.stringify(connector.config),
      encryptedCredentials: '',
      createdAt: connector.createdAt,
      updatedAt: connector.updatedAt,
    });

    return connector;
  }

  async update(id: string, data: Partial<Connector>): Promise<Connector> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Connector with id ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string> = {
      updatedAt: now,
    };

    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.provider !== undefined) updateData['provider'] = data.provider;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.config !== undefined) updateData['configJson'] = JSON.stringify(data.config);

    await this.db.update(connectors)
      .set(updateData)
      .where(eq(connectors.id, id))
      .run();

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Connector with id ${id} not found after update`);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(connectors).where(eq(connectors.id, id)).run();
    await credentialStore.deleteCredential(id);
  }

  async setStatus(id: string, status: ConnectorStatus): Promise<void> {
    await this.db.update(connectors)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(connectors.id, id))
      .run();
  }

  async getConfig(id: string): Promise<Record<string, unknown>> {
    const row = await this.db.select({ configJson: connectors.configJson }).from(connectors).where(eq(connectors.id, id)).get();
    if (!row) {
      throw new Error(`Connector with id ${id} not found`);
    }
    return JSON.parse(row.configJson);
  }

  async updateConfig(id: string, config: Record<string, unknown>): Promise<void> {
    await this.db.update(connectors)
      .set({ configJson: JSON.stringify(config), updatedAt: new Date().toISOString() })
      .where(eq(connectors.id, id))
      .run();
  }
}
