import { BaseRepository } from './base-repository';
import { AuditEventEntity, AuditEventSchema } from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export class AuditEventRepository extends BaseRepository<AuditEventEntity> {
  constructor(client: AlinaDatabaseClient) {
    super(client, 'audit_event', AuditEventSchema);
  }

  public async logEvent(
    eventType: AuditEventEntity['eventType'],
    actor: string,
    target: string,
    severity: AuditEventEntity['severity'] = 'info',
    details: Record<string, unknown> = {}
  ): Promise<AuditEventEntity> {
    const event: AuditEventEntity = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      actor,
      target,
      severity,
      details,
      timestamp: new Date().toISOString(),
    };

    return this.create(event);
  }

  public async listRecent(limit = 50): Promise<AuditEventEntity[]> {
    const all = await this.list(limit * 2);
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  public async listCriticalEvents(): Promise<AuditEventEntity[]> {
    const all = await this.list(500);
    return all.filter((e) => e.severity === 'critical');
  }
}
