import { getNetworkReadinessService, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET() {
  const start = Date.now();
  try {
    const networkService = await getNetworkReadinessService();
    const networks = await networkService.scanWifiNetworks();
    return handleApiSuccess(networks, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
