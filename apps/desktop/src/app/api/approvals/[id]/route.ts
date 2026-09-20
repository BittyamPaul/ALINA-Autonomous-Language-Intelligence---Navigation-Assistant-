import { NextRequest } from 'next/server';
import { AlinaServiceError } from '@alina/agent';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { approvals } = await getServerServices();
    const entity = await approvals.getById(id);
    if (!entity) {
      return handleApiError(new AlinaServiceError(`Approval "${id}" not found`, 'NOT_FOUND', 404), start);
    }
    return handleApiSuccess(entity, start);
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
    const { approvals } = await getServerServices();
    const resolved = await approvals.resolve(id, body);
    return handleApiSuccess(resolved, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || 'Cancelled by operator';
    const { approvals } = await getServerServices();
    const cancelled = await approvals.cancel(id, reason);
    return handleApiSuccess(cancelled, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
