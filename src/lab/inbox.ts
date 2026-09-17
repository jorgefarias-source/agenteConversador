import { randomUUID } from 'node:crypto';
import { query } from '../infra/db';
import { getRetentionDays } from '../infra/retention';

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

function dedupeKey(payload: Pick<IncomingMessagePayload, 'channel_account_id' | 'message_id'>) {
  return `${payload.channel_account_id}|${payload.message_id}`;
}

interface InboundRow {
  receipt_id: string;
  message_id: string;
  channel_account_id: string;
  sender_id: string;
  text: string;
  status: string;
  trace_id: string;
  received_at: string;
  dedupe_key: string;
}

function toWork(row: InboundRow): PersistedWork {
  return {
    receiptId: row.receipt_id,
    messageId: row.message_id,
    channelAccountId: row.channel_account_id,
    senderId: row.sender_id,
    text: row.text,
    status: row.status as PersistedWork['status'],
    duplicate: row.status === 'duplicate',
    traceId: row.trace_id,
    receivedAt: row.received_at,
    dedupeKey: row.dedupe_key,
  };
}

export async function acceptIncoming(tenantId: string, payload: IncomingMessagePayload): Promise<PersistedWork> {
  const existing = await query<InboundRow>(
    `SELECT * FROM inbound_messages WHERE channel_account_id = $1 AND message_id = $2`,
    [payload.channel_account_id, payload.message_id],
  );

  if (existing[0]) {
    const work = toWork(existing[0]);
    return { ...work, status: 'duplicate', duplicate: true };
  }

  const receiptId = `rec-${randomUUID()}`;
  const traceId = randomUUID();

  const [row] = await query<InboundRow>(
    `INSERT INTO inbound_messages (tenant_id, receipt_id, message_id, channel_account_id, sender_id, text, status, trace_id, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'accepted', $7, $8)
     RETURNING *`,
    [tenantId, receiptId, payload.message_id, payload.channel_account_id, payload.sender_id, payload.text, traceId, dedupeKey(payload)],
  );

  return toWork(row);
}

export async function allWork(): Promise<PersistedWork[]> {
  const rows = await query<InboundRow>(`SELECT * FROM inbound_messages ORDER BY received_at ASC`);
  return rows.map(toWork);
}

export async function inboundCount(): Promise<number> {
  const [row] = await query<{ count: string }>(`SELECT count(*)::text AS count FROM inbound_messages`);
  return Number(row?.count ?? 0);
}

export async function purgeExpiredInbound(): Promise<number> {
  const rows = await query(
    `DELETE FROM inbound_messages WHERE received_at < now() - ($1 || ' days')::interval RETURNING id`,
    [getRetentionDays()],
  );
  return rows.length;
}

export async function resetWork(): Promise<void> {
  await query('DELETE FROM inbound_messages');
}
