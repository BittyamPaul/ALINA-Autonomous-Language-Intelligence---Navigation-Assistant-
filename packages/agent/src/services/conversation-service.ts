import { z } from 'zod';
import {
  AlinaDatabaseClient,
  BaseRepository,
  ConversationSchema,
  MessageSchema,
  GraphRepository,
  type ConversationEntity,
  type MessageEntity,
} from '@alina/database';
import { AlinaServiceError } from './base-service';

export const CreateConversationInputSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  title: z.string().min(1, 'Title is required').max(200),
  summary: z.string().optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationInputSchema>;

export class ConversationService {
  private convRepo: BaseRepository<ConversationEntity>;
  private graphRepo: GraphRepository;

  constructor(client: AlinaDatabaseClient) {
    this.convRepo = new BaseRepository(client, 'conversation', ConversationSchema);
    this.graphRepo = new GraphRepository(client);
  }

  public async create(input: CreateConversationInput, userId = 'default_operator'): Promise<ConversationEntity> {
    const validated = CreateConversationInputSchema.parse(input);
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const entity: ConversationEntity = {
      id,
      workspaceId: validated.workspaceId,
      title: validated.title,
      summary: validated.summary,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await this.convRepo.create(entity);
    await this.graphRepo.relate(`user:${userId}`, 'started', `conversation:${created.id}`);
    return created;
  }

  public async getById(id: string): Promise<ConversationEntity> {
    const conv = await this.convRepo.findById(id);
    if (!conv) {
      throw new AlinaServiceError(`Conversation with ID ${id} was not found`, 'NOT_FOUND', 404);
    }
    return conv;
  }

  public async list(workspaceId?: string): Promise<ConversationEntity[]> {
    const all = await this.convRepo.list();
    if (workspaceId) {
      return all.filter((c) => c.workspaceId === workspaceId);
    }
    return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async archive(id: string): Promise<ConversationEntity> {
    const updated = await this.convRepo.update(id, {
      status: 'archived',
      updatedAt: new Date().toISOString(),
    });
    if (!updated) {
      throw new AlinaServiceError(`Conversation with ID ${id} was not found`, 'NOT_FOUND', 404);
    }
    return updated;
  }

  public async toggleMemory(id: string, memoryDisabled?: boolean): Promise<ConversationEntity> {
    const current = await this.getById(id);
    const newValue = memoryDisabled !== undefined ? memoryDisabled : !current.memoryDisabled;
    const updated = await this.convRepo.update(id, {
      memoryDisabled: newValue,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) {
      throw new AlinaServiceError(`Conversation with ID ${id} was not found`, 'NOT_FOUND', 404);
    }
    return updated;
  }
}

export const SendMessageInputSchema = z.object({
  conversationId: z.string().min(1, 'Conversation ID is required'),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1, 'Message content cannot be empty'),
  reasoning: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export class MessageService {
  private msgRepo: BaseRepository<MessageEntity>;
  private convRepo: BaseRepository<ConversationEntity>;
  private graphRepo: GraphRepository;

  constructor(client: AlinaDatabaseClient) {
    this.msgRepo = new BaseRepository(client, 'message', MessageSchema);
    this.convRepo = new BaseRepository(client, 'conversation', ConversationSchema);
    this.graphRepo = new GraphRepository(client);
  }

  public async send(input: SendMessageInput): Promise<MessageEntity> {
    const validated = SendMessageInputSchema.parse(input);

    const conv = await this.convRepo.findById(validated.conversationId);
    if (!conv) {
      throw new AlinaServiceError(
        `Cannot send message: Conversation ${validated.conversationId} not found`,
        'CONVERSATION_NOT_FOUND',
        404
      );
    }

    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const message: MessageEntity = {
      id,
      conversationId: validated.conversationId,
      role: validated.role,
      content: validated.content,
      reasoning: validated.reasoning,
      metadata: validated.metadata,
      createdAt: new Date().toISOString(),
    };

    const created = await this.msgRepo.create(message);
    await this.graphRepo.relate(`conversation:${conv.id}`, 'contains', `message:${created.id}`);

    // Update conversation updatedAt timestamp
    await this.convRepo.update(conv.id, { updatedAt: new Date().toISOString() });
    return created;
  }

  public async listForConversation(conversationId: string): Promise<MessageEntity[]> {
    const all = await this.msgRepo.list(500);
    return all
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}
