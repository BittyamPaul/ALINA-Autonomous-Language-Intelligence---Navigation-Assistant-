-- ==============================================================================
-- ALINA Domain-Driven SurrealQL Canonical Schema
-- Supports Document Storage, Graph Relationships, and 384-d Vector Indexing
-- ==============================================================================

DEFINE NAMESPACE alina;
DEFINE DATABASE main;

-- ------------------------------------------------------------------------------
-- 1. Entity Tables (SCHEMAFULL)
-- ------------------------------------------------------------------------------

-- User
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON TABLE user TYPE string;
DEFINE FIELD email ON TABLE user TYPE option<string>;
DEFINE FIELD preferences ON TABLE user TYPE object DEFAULT {};
DEFINE FIELD created_at ON TABLE user TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON TABLE user TYPE datetime DEFAULT time::now();

-- Workspace (PathJail anchor)
DEFINE TABLE workspace SCHEMAFULL;
DEFINE FIELD name ON TABLE workspace TYPE string;
DEFINE FIELD root_path ON TABLE workspace TYPE string;
DEFINE FIELD allowed_paths ON TABLE workspace TYPE array<string> DEFAULT [];
DEFINE FIELD is_active ON TABLE workspace TYPE bool DEFAULT true;
DEFINE FIELD settings ON TABLE workspace TYPE object DEFAULT {};
DEFINE FIELD created_at ON TABLE workspace TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON TABLE workspace TYPE datetime DEFAULT time::now();

-- Conversation
DEFINE TABLE conversation SCHEMAFULL;
DEFINE FIELD workspace_id ON TABLE conversation TYPE record<workspace>;
DEFINE FIELD title ON TABLE conversation TYPE string;
DEFINE FIELD summary ON TABLE conversation TYPE option<string>;
DEFINE FIELD status ON TABLE conversation TYPE string ASSERT $value IN ['active', 'archived'] DEFAULT 'active';
DEFINE FIELD created_at ON TABLE conversation TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON TABLE conversation TYPE datetime DEFAULT time::now();

-- Message
DEFINE TABLE message SCHEMAFULL;
DEFINE FIELD conversation_id ON TABLE message TYPE record<conversation>;
DEFINE FIELD role ON TABLE message TYPE string ASSERT $value IN ['user', 'assistant', 'system', 'tool'];
DEFINE FIELD content ON TABLE message TYPE string;
DEFINE FIELD reasoning ON TABLE message TYPE option<string>;
DEFINE FIELD metadata ON TABLE message TYPE object DEFAULT {};
DEFINE FIELD created_at ON TABLE message TYPE datetime DEFAULT time::now();

-- Task
DEFINE TABLE task SCHEMAFULL;
DEFINE FIELD goal ON TABLE task TYPE string;
DEFINE FIELD workspace_id ON TABLE task TYPE record<workspace>;
DEFINE FIELD conversation_id ON TABLE task TYPE option<record<conversation>>;
DEFINE FIELD status ON TABLE task TYPE string ASSERT $value IN ['draft', 'planning', 'ready', 'executing', 'awaiting_approval', 'paused', 'completed', 'failed'] DEFAULT 'draft';
DEFINE FIELD risk_level ON TABLE task TYPE string ASSERT $value IN ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH_DESTRUCTIVE'] DEFAULT 'LOW';
DEFINE FIELD plan ON TABLE task TYPE option<object>;
DEFINE FIELD result_summary ON TABLE task TYPE option<string>;
DEFINE FIELD created_at ON TABLE task TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON TABLE task TYPE datetime DEFAULT time::now();

