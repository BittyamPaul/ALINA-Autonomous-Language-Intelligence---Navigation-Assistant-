import { SecretRedactor } from './permissions';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  traceId?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  service?: string;
  traceId?: string;
  minLevel?: LogLevel;
  jsonFormat?: boolean;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
};

export class AlinaProductionLogger {
  private service: string;
  private traceId?: string;
  private minLevel: LogLevel;
  private jsonFormat: boolean;

  constructor(options: LoggerOptions = {}) {
    this.service = options.service ?? process.env.ALINA_SERVICE_NAME ?? 'alina-server';
    this.traceId = options.traceId;
    const envLevel = (process.env.ALINA_LOG_LEVEL?.toUpperCase() as LogLevel) || 'INFO';
    this.minLevel = options.minLevel ?? envLevel;
    this.jsonFormat = options.jsonFormat ?? (process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json');
  }

  public withTrace(traceId: string): AlinaProductionLogger {
    return new AlinaProductionLogger({
      service: this.service,
      traceId,
      minLevel: this.minLevel,
      jsonFormat: this.jsonFormat,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= (LEVEL_PRIORITY[this.minLevel] ?? 20);
  }

  public formatEntry(
    level: LogLevel,
    message: string,
    errorObj?: unknown,
    context?: Record<string, unknown>,
    durationMs?: number
  ): StructuredLogEntry {
    const sanitizedMsg = SecretRedactor.redactString(message);
    const sanitizedContext = context ? SecretRedactor.sanitizeObject(context) : undefined;

    let serializedError: StructuredLogEntry['error'] | undefined = undefined;
    if (errorObj) {
      if (errorObj instanceof Error) {
        serializedError = {
          name: errorObj.name,
          message: SecretRedactor.redactString(errorObj.message),
          code: (errorObj as { code?: string }).code,
          stack: process.env.NODE_ENV !== 'production' ? errorObj.stack : undefined,
        };
      } else {
        serializedError = {
          name: 'UnknownError',
          message: SecretRedactor.redactString(String(errorObj)),
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message: sanitizedMsg,
      traceId: this.traceId,
      durationMs,
      error: serializedError,
      context: sanitizedContext,
    };
  }

  private write(
    level: LogLevel,
    message: string,
    errorObj?: unknown,
    context?: Record<string, unknown>,
    durationMs?: number
  ): StructuredLogEntry {
    const entry = this.formatEntry(level, message, errorObj, context, durationMs);
    if (!this.shouldLog(level)) return entry;

    if (this.jsonFormat) {
      const output = JSON.stringify(entry);
      if (level === 'ERROR' || level === 'FATAL') {
        process.stderr.write(`${output}\n`);
      } else {
        process.stdout.write(`${output}\n`);
      }
    } else {
      const trace = entry.traceId ? ` [${entry.traceId}]` : '';
      const duration = durationMs !== undefined ? ` (${durationMs}ms)` : '';
      const prefix = `[${entry.timestamp}] ${entry.level.padEnd(5)} [${entry.service}]${trace}: ${entry.message}${duration}`;
      if (level === 'ERROR' || level === 'FATAL') {
        console.error(prefix, entry.context || '', entry.error || '');
      } else if (level === 'WARN') {
        console.warn(prefix, entry.context || '');
      } else {
        console.info(prefix, entry.context || '');
      }
    }

    return entry;
  }

  public debug(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return this.write('DEBUG', message, undefined, context);
  }

  public info(message: string, context?: Record<string, unknown>, durationMs?: number): StructuredLogEntry {
    return this.write('INFO', message, undefined, context, durationMs);
  }

  public warn(message: string, context?: Record<string, unknown>): StructuredLogEntry {
    return this.write('WARN', message, undefined, context);
  }

  public error(message: string, error?: unknown, context?: Record<string, unknown>): StructuredLogEntry {
    return this.write('ERROR', message, error, context);
  }

  public fatal(message: string, error?: unknown, context?: Record<string, unknown>): StructuredLogEntry {
    return this.write('FATAL', message, error, context);
  }
}

export const logger = new AlinaProductionLogger();
