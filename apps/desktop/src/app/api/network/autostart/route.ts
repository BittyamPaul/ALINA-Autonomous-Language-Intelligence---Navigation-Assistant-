import { NextRequest } from 'next/server';
import { getNetworkReadinessService, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET() {
  const start = Date.now();
  try {
    const networkService = await getNetworkReadinessService();
    const config = await networkService.getAutoStartConfig();
    return handleApiSuccess(config, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = (await request.json()) as { enabled?: boolean };
    const networkService = await getNetworkReadinessService();
    const enabled = body?.enabled ?? false;
    await networkService.setAutoStart(enabled);
    return handleApiSuccess({ success: true, enabled }, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
