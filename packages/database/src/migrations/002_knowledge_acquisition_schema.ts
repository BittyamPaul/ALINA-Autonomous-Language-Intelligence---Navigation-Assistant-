import type { Migration } from './migration-runner';
import type { AlinaDatabaseClient } from '../client';

export const KNOWLEDGE_SCHEMA_SURQL = `
-- Knowledge Acquisition System Tables
DEFINE TABLE IF NOT EXISTS knowledge_items SCHEMALESS;
DEFINE TABLE IF NOT EXISTS knowledge_sources SCHEMALESS;
DEFINE TABLE IF NOT EXISTS knowledge_topics SCHEMALESS;
DEFINE TABLE IF NOT EXISTS knowledge_embeddings SCHEMALESS;
DEFINE TABLE IF NOT EXISTS knowledge_updates SCHEMALESS;

-- Vector Index on Knowledge Items (Cosine Distance)
DEFINE INDEX IF NOT EXISTS idx_knowledge_embedding ON TABLE knowledge_items 
  FIELDS embedding HNSW DIMENSION 384 DISTANCE COSINE;

-- Knowledge Graph Relation Tables
DEFINE TABLE IF NOT EXISTS has_source SCHEMALESS TYPE RELATION FROM knowledge_topics TO knowledge_sources;
DEFINE TABLE IF NOT EXISTS produced_item SCHEMALESS TYPE RELATION FROM knowledge_sources TO knowledge_items;
DEFINE TABLE IF NOT EXISTS relates_to_project SCHEMALESS TYPE RELATION FROM knowledge_items TO workspace;
DEFINE TABLE IF NOT EXISTS referenced_by_task SCHEMALESS TYPE RELATION FROM knowledge_items TO task;
DEFINE TABLE IF NOT EXISTS used_knowledge SCHEMALESS TYPE RELATION FROM task TO knowledge_items;
`;

export const migration002KnowledgeSchema: Migration = {
  version: '002',
  name: 'knowledge_acquisition_schema',
  up: async (client: AlinaDatabaseClient) => {
    await client.applySchema(KNOWLEDGE_SCHEMA_SURQL);
  },
};
