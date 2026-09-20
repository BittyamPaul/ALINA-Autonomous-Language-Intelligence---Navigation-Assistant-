import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET() {
  const start = Date.now();
  try {
    const { tools } = await getServerServices();
    const list = tools.listAvailableTools();
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { tools } = await getServerServices();
    const logged = await tools.logToolCall(body);
    return handleApiSuccess(logged, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
