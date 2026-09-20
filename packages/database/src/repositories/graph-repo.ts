import { AlinaDatabaseClient } from '../client';

export interface GraphEdge {
  id: string;
  in: string;
  edge: string;
  out: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export class GraphRepository {
  private client: AlinaDatabaseClient;
  private inMemoryEdges: GraphEdge[] = [];

  constructor(client: AlinaDatabaseClient) {
    this.client = client;
  }

  public async relate(
    fromThing: string,
    edgeTable: string,
    toThing: string,
    data: Record<string, unknown> = {}
  ): Promise<GraphEdge> {
    const fromId = fromThing.includes(':') ? fromThing : `record:${fromThing}`;
    const toId = toThing.includes(':') ? toThing : `record:${toThing}`;

    const edgeRecord: GraphEdge = {
      id: `${edgeTable}:${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      in: fromId,
      edge: edgeTable,
      out: toId,
      data,
      createdAt: new Date().toISOString(),
    };

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `RELATE ${fromId}->${edgeTable}->${toId} CONTENT $data;`,
          { data }
        );
      } catch {
        // Fallback
      }
    }

    this.inMemoryEdges.push(edgeRecord);
    return edgeRecord;
  }

  public async findOutgoing(fromThing: string, edgeTable: string): Promise<string[]> {
    const fromId = fromThing.includes(':') ? fromThing : `record:${fromThing}`;

    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<Array<{ out: string }>>(
          `SELECT out FROM ${fromId}->${edgeTable};`
        );
        const rows = Array.isArray(results[0]) ? (results[0] as Array<{ out: string }>) : [];
        return rows.map((r) => r.out);
      } catch {
        // Fallback
      }
    }

    return this.inMemoryEdges
      .filter((e) => e.in === fromId && e.edge === edgeTable)
      .map((e) => e.out);
  }

  public async findIncoming(toThing: string, edgeTable: string): Promise<string[]> {
    const toId = toThing.includes(':') ? toThing : `record:${toThing}`;

    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<Array<{ in: string }>>(
          `SELECT in FROM ${toId}<-${edgeTable};`
        );
        const rows = Array.isArray(results[0]) ? (results[0] as Array<{ in: string }>) : [];
        return rows.map((r) => r.in);
      } catch {
        // Fallback
      }
    }

    return this.inMemoryEdges
      .filter((e) => e.out === toId && e.edge === edgeTable)
      .map((e) => e.in);
  }

  public async traverse<T = unknown>(queryExpression: string): Promise<T[]> {
    if (this.client.isConnected()) {
      const results = await this.client.query<T[]>(queryExpression);
      return (results[0] as unknown as T[]) ?? [];
    }
    return [];
  }
}
