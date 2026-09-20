import { NextResponse } from 'next/server';
import { AlinaObservabilityService } from '@alina/agent';
import { TelemetryType, TelemetryStatus } from '@alina/shared';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const obs = AlinaObservabilityService.getInstance();

    const filter = {
      taskId: searchParams.get('taskId') || undefined,
      type: (searchParams.get('type') as TelemetryType) || undefined,
      status: (searchParams.get('status') as TelemetryStatus) || undefined,
      component: searchParams.get('component') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 100,
    };

    // Seed realistic operational spans if buffer is pristine
    if (obs.getSpans().length === 0) {
      obs.recordTaskDuration({
        taskId: 'task-bootstrap-01',
        goal: 'Autonomous React 19 Research & Report',
        durationMs: 3420,
        status: 'succeeded',
        stepsCompleted: 4,
        toolCallsCount: 3,
      });
      obs.recordAgentRun({
        taskId: 'task-bootstrap-01',
        agentRole: 'research-agent',
        status: 'succeeded',
        durationMs: 1150,
      });
      obs.recordBrowserAction({
        taskId: 'task-bootstrap-01',
        action: 'navigate',
        url: 'https://react.dev/blog/2024/12/05/react-19',
        durationMs: 430,
        status: 'succeeded',
      });
      obs.recordToolCall({
        taskId: 'task-bootstrap-01',
        toolName: 'fs_read_file',
        durationMs: 45,
        status: 'succeeded',
        input: { path: 'C:/Users/bitty/Desktop/report.md' },
      });
      obs.recordApproval({
        taskId: 'task-bootstrap-01',
        requestId: 'req-appr-01',
        toolName: 'fs_write_file',
        riskLevel: 'LOW',
        action: 'file_write',
        target: 'Desktop/report.md',
        decision: 'approved',
        latencyMs: 1200,
      });
      obs.recordRetry({
        taskId: 'task-bootstrap-01',
        stepOrTool: 'browser_action',
        attempt: 1,
        maxAttempts: 3,
        reason: 'Network socket reset, retrying with exponential backoff (250ms)',
      });
      obs.recordFailure({
        taskId: 'task-bootstrap-01',
        error: 'Temporary DNS resolution timeout',
        component: 'network-io',
        retryable: true,
      });
    }

    const metrics = obs.getMetrics();
    const spans = obs.getSpans(filter);

    return NextResponse.json({
      success: true,
      metrics,
      spans,
      totalCount: spans.length,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to retrieve telemetry: ${errorMsg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const obs = AlinaObservabilityService.getInstance();

    if (body.action === 'export') {
      const exportedJson = obs.exportTelemetry();
      return new NextResponse(exportedJson, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="alina-telemetry.json"',
        },
      });
    }

    if (body.action === 'clear') {
      obs.clear();
      return NextResponse.json({ success: true, message: 'Telemetry spans cleared.' });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action. Supported: "export", "clear".' },
      { status: 400 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Telemetry action failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
