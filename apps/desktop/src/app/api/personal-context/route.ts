import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'user_default';
    const projectId = searchParams.get('projectId') || undefined;
    const isUsages = searchParams.get('usages') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const { personalOs, personalContextRepo } = await getServerServices();

    if (isUsages) {
      const usages = await personalOs.getRecentUsages(limit);
      return handleApiSuccess(usages, start);
    }

    if (projectId) {
      const projectGraph = await personalContextRepo.getProjectGraph(projectId);
      return handleApiSuccess(projectGraph, start);
    }

    const unifiedGraph = await personalOs.getUnifiedGraph(userId);
    return handleApiSuccess(unifiedGraph, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function DELETE(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    let nodeId = searchParams.get('nodeId');

    if (!nodeId) {
      try {
        const body = await request.json();
        nodeId = body?.nodeId;
      } catch {
        // searchParams fallback
      }
    }

    if (!nodeId) {
      throw new Error('Node ID is required for forget / deletion request');
    }

    const { personalOs } = await getServerServices();
    const result = await personalOs.forget(nodeId);
    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { personalContextRepo } = await getServerServices();

    if (body.action === 'relate') {
      const edge = await personalContextRepo.relate(
        body.fromId,
        body.fromType,
        body.relation,
        body.toId,
        body.toType,
        body.weight,
        body.metadata
      );
      return handleApiSuccess(edge, start);
    }

    if (body.node) {
      const savedNode = await personalContextRepo.upsertNode(body.node);
      return handleApiSuccess(savedNode, start);
    }

    throw new Error('Unsupported personal context action');
  } catch (err) {
    return handleApiError(err, start);
  }
}
