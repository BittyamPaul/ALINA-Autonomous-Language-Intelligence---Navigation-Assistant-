import { getNetworkReadinessService, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function POST() {
  const start = Date.now();
  try {
    const networkService = await getNetworkReadinessService();
    const result = await networkService.onNetworkRestored();
    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
