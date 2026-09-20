-- ALINA Canonical SurrealQL Schema

DEFINE NAMESPACE alina;
DEFINE DATABASE main;

-- Document Tables
DEFINE TABLE user SCHEMALESS;
DEFINE TABLE workspace SCHEMALESS;
DEFINE TABLE conversation SCHEMALESS;
DEFINE TABLE message SCHEMALESS;
DEFINE TABLE task SCHEMALESS;
DEFINE TABLE task_step SCHEMALESS;
DEFINE TABLE agent SCHEMALESS;
DEFINE TABLE agent_run SCHEMALESS;
DEFINE TABLE tool SCHEMALESS;
DEFINE TABLE tool_call SCHEMALESS;
DEFINE TABLE approval SCHEMALESS;
DEFINE TABLE memory SCHEMALESS;
DEFINE TABLE file_reference SCHEMALESS;
DEFINE TABLE browser_session SCHEMALESS;
DEFINE TABLE audit_event SCHEMALESS;

-- Knowledge Acquisition System Tables (3-Layer Architecture)
DEFINE TABLE knowledge_items SCHEMALESS;
DEFINE TABLE knowledge_sources SCHEMALESS;
DEFINE TABLE knowledge_topics SCHEMALESS;
DEFINE TABLE knowledge_embeddings SCHEMALESS;
DEFINE TABLE knowledge_updates SCHEMALESS;

-- Vector Index on Memory (Cosine Distance)
DEFINE INDEX idx_memory_embedding ON TABLE memory 
  FIELDS embedding HNSW DIMENSION 384 DISTANCE COSINE;

-- Vector Index on Knowledge Items (Cosine Distance)
DEFINE INDEX idx_knowledge_embedding ON TABLE knowledge_items 
  FIELDS embedding HNSW DIMENSION 384 DISTANCE COSINE;

-- Graph Relations
DEFINE TABLE owns SCHEMALESS TYPE RELATION FROM user TO workspace;
DEFINE TABLE started SCHEMALESS TYPE RELATION FROM user TO conversation;
DEFINE TABLE contains SCHEMALESS TYPE RELATION FROM conversation TO message;
DEFINE TABLE created SCHEMALESS TYPE RELATION FROM user TO task;
DEFINE TABLE contains_step SCHEMALESS TYPE RELATION FROM task TO task_step;
DEFINE TABLE executed_by SCHEMALESS TYPE RELATION FROM task TO agent_run;
DEFINE TABLE invoked SCHEMALESS TYPE RELATION FROM agent_run TO tool_call;
DEFINE TABLE used SCHEMALESS TYPE RELATION FROM tool_call TO tool;
DEFINE TABLE requires SCHEMALESS TYPE RELATION FROM task TO approval;
DEFINE TABLE remembers SCHEMALESS TYPE RELATION FROM user TO memory;
DEFINE TABLE produced SCHEMALESS TYPE RELATION FROM task TO file_reference;
DEFINE TABLE contains_file SCHEMALESS TYPE RELATION FROM workspace TO file_reference;

-- Knowledge Graph Relations
DEFINE TABLE has_source SCHEMALESS TYPE RELATION FROM knowledge_topics TO knowledge_sources;
DEFINE TABLE produced_item SCHEMALESS TYPE RELATION FROM knowledge_sources TO knowledge_items;
DEFINE TABLE relates_to_project SCHEMALESS TYPE RELATION FROM knowledge_items TO workspace;
DEFINE TABLE referenced_by_task SCHEMALESS TYPE RELATION FROM knowledge_items TO task;
DEFINE TABLE used_knowledge SCHEMALESS TYPE RELATION FROM task TO knowledge_items;

