import { BaseRepository } from './base-repository';
import { UserEntity, UserSchema, WorkspaceEntity, WorkspaceSchema } from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export class UserRepository extends BaseRepository<UserEntity> {
  constructor(client: AlinaDatabaseClient) {
    super(client, 'user', UserSchema);
  }

  public async getOrCreateDefaultUser(): Promise<UserEntity> {
    const existing = await this.findById('default_operator');
    if (existing) return existing;

    const defaultUser: UserEntity = {
      id: 'default_operator',
      name: 'System Operator',
      email: 'operator@local.alina',
      preferences: {
        theme: 'light',
        telemetry: false,
        safetyMode: 'strict_approval',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.create(defaultUser);
  }
}

export class WorkspaceRepository extends BaseRepository<WorkspaceEntity> {
  constructor(client: AlinaDatabaseClient) {
    super(client, 'workspace', WorkspaceSchema);
  }

  public async getActiveWorkspace(): Promise<WorkspaceEntity | null> {
    const all = await this.list();
    return all.find((w) => w.isActive) ?? null;
  }
}
