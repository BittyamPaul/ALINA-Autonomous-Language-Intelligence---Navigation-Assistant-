# ALINA Model Context Protocol (MCP) Architecture Specification

> **Status**: Production Reference  
> **Version**: 1.0.0  
> **Standard**: Model Context Protocol (MCP) by Anthropic / Linux Foundation  
> **SDK**: `@modelcontextprotocol/sdk` (v1.30.0)

---

## 1. Architectural Philosophy & Mission

ALINA adheres strictly to a **decoupled, protocol-first tool execution architecture**. 
Rather than hardcoding capabilities directly inside the supervisor agent or model instructions:

1. **All tools are exposed as first-class MCP tools** adhering to the formal Model Context Protocol specification.
2. **The supervisor dynamically discovers and interacts with tools** through the central registry and MCP bridges.
3. **Safety and permissions are enforced symmetrically** at both the registry boundary and the agent loop.
4. **Third-party MCP servers (stdio/SSE/in-memory) can be linked seamlessly**, making ALINA extensible without modifying core application code.

---

## 2. Permission Classification Model

Every tool in the ALINA ecosystem declares an explicit **permission classification** evaluated before invocation:

| Classification | Meaning & Behavior | Default Risk Level | Examples |
| :--- | :--- | :--- | :--- |
| **`SAFE`** | Read-only, informational, non-mutating operations. Zero destructive potential. Automatically permitted within registered sandbox roots. | `READ_ONLY` | `list_files`, `search_files`, `read_text_file`, `get_file_metadata`, `get_system_info`, `list_processes` |
| **`REQUIRES_APPROVAL`** | Mutating or state-changing operations that write data, modify workspace files, or initiate network connections. Pauses execution for Human-In-The-Loop (HITL) sign-off. | `MEDIUM` | Writing scratch files, dispatching web queries, opening browser sessions |
| **`HIGH_RISK`** | Destructive actions (deleting files, terminal execution, credential access, external mutations). Strictly guarded by security gates. | `HIGH_DESTRUCTIVE` | `fs_delete_file`, `git reset --hard`, shell mutation |

---

## 3. Central Tool Registry (`AlinaMcpToolRegistry`)

The central registry (`@alina/mcp`) manages all tools across the entire platform.

### Standard Tool Contract (`McpToolDefinition`)

Every registered tool satisfies the complete contract:

```typescript
export interface McpToolDefinition<TInput = any, TOutput = any> {
  name: string;                                    // Unique identifier
  group: 'filesystem' | 'browser' | 'computer' | 'system'; // Logical categorization
  description: string;                             // Detailed description for LLM selection
  inputSchema: z.ZodType<any, any, any>;           // Strict Zod input schema
  outputSchema: z.ZodType<any, any, any>;          // Strict Zod output schema
  permission: 'SAFE' | 'REQUIRES_APPROVAL' | 'HIGH_RISK';
  timeoutMs: number;                               // Execution timeout limit (e.g. 10000ms)
  auditMetadata: {
    category: string;
    description: string;
    isReadOnly: boolean;
    tags?: string[];
  };
  execute: (input: TInput, context: McpToolContext) => Promise<TOutput>;
}
```

### Execution Lifecycle

When `registry.execute(name, input, context)` is invoked:
1. **Tool Existence Check**: Ensures the tool exists; rejects unregistered tools with an audit violation.
2. **Input Schema Validation**: Validates the payload with `inputSchema.safeParse(input)`.
3. **Permission Gate**: Verifies whether the permission is `REQUIRES_APPROVAL` or `HIGH_RISK`. If not pre-approved, blocks execution and records an audit violation.
4. **Timeout Enforcement**: Enforces `Promise.race` with `tool.timeoutMs` to prevent hung child processes or stalled async operations.
5. **Sandboxed Execution**: Executes the tool logic with active `PathJail` and `AuditLogger`.
6. **Output Schema Validation**: Asserts that return data satisfies `outputSchema`.
7. **Audit Ledger Logging**: Appends a structured audit entry (`tool_execution`, duration, parameters, outcome).

---

## 4. Initial Tool Groups & Implemented Safe Tools

### Group 1: `filesystem` (All `SAFE` & Sandboxed via `PathJail`)

| Tool Name | Input Parameters | Output Details | Constraints |
| :--- | :--- | :--- | :--- |
| `list_files` | `path?: string`, `recursive?: boolean`, `maxDepth?: number`, `maxItems?: number` | `items: FileEntry[]`, `totalCount`, `truncated` | Confined strictly to `PathJail` roots. Traversal outside throws error. |
| `search_files` | `path?: string`, `pattern: string`, `maxResults?: number` | `matches: SearchMatch[]`, `totalMatches`, `pattern` | Glob pattern search. Excludes `node_modules`, `.git`, `dist`. |
| `read_text_file` | `path: string`, `maxBytes?: number`, `encoding?: string` | `content: string`, `sizeBytes`, `truncated` | Capped at `maxBytes` (default 64KB) to prevent context flooding. |
| `get_file_metadata` | `path: string` | `name`, `path`, `sizeBytes`, `isDirectory`, `createdAt`, `modifiedAt` | Non-mutating stat check. |

### Group 2: `system` (All `SAFE` & Telemetry-Only)

| Tool Name | Input Parameters | Output Details | Constraints |
| :--- | :--- | :--- | :--- |
| `get_system_info` | `includeMemory?: boolean`, `includeCpu?: boolean` | `platform`, `arch`, `osVersion`, `cpuCount`, `totalMemoryBytes`, `nodeVersion` | Read-only OS telemetry from Node `os` module. |
| `list_processes` | `maxProcesses?: number`, `nameFilter?: string` | `processes: ProcessItem[]`, `totalCount`, `platform` | Safely queries active OS processes via `tasklist` (Win) or `ps` (Unix). Zero mutation. |

### Groups 3 & 4: Extensible Safe Contracts

- **`browser`**: `browser_get_status` (returns driver readiness and active sessions).
- **`computer`**: `computer_get_display_info` (queries monitor resolution and scale factor).

---

## 5. Client & Server Protocol Architecture

ALINA provides both server and client implementations from `@alina/mcp`:

```typescript
// 1. Central registry with all tools
const registry = createAlinaMcpToolRegistry();

// 2. Start MCP Server exposing tools
const server = new AlinaMcpServer(registry, { name: 'alina-server', version: '1.0.0' });

// 3. Connect via InMemoryTransport (in-process) or StdioServerTransport (external processes)
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

// 4. Standard MCP Client
const client = new AlinaMcpClient({ name: 'alina-client' });
await client.connect(clientTransport);

// 5. Discover & call tools via official MCP protocol
const tools = await client.listTools();
const result = await client.callTool('list_files', { path: '.' });
```

---

## 6. Supervisor Agent Integration (`McpAgentBridge`)

To eliminate hardcoded capabilities inside the supervisor:

1. `McpAgentBridge` inspects `AlinaMcpToolRegistry`.
2. Converts every registered MCP tool into a Mastra-compatible tool (`createTool`).
3. The supervisor agent queries `bridge.listToolsForModel()` to inject available capabilities into the model planning prompt.
4. During execution, steps dispatch to `bridge.executeControlled()`, seamlessly maintaining timeouts, permission gates, and SurrealDB persistence.
