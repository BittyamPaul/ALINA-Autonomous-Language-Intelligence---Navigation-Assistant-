import { NextRequest, NextResponse } from 'next/server';
import { getServerServices } from '@/lib/server-services';
import { AlinaProductionLogger } from '@alina/shared';

const logger = new AlinaProductionLogger({ service: 'alina-api-health' });

export async function GET(request: NextRequest) {
  const start = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const probe = searchParams.get('probe');

  const processInfo = {
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    memoryUsage: {
      rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
    },
    pid: process.pid,
  };

  // Liveness Probe: Quick check if the Node.js/Next process is responsive
  if (probe === 'live') {
    logger.debug('Liveness probe check passed');
    return NextResponse.json(
      {
        status: 'alive',
        probe: 'live',
        process: processInfo,
      },
      { status: 200 }
    );
  }

  // Readiness Probe or Full Diagnostic Check: Requires active SurrealDB connectivity
  try {
    const { db } = await getServerServices();
    const health = await db.healthCheck();

    const isHealthy = health.healthy;
    const responsePayload = {
      status: isHealthy ? 'ready' : 'degraded',
      probe: probe ?? 'full',
      database: {
        healthy: health.healthy,
        endpoint: health.endpoint,
        namespace: health.namespace,
        database: health.database,
        latencyMs: health.latencyMs,
        error: health.error,
      },
      process: processInfo,
      durationMs: Date.now() - start,
    };

    if (isHealthy) {
      logger.info('Health readiness check passed', { latencyMs: health.latencyMs }, Date.now() - start);
      return NextResponse.json(responsePayload, { status: 200 });
    } else {
      logger.warn('Health readiness check degraded: database connection unhealthy', { error: health.error });
      return NextResponse.json(responsePayload, { status: 503 });
    }
  } catch (err) {
    logger.error('Health readiness check failed with exception', err);
    return NextResponse.json(
      {
        status: 'down',
        probe: probe ?? 'full',
        error: err instanceof Error ? err.message : String(err),
        process: processInfo,
        durationMs: Date.now() - start,
      },
      { status: 503 }
    );
  }
}

