import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');

    if (!nodeId) {
      throw new Error('Node ID is required to explain memory provenance');
    }

    const { personalOs } = await getServerServices();
    const explanation = await personalOs.explainMemory(nodeId);

    if (!explanation) {
      throw new Error(`Context node not found with ID: ${nodeId}`);
    }

    return handleApiSuccess(explanation, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
