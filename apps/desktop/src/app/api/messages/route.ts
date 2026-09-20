import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    if (!conversationId) {
      return handleApiError(new Error('Query parameter conversationId is required'), start);
    }

    const { messages } = await getServerServices();
    const list = await messages.listForConversation(conversationId);
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { messages } = await getServerServices();
    const created = await messages.send(body);
    return handleApiSuccess(created, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
