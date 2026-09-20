import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recommendation';
    const targetId = searchParams.get('targetId') || searchParams.get('id') || searchParams.get('q') || '';

    const { knowledge } = await getServerServices();

    if (type === 'project') {
      const summary = await knowledge.explainProjectKnowledge(targetId);
      return handleApiSuccess(summary, start);
    }

    if (type === 'provenance') {
      const provenance = await knowledge.explainProvenance(targetId);
      if (!provenance) {
        return handleApiError(new Error(`Knowledge item "${targetId}" not found`), start);
      }
      return handleApiSuccess(provenance, start);
    }

    // Default: explain recommendation
    const explanation = await knowledge.explainRecommendation(targetId);
    return handleApiSuccess(explanation, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
