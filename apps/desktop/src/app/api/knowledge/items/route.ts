import { NextRequest } from 'next/server';
import { getServerServices, handleApiSuccess, handleApiError } from '@/lib/server-services';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || undefined;
    const topic = searchParams.get('topic') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 25;

    const { knowledge } = await getServerServices();

    if (query) {
      const results = await knowledge.search(query, {
        topic,
        projectId,
        limit,
      });
      return handleApiSuccess(results, start);
    }

    if (projectId) {
      const projectItems = await knowledge.getRepository().findItemsByProject(projectId);
      return handleApiSuccess(projectItems, start);
    }

    if (topic) {
      const topicItems = await knowledge.getRepository().findItemsByTopic(topic);
      return handleApiSuccess(topicItems, start);
    }

    // Default list all items
    const allItems = await knowledge.getRepository().findItemsByTopic('');
    return handleApiSuccess(allItems.slice(0, limit), start);
  } catch (err) {
    return handleApiError(err, start);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { knowledge } = await getServerServices();

    // Check if this is a working knowledge addition
    if (body.type === 'working_knowledge') {
      const working = knowledge.addWorkingKnowledgeFact(body.taskId, {
        title: body.title,
        url: body.url,
        snippet: body.snippet,
        domain: body.domain,
      });
      return handleApiSuccess(working, start);
    }

    // Check if this is a promotion from working knowledge
    if (body.type === 'promote') {
      const promoted = await knowledge.promoteWorkingKnowledge(
        body.taskId,
        body.factId,
        body.topic || 'General Technical Knowledge',
        body.projectId
      );
      return handleApiSuccess(promoted, start);
    }

    // Standard persistent knowledge acquisition
    const result = await knowledge.acquire({
      goal: body.goal || `Research ${body.topic || body.title}`,
      url: body.url,
      title: body.title,
      rawContent: body.rawContent || body.content,
      topic: body.topic,
      projectId: body.projectId,
      taskId: body.taskId,
      refreshPolicyType: body.refreshPolicyType,
      intervalDays: body.intervalDays,
    });

    return handleApiSuccess(result, start);
  } catch (err) {
    return handleApiError(err, start);
  }
}
