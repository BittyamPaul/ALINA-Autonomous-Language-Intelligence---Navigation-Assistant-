import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { agentRuns } = await getServerServices();
    const run = await agentRuns.getById(id);
    return handleApiSuccess(run, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const body = await request.json();
    const { agentRuns } = await getServerServices();
    const updated = await agentRuns.updateRun(id, body);
    return handleApiSuccess(updated, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
