export class AlinaError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
  }
}

export class SecuritySandboxError extends AlinaError {
  constructor(message: string, path: string) {
    super(message, 'SECURITY_SANDBOX_VIOLATION', { path });
  }
}

export class ToolExecutionError extends AlinaError {
  constructor(toolName: string, reason: string) {
    super(`Tool [${toolName}] failed: ${reason}`, 'TOOL_EXECUTION_FAILURE', { toolName });
  }
}

export class VerificationFailureError extends AlinaError {
  constructor(stepTitle: string, assertion: string) {
    super(`Post-condition failed for [${stepTitle}]: ${assertion}`, 'POST_CONDITION_FAILED', {
      stepTitle,
      assertion,
    });
  }
}
