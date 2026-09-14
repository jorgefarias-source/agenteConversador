import { randomUUID } from 'node:crypto';

export interface IncomingMessagePayload {
  schema_version: '1';
  message_id: string;
  channel_account_id: string;
  sender_id: string;
  sent_at: string;
  type: 'text';
  text: string;
}

export interface PersistedWork {
  receiptId: string;
  messageId: string;
  channelAccountId: string;
  senderId: string;
  text: string;
  status: 'accepted' | 'duplicate';
  duplicate: boolean;
  traceId: string;
  receivedAt: string;
  dedupeKey: string;
}

const memoryStore = new Map<string, PersistedWork>();

export function dedupeKey(payload: Pick<IncomingMessagePayload, 'channel_account_id' | 'message_id'>) {
  return `${payload.channel_account_id}|${payload.message_id}`;
}

export function acceptIncoming(payload: IncomingMessagePayload): PersistedWork {
  const key = dedupeKey(payload);
  const now = new Date().toISOString();

  if (memoryStore.has(key)) {
    const existing = memoryStore.get(key)!;
    return { ...existing, status: 'duplicate', duplicate: true };
  }

  const work: PersistedWork = {
    receiptId: `rec-${randomUUID()}`,
    messageId: payload.message_id,
    channelAccountId: payload.channel_account_id,
    senderId: payload.sender_id,
    text: payload.text,
    status: 'accepted',
    duplicate: false,
    traceId: randomUUID(),
    receivedAt: now,
    dedupeKey: key,
  };

  memoryStore.set(key, work);
  return work;
}

export function allWork() {
  return Array.from(memoryStore.values());
}
