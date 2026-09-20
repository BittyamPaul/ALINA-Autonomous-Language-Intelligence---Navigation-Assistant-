import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const body = await request.json();
    const { memories } = await getServerServices();
    const updated = await memories.update_memory(id, body);
    return handleApiSuccess(updated, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { memories } = await getServerServices();
    const deleted = await memories.forget_memory(id);
    return handleApiSuccess({ deleted, id }, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
