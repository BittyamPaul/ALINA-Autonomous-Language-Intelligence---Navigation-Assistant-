import { RiskLevel } from './permissions';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actionType:
    | 'tool_execution'
    | 'approval_granted'
    | 'approval_denied'
    | 'sandbox_violation'
    | 'approval_requested'
    | 'approval_cancelled'
    | 'approval_expired'
    | 'security_violation'
    | 'grant_consumed';
  toolName?: string;
  riskLevel: RiskLevel;
  parameters?: Record<string, unknown>;
  outcome:
    | 'success'
    | 'failure'
    | 'blocked'
    | 'pending'
    | 'granted'
    | 'denied'
    | 'expired'
    | 'cancelled';
  details: string;
}

export class AuditLogger {
  private buffer: AuditEntry[] = [];
  private readonly maxBufferSize = 1000;

  public log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.buffer.unshift(fullEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    return fullEntry;
  }

  public getRecent(limit = 50): AuditEntry[] {
    return this.buffer.slice(0, limit);
  }

  public clear(): void {
    this.buffer = [];
  }
}
