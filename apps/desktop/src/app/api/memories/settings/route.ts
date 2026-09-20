import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(_request: NextRequest) {
  const start = Date.now();
  try {
    const { memories } = await getServerServices();
    const settings = await memories.getSettings();
    return handleApiSuccess(settings, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function PUT(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { memories } = await getServerServices();
    const updated = await memories.updateSettings(body);
    return handleApiSuccess(updated, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