-- Task Step
DEFINE TABLE task_step SCHEMAFULL;
DEFINE FIELD task_id ON TABLE task_step TYPE record<task>;
DEFINE FIELD index ON TABLE task_step TYPE int;
DEFINE FIELD title ON TABLE task_step TYPE string;
DEFINE FIELD tool_name ON TABLE task_step TYPE string;
DEFINE FIELD parameters ON TABLE task_step TYPE object DEFAULT {};
DEFINE FIELD status ON TABLE task_step TYPE string ASSERT $value IN ['pending', 'running', 'awaiting_approval', 'completed', 'failed', 'skipped'] DEFAULT 'pending';
DEFINE FIELD risk_level ON TABLE task_step TYPE string ASSERT $value IN ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH_DESTRUCTIVE'] DEFAULT 'LOW';
DEFINE FIELD verification_rule ON TABLE task_step TYPE option<object>;
DEFINE FIELD output ON TABLE task_step TYPE any;
DEFINE FIELD error ON TABLE task_step TYPE option<string>;
DEFINE FIELD started_at ON TABLE task_step TYPE option<datetime>;
DEFINE FIELD completed_at ON TABLE task_step TYPE option<datetime>;

-- Agent
DEFINE TABLE agent SCHEMAFULL;
DEFINE FIELD name ON TABLE agent TYPE string;
DEFINE FIELD role ON TABLE agent TYPE string;
DEFINE FIELD model_provider ON TABLE agent TYPE string DEFAULT 'local';
DEFINE FIELD model_name ON TABLE agent TYPE string DEFAULT 'default';
DEFINE FIELD capabilities ON TABLE agent TYPE array<string> DEFAULT [];
DEFINE FIELD created_at ON TABLE agent TYPE datetime DEFAULT time::now();

-- Agent Run
DEFINE TABLE agent_run SCHEMAFULL;
DEFINE FIELD task_id ON TABLE agent_run TYPE record<task>;
DEFINE FIELD agent_id ON TABLE agent_run TYPE record<agent>;
DEFINE FIELD status ON TABLE agent_run TYPE string ASSERT $value IN ['running', 'succeeded', 'failed', 'halted_approval'] DEFAULT 'running';
DEFINE FIELD step_count ON TABLE agent_run TYPE int DEFAULT 0;
DEFINE FIELD token_usage ON TABLE agent_run TYPE object DEFAULT {};
DEFINE FIELD started_at ON TABLE agent_run TYPE datetime DEFAULT time::now();
DEFINE FIELD ended_at ON TABLE agent_run TYPE option<datetime>;

-- Tool
DEFINE TABLE tool SCHEMAFULL;
DEFINE FIELD name ON TABLE tool TYPE string;
DEFINE FIELD description ON TABLE tool TYPE string;
DEFINE FIELD risk_level ON TABLE tool TYPE string ASSERT $value IN ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH_DESTRUCTIVE'] DEFAULT 'LOW';
DEFINE FIELD input_schema ON TABLE tool TYPE object DEFAULT {};
DEFINE FIELD is_enabled ON TABLE tool TYPE bool DEFAULT true;
DEFINE FIELD created_at ON TABLE tool TYPE datetime DEFAULT time::now();

-- Tool Call
DEFINE TABLE tool_call SCHEMAFULL;
DEFINE FIELD agent_run_id ON TABLE tool_call TYPE record<agent_run>;
DEFINE FIELD tool_id ON TABLE tool_call TYPE record<tool>;
DEFINE FIELD task_step_id ON TABLE tool_call TYPE option<record<task_step>>;
DEFINE FIELD input_parameters ON TABLE tool_call TYPE object DEFAULT {};
DEFINE FIELD output_payload ON TABLE tool_call TYPE any;
DEFINE FIELD duration_ms ON TABLE tool_call TYPE float DEFAULT 0;
DEFINE FIELD status ON TABLE tool_call TYPE string ASSERT $value IN ['success', 'failed', 'rejected'] DEFAULT 'success';
DEFINE FIELD created_at ON TABLE tool_call TYPE datetime DEFAULT time::now();

