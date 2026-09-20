import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    if (!body.taskId) {
      return handleApiError(new Error('taskId is required to start an agent run'), start);
    }

    const { agentRuns } = await getServerServices();
    const run = await agentRuns.startRun(body.taskId, body.agentId);
    return handleApiSuccess(run, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
