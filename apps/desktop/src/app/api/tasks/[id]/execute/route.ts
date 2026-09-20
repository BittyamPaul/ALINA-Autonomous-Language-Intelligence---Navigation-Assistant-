import { NextRequest } from 'next/server';
import {
  getServerServices,
  getSupervisorAgent,
  handleApiSuccess,
  handleApiError,
} from '@/lib/server-services';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { tasks } = await getServerServices();

    // 1. Fetch task metadata if goal not explicitly supplied in body
    let goal = body.goal;
    let workspaceId = body.workspaceId;

    if (!goal) {
      try {
        const existing = await tasks.getById(id);
        if (existing?.task) {
          goal = existing.task.goal;
          workspaceId = workspaceId || existing.task.workspaceId;
        }
      } catch {
        // Fallback if not yet committed
      }
    }

    if (!goal) {
      return handleApiError(
        new Error(`Cannot execute task "${id}": Goal is required`),
        start
      );
    }

    // 2. Ensure task status is transitioning out of planning
    try {
      await tasks.updateStatus(id, {
        status: 'running',
        resultSummary: 'Executing verified autonomous plan...',
      });
    } catch {
      // Non-blocking
    }

    // 3. Invoke AlinaSupervisorAgent autonomous loop
    const supervisor = await getSupervisorAgent();
    const result = await supervisor.execute({
      taskId: id,
      goal,
      workspaceId: workspaceId || 'ws_alina_main',
      isApprovalGranted: Boolean(body.isApprovalGranted),
      grantToken: body.grantToken,
      jailRoot: body.jailRoot || process.cwd(),
    });

    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
