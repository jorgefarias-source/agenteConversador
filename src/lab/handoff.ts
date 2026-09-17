import { query } from '../infra/db';
import { getRetentionDays } from '../infra/retention';

export interface EscalatedSender {
  senderKey: string;
  channelAccountId: string;
  senderId: string;
  reason: string;
  escalatedAt: string;
}

interface EscalationRow {
  channel_account_id: string;
  sender_id: string;
  reason: string;
  escalated_at: string;
}

function toEscalated(row: EscalationRow): EscalatedSender {
  return {
    senderKey: `${row.channel_account_id}:${row.sender_id}`,
    channelAccountId: row.channel_account_id,
    senderId: row.sender_id,
    reason: row.reason,
    escalatedAt: row.escalated_at,
  };
}

export async function escalateSender(tenantId: string, channelAccountId: string, senderId: string, reason: string): Promise<void> {
  await query(
    `INSERT INTO escalations (tenant_id, channel_account_id, sender_id, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_account_id, sender_id) DO NOTHING`,
    [tenantId, channelAccountId, senderId, reason],
  );
}

export async function isEscalated(channelAccountId: string, senderId: string): Promise<boolean> {
  const rows = await query(`SELECT 1 FROM escalations WHERE channel_account_id = $1 AND sender_id = $2`, [
    channelAccountId,
    senderId,
  ]);
  return rows.length > 0;
}

export async function resolveSender(channelAccountId: string, senderId: string): Promise<boolean> {
  const rows = await query(
    `DELETE FROM escalations WHERE channel_account_id = $1 AND sender_id = $2 RETURNING id`,
    [channelAccountId, senderId],
  );
  return rows.length > 0;
}

export async function listEscalated(): Promise<EscalatedSender[]> {
  const rows = await query<EscalationRow>(`SELECT * FROM escalations ORDER BY escalated_at ASC`);
  return rows.map(toEscalated);
}

export async function purgeExpiredEscalations(): Promise<number> {
  const rows = await query(
    `DELETE FROM escalations WHERE escalated_at < now() - ($1 || ' days')::interval RETURNING id`,
    [getRetentionDays()],
  );
  return rows.length;
}

export async function resetEscalations(): Promise<void> {
  await query('DELETE FROM escalations');
}
