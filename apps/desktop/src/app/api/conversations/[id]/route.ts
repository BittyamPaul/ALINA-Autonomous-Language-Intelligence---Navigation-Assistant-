import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { conversations } = await getServerServices();
    const conv = await conversations.getById(id);
    return handleApiSuccess(conv, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { conversations } = await getServerServices();
    const archived = await conversations.archive(id);
    return handleApiSuccess(archived, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
