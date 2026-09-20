import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || undefined;

    const { approvals } = await getServerServices();
    const list = await approvals.listPending(taskId);
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { approvals } = await getServerServices();
    const created = await approvals.createGate(body);
    return handleApiSuccess(created, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
