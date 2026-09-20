import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || undefined;

    const { conversations } = await getServerServices();
    const list = await conversations.list(workspaceId);
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { conversations } = await getServerServices();
    const created = await conversations.create(body);
    return handleApiSuccess(created, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
