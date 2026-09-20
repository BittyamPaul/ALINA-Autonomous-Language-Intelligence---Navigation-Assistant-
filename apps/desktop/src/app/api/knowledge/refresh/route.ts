import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { knowledge } = await getServerServices();

    if (body.refreshAllStale) {
      const result = await knowledge.refreshStaleKnowledge();
      return handleApiSuccess(result, start);
    }

    if (!body.itemId) {
      return handleApiError(new Error('Missing required parameter "itemId"'), start);
    }

    const refreshed = await knowledge.refresh(body.itemId, body.rawContent);
    return handleApiSuccess(refreshed, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
