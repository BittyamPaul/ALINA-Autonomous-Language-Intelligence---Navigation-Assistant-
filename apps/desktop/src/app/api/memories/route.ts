import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';
import type { MemoryCategory, MemoryLayer, EpistemicTier } from '@alina/database';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get('category') as MemoryCategory) || undefined;
    const layer = (searchParams.get('layer') as MemoryLayer) || undefined;
    const epistemicTier = (searchParams.get('tier') as EpistemicTier) || (searchParams.get('epistemicTier') as EpistemicTier) || undefined;
    const query = searchParams.get('q') || searchParams.get('query') || undefined;

    const { memories } = await getServerServices();

    if (query) {
      const recalled = await memories.recall(query, { category, layer, epistemicTier, limit: 25 });
      return handleApiSuccess(recalled, start);
    }

    const list = await memories.list(layer, category);
    let result = list;
    if (epistemicTier) {
      result = result.filter((m) => m.epistemicTier === epistemicTier);
    }
    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { memories } = await getServerServices();

    // Check for decay action
    if (body && body.action === 'decay') {
      const decayResult = await memories.decay(body.options);
      return handleApiSuccess(decayResult, start);
    }

    // Check if this is a semantic search / recall query
    if (body && (Array.isArray(body.queryEmbedding) || typeof body.query === 'string')) {
      const searchResults = await memories.search_memory(body);
      return handleApiSuccess(searchResults, start);
    }

    // Otherwise standard memory creation via extraction & validation rules
    const created = await memories.remember(body);
    return handleApiSuccess(created, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
