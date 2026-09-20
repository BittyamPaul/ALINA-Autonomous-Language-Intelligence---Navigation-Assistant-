export class AlinaServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code = 'INTERNAL_SERVICE_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AlinaServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AlinaServiceError.prototype);
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    timestamp: string;
    durationMs: number;
  };
}

export function sanitizeSecrets<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecrets(item)) as unknown as T;
  }

  const forbidden = ['password', 'secret', 'apikey', 'api_key', 'token', 'access_token', 'private_key', 'privatekey'];
  const sanitized: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.includes(k.toLowerCase())) {
      sanitized[k] = '[REDACTED_SECRET]';
    } else {
      sanitized[k] = sanitizeSecrets(v);
    }
  }

  return sanitized as T;
}

export function createSuccessResponse<T>(data: T, startTime = Date.now()): ApiResponse<T> {
  return {
    success: true,
    data: sanitizeSecrets(data),
    metadata: {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    },
  };
}

export function createErrorResponse(
  err: unknown,
  startTime = Date.now()
): { response: ApiResponse<never>; statusCode: number } {
  const durationMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  if (err instanceof AlinaServiceError) {
    return {
      statusCode: err.statusCode,
      response: {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
        metadata: { timestamp, durationMs },
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    statusCode: 500,
    response: {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal service error occurred.',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      metadata: { timestamp, durationMs },
    },
  };
}
