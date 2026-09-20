import { NextRequest } from 'next/server';
import {
  getServerServices,
  getSupervisorAgent,
  handleApiSuccess,
  handleApiError,
} from '@/lib/server-services';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const { tasks } = await getServerServices();

    const taskId = body.taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const goal = body.goal;

    if (!goal) {
      return handleApiError(new Error('Goal is required for task execution'), start);
    }

    // Ensure persisted
    try {
      await tasks.create({
        id: taskId,
        goal,
        workspaceId: body.workspaceId || 'ws_alina_main',
      });
    } catch {
      // Continue if exists
    }

    // Transition state
    try {
      await tasks.updateStatus(taskId, {
        status: 'running',
        resultSummary: 'Executing plan...',
      });
    } catch {
      // Non-blocking
    }

    const supervisor = await getSupervisorAgent();
    const result = await supervisor.execute({
      taskId,
      goal,
      workspaceId: body.workspaceId || 'ws_alina_main',
      isApprovalGranted: Boolean(body.isApprovalGranted),
      grantToken: body.grantToken,
      jailRoot: body.jailRoot || process.cwd(),
    });

    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
