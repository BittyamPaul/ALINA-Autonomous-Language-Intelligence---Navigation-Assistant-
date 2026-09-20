import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';
import type { MemoryCategory, MemoryLayer } from '@alina/database';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get('category') as MemoryCategory) || undefined;
    const layer = (searchParams.get('layer') as MemoryLayer) || undefined;
    const query = searchParams.get('q') || searchParams.get('query') || undefined;

    const { memories } = await getServerServices();

    if (query) {
      const recalled = await memories.recall(query, { category, layer, limit: 20 });
      return handleApiSuccess(recalled, start);
    }

    const list = await memories.list(layer, category);
    return handleApiSuccess(list, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { memories } = await getServerServices();

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
