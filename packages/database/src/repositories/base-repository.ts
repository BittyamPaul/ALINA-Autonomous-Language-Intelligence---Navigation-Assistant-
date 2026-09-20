import { z } from 'zod';
import { AlinaDatabaseClient } from '../client';

export interface BaseEntity {
  id: string;
}

export class BaseRepository<T extends BaseEntity> {
  protected client: AlinaDatabaseClient;
  protected tableName: string;
  protected schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  protected get inMemoryStore(): Map<string, T> {
    return this.client.getInMemoryTable<T>(this.tableName);
  }

  constructor(client: AlinaDatabaseClient, tableName: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
    this.client = client;
    this.tableName = tableName;
    this.schema = schema;
  }

  protected formatThing(id: string): string {
    if (id.includes(':')) return id;
    return `${this.tableName}:${id}`;
  }

  protected normalizeId(record: Record<string, unknown>): Record<string, unknown> {
    if (!record || typeof record !== 'object') return record;
    const clone = { ...record };
    if (clone.id !== undefined && clone.id !== null) {
      let idStr = String(clone.id);
      if (idStr.startsWith(`${this.tableName}:`)) {
        idStr = idStr.slice(this.tableName.length + 1);
      }
      idStr = idStr.replace(/^[⟨`]/, '').replace(/[⟩`]$/, '');
      clone.id = idStr;
    }
    return clone;
  }

  public async findById(id: string): Promise<T | null> {
    const thing = this.formatThing(id);
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;

    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<T[]>(
          `SELECT * FROM type::record($tb, $id);`,
          { tb: this.tableName, id: idKey }
        );
        const item = Array.isArray(results[0]) ? results[0][0] : results[0];
        if (item) {
          const normalized = this.normalizeId(item as Record<string, unknown>);
          return this.schema.parse(normalized);
        }
      } catch (err) {
        console.error(`[BaseRepository.findById Error in ${this.tableName}]`, err);
      }
    }
    const memItem = this.inMemoryStore.get(idKey) ?? this.inMemoryStore.get(id) ?? this.inMemoryStore.get(thing);
    return memItem ? this.schema.parse(memItem) : null;
  }

  public async create(data: T): Promise<T> {
    const validated = this.schema.parse(data);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record($tb, $id) CONTENT $content;`,
          {
            tb: this.tableName,
            id: idKey,
            content: validated,
          }
        );
        this.inMemoryStore.set(idKey, validated);
        return validated;
      } catch (err) {
        console.error(`[BaseRepository.create Error in ${this.tableName}]`, err);
      }
    }

    this.inMemoryStore.set(idKey, validated);
    return validated;
  }

  public async update(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged = { ...existing, ...partial, id: existing.id };
    const validated = this.schema.parse(merged);
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPDATE type::record($tb, $id) MERGE $patch;`,
          {
            tb: this.tableName,
            id: idKey,
            patch: partial,
          }
        );
        this.inMemoryStore.set(idKey, validated);
        return validated;
      } catch (err) {
        console.error(`[BaseRepository.update Error in ${this.tableName}]`, err);
      }
    }

    this.inMemoryStore.set(idKey, validated);
    return validated;
  }

  public async delete(id: string): Promise<boolean> {
    const thing = this.formatThing(id);
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `DELETE type::record($tb, $id);`,
          { tb: this.tableName, id: idKey }
        );
      } catch (err) {
        console.error(`[BaseRepository.delete Error in ${this.tableName}]`, err);
      }
    }

    this.inMemoryStore.delete(thing);
    this.inMemoryStore.delete(idKey);
    this.inMemoryStore.delete(id);
    return true;
  }

  public async list(limit = 100): Promise<T[]> {
    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<T[]>(
          `SELECT * FROM ${this.tableName} LIMIT $limit;`,
          { limit }
        );
        const rows = Array.isArray(results[0]) ? results[0] : results;
        if (Array.isArray(rows)) {
          return rows.map((r) => {
            const normalized = this.normalizeId(r as Record<string, unknown>);
            return this.schema.parse(normalized);
          });
        }
      } catch (err) {
        console.error(`[BaseRepository.list Error in ${this.tableName}]`, err);
      }
    }
    const uniqueValues = Array.from(new Set(this.inMemoryStore.values()));
    return uniqueValues.slice(0, limit);
  }
}

