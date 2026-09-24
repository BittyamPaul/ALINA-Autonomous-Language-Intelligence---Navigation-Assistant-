import { NextRequest } from 'next/server';
import { getNetworkReadinessService, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = (await request.json()) as { ssid: string; password?: string };
    const networkService = await getNetworkReadinessService();
    const result = await networkService.connectWifi(body.ssid, body.password);
    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
