import {
  AlinaDatabaseClient,
  AuditEventRepository,
  type AuditEventEntity,
} from '@alina/database';

export class AuditService {
  private auditRepo: AuditEventRepository;

  constructor(client: AlinaDatabaseClient) {
    this.auditRepo = new AuditEventRepository(client);
  }

  public async logEvent(
    eventType: AuditEventEntity['eventType'],
    actor: string,
    target: string,
    severity: AuditEventEntity['severity'] = 'info',
    details: Record<string, unknown> = {}
  ): Promise<AuditEventEntity> {
    return this.auditRepo.logEvent(eventType, actor, target, severity, details);
  }

  public async listRecent(limit = 50): Promise<AuditEventEntity[]> {
    return this.auditRepo.listRecent(limit);
  }

  public async listCritical(): Promise<AuditEventEntity[]> {
    return this.auditRepo.listCriticalEvents();
  }
}