-- Approval (Human-in-the-Loop Safety Gate)
DEFINE TABLE approval SCHEMAFULL;
DEFINE FIELD task_id ON TABLE approval TYPE record<task>;
DEFINE FIELD task_step_id ON TABLE approval TYPE record<task_step>;
DEFINE FIELD tool_call_id ON TABLE approval TYPE option<record<tool_call>>;
DEFINE FIELD risk_level ON TABLE approval TYPE string ASSERT $value IN ['MEDIUM', 'HIGH_DESTRUCTIVE'];
DEFINE FIELD description ON TABLE approval TYPE string;
DEFINE FIELD diff_preview ON TABLE approval TYPE option<string>;
DEFINE FIELD status ON TABLE approval TYPE string ASSERT $value IN ['pending', 'approved', 'rejected', 'expired'] DEFAULT 'pending';
DEFINE FIELD decision_by ON TABLE approval TYPE option<string>;
DEFINE FIELD decision_at ON TABLE approval TYPE option<datetime>;
DEFINE FIELD rejection_reason ON TABLE approval TYPE option<string>;
DEFINE FIELD created_at ON TABLE approval TYPE datetime DEFAULT time::now();

-- Memory (Semantic Vector Storage)
DEFINE TABLE memory SCHEMAFULL;
DEFINE FIELD content ON TABLE memory TYPE string;
DEFINE FIELD category ON TABLE memory TYPE string ASSERT $value IN ['preference', 'fact', 'project_context', 'workflow_pattern', 'rule'] DEFAULT 'fact';
DEFINE FIELD importance ON TABLE memory TYPE float DEFAULT 0.5;
DEFINE FIELD tags ON TABLE memory TYPE array<string> DEFAULT [];
DEFINE FIELD embedding ON TABLE memory TYPE option<array<float, 384>>;
DEFINE FIELD workspace_id ON TABLE memory TYPE option<record<workspace>>;
DEFINE FIELD last_accessed_at ON TABLE memory TYPE datetime DEFAULT time::now();
DEFINE FIELD created_at ON TABLE memory TYPE datetime DEFAULT time::now();

-- Vector Index (Cosine Distance, 384 dimensions)
DEFINE INDEX idx_memory_embedding ON TABLE memory 
  FIELDS embedding HNSW DIMENSION 384 DISTANCE COSINE;

-- File Reference
DEFINE TABLE file_reference SCHEMAFULL;
DEFINE FIELD workspace_id ON TABLE file_reference TYPE record<workspace>;
DEFINE FIELD path ON TABLE file_reference TYPE string;
DEFINE FIELD mime_type ON TABLE file_reference TYPE string DEFAULT 'text/plain';
DEFINE FIELD size_bytes ON TABLE file_reference TYPE int DEFAULT 0;
DEFINE FIELD content_hash ON TABLE file_reference TYPE string;
DEFINE FIELD category ON TABLE file_reference TYPE string ASSERT $value IN ['source_code', 'config', 'document', 'artifact', 'scratch'] DEFAULT 'source_code';
DEFINE FIELD created_at ON TABLE file_reference TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON TABLE file_reference TYPE datetime DEFAULT time::now();

-- Browser Session
DEFINE TABLE browser_session SCHEMAFULL;
DEFINE FIELD task_id ON TABLE browser_session TYPE option<record<task>>;
DEFINE FIELD current_url ON TABLE browser_session TYPE string;
DEFINE FIELD title ON TABLE browser_session TYPE string DEFAULT 'New Tab';
DEFINE FIELD viewport ON TABLE browser_session TYPE object DEFAULT { width: 1280, height: 800 };
DEFINE FIELD is_active ON TABLE browser_session TYPE bool DEFAULT true;
DEFINE FIELD created_at ON TABLE browser_session TYPE datetime DEFAULT time::now();
DEFINE FIELD closed_at ON TABLE browser_session TYPE option<datetime>;

