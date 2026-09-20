import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';
import type { TaskStatus } from '@alina/database';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || undefined;
    const status = (searchParams.get('status') as TaskStatus) || undefined;

    const { tasks } = await getServerServices();
    const list = await tasks.list({ workspaceId, status });
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { tasks } = await getServerServices();
    const created = await tasks.create(body);
    return handleApiSuccess(created, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
