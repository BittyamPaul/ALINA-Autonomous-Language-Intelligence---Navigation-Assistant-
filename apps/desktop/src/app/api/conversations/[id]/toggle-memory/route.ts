import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const { id } = await params;
    let memoryDisabled: boolean | undefined;

    try {
      const body = await request.json();
      if (body && typeof body.memoryDisabled === 'boolean') {
        memoryDisabled = body.memoryDisabled;
      }
    } catch {
      // Body is optional; toggles if omitted
    }

    const { conversations } = await getServerServices();
    const updated = await conversations.toggleMemory(id, memoryDisabled);
    return handleApiSuccess(updated, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