-- Audit Event
DEFINE TABLE audit_event SCHEMAFULL;
DEFINE FIELD event_type ON TABLE audit_event TYPE string;
DEFINE FIELD severity ON TABLE audit_event TYPE string ASSERT $value IN ['info', 'warning', 'critical'] DEFAULT 'info';
DEFINE FIELD actor ON TABLE audit_event TYPE string;
DEFINE FIELD target ON TABLE audit_event TYPE string;
DEFINE FIELD details ON TABLE audit_event TYPE object DEFAULT {};
DEFINE FIELD timestamp ON TABLE audit_event TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_audit_timestamp ON TABLE audit_event FIELDS timestamp;

-- ------------------------------------------------------------------------------
-- 2. Graph Relation Tables (TYPE RELATION)
-- ------------------------------------------------------------------------------

DEFINE TABLE owns SCHEMAFULL TYPE RELATION FROM user TO workspace;
DEFINE FIELD role ON TABLE owns TYPE string DEFAULT 'owner';
DEFINE FIELD created_at ON TABLE owns TYPE datetime DEFAULT time::now();

DEFINE TABLE started SCHEMAFULL TYPE RELATION FROM user TO conversation;
DEFINE FIELD created_at ON TABLE started TYPE datetime DEFAULT time::now();

DEFINE TABLE contains SCHEMAFULL TYPE RELATION FROM conversation TO message;
DEFINE FIELD sequence_order ON TABLE contains TYPE option<int>;
DEFINE FIELD created_at ON TABLE contains TYPE datetime DEFAULT time::now();

DEFINE TABLE created SCHEMAFULL TYPE RELATION FROM user TO task;
DEFINE FIELD created_at ON TABLE created TYPE datetime DEFAULT time::now();

DEFINE TABLE contains_step SCHEMAFULL TYPE RELATION FROM task TO task_step;
DEFINE FIELD step_index ON TABLE contains_step TYPE int;
DEFINE FIELD created_at ON TABLE contains_step TYPE datetime DEFAULT time::now();

DEFINE TABLE executed_by SCHEMAFULL TYPE RELATION FROM task TO agent_run;
DEFINE FIELD created_at ON TABLE executed_by TYPE datetime DEFAULT time::now();

DEFINE TABLE invoked SCHEMAFULL TYPE RELATION FROM agent_run TO tool_call;
DEFINE FIELD created_at ON TABLE invoked TYPE datetime DEFAULT time::now();

DEFINE TABLE used SCHEMAFULL TYPE RELATION FROM tool_call TO tool;
DEFINE FIELD created_at ON TABLE used TYPE datetime DEFAULT time::now();

DEFINE TABLE requires SCHEMAFULL TYPE RELATION FROM task TO approval;
DEFINE FIELD is_resolved ON TABLE requires TYPE bool DEFAULT false;
DEFINE FIELD created_at ON TABLE requires TYPE datetime DEFAULT time::now();

DEFINE TABLE remembers SCHEMAFULL TYPE RELATION FROM user TO memory;
DEFINE FIELD access_count ON TABLE remembers TYPE int DEFAULT 1;
DEFINE FIELD created_at ON TABLE remembers TYPE datetime DEFAULT time::now();

DEFINE TABLE produced SCHEMAFULL TYPE RELATION FROM task TO file_reference;
DEFINE FIELD action ON TABLE produced TYPE string ASSERT $value IN ['created', 'modified', 'inspected'] DEFAULT 'created';
DEFINE FIELD created_at ON TABLE produced TYPE datetime DEFAULT time::now();

DEFINE TABLE contains_file SCHEMAFULL TYPE RELATION FROM workspace TO file_reference;
DEFINE FIELD created_at ON TABLE contains_file TYPE datetime DEFAULT time::now();

-- ------------------------------------------------------------------------------
-- 3. Migrations Registry Table
-- ------------------------------------------------------------------------------

DEFINE TABLE _schema_migrations SCHEMAFULL;
DEFINE FIELD version ON TABLE _schema_migrations TYPE string;
DEFINE FIELD name ON TABLE _schema_migrations TYPE string;
DEFINE FIELD applied_at ON TABLE _schema_migrations TYPE datetime DEFAULT time::now();
DEFINE FIELD checksum ON TABLE _schema_migrations TYPE string;
