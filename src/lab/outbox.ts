import { randomUUID } from 'node:crypto';
import { query } from '../infra/db';
import { getRetentionDays } from '../infra/retention';

export interface OutboundItem {
  deliveryId: string;
  receiptId: string;
  messageId: string;
  channelAccountId: string;
  senderId: string;
  responseText: string;
  source: 'faq-matched' | 'fallback-human' | 'llm-paid' | 'cardapio-consult' | 'pedido-consult' | 'tenant-resource';
  sourceVersion: string;
  status: 'pending' | 'dispatched' | 'canceled' | 'uncertain';
  createdAt: string;
  claimedUntil?: string;
  claimToken?: string;
  failureReason?: string;
}

interface OutboundRow {
  delivery_id: string;
  receipt_id: string;
  message_id: string;
  channel_account_id: string;
  sender_id: string;
  response_text: string;
  source: OutboundItem['source'];
  source_version: string;
  status: OutboundItem['status'];
  created_at: string;
  claimed_until: string | null;
  claim_token: string | null;
  failure_reason: string | null;
}

function toItem(row: OutboundRow): OutboundItem {
  return {
    deliveryId: row.delivery_id,
    receiptId: row.receipt_id,
    messageId: row.message_id,
    channelAccountId: row.channel_account_id,
    senderId: row.sender_id,
    responseText: row.response_text,
    source: row.source,
    sourceVersion: row.source_version,
    status: row.status,
    createdAt: row.created_at,
    claimedUntil: row.claimed_until ?? undefined,
    claimToken: row.claim_token ?? undefined,
    failureReason: row.failure_reason ?? undefined,
  };
}

export async function enqueueOutbound(
  tenantId: string,
  item: Omit<OutboundItem, 'deliveryId' | 'status' | 'createdAt' | 'claimedUntil'>,
): Promise<OutboundItem> {
  const deliveryId = `del-${randomUUID()}`;
  const [row] = await query<OutboundRow>(
    `INSERT INTO outbound_messages
       (tenant_id, delivery_id, receipt_id, message_id, channel_account_id, sender_id, response_text, source, source_version, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [
      tenantId,
      deliveryId,
      item.receiptId,
      item.messageId,
      item.channelAccountId,
      item.senderId,
      item.responseText,
      item.source,
      item.sourceVersion,
    ],
  );
  return toItem(row);
}

export async function claimOutbound(claimSeconds = 15, tenantId?: string): Promise<OutboundItem | undefined> {
  const claimToken = randomUUID();
  const [row] = await query<OutboundRow>(
    `UPDATE outbound_messages
        SET claim_token = $1, claimed_until = now() + ($2 || ' seconds')::interval
      WHERE id = (
        SELECT id FROM outbound_messages
         WHERE status = 'pending' AND (claimed_until IS NULL OR claimed_until < now())
           AND ($3::uuid IS NULL OR tenant_id = $3::uuid)
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    [claimToken, claimSeconds, tenantId ?? null],
  );
  return row ? toItem(row) : undefined;
}

export async function markDispatched(
  deliveryId: string,
  claimToken: string,
  success: boolean,
  reason?: string,
  tenantId?: string,
): Promise<{ ok: true; item: OutboundItem } | { ok: false; reason: 'not_found' | 'invalid_claim_token' }> {
  const [existing] = await query<OutboundRow>(
    `SELECT * FROM outbound_messages
      WHERE delivery_id = $1 AND ($2::uuid IS NULL OR tenant_id = $2::uuid)`,
    [deliveryId, tenantId ?? null],
  );
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  if (existing.claim_token !== claimToken) {
    return { ok: false, reason: 'invalid_claim_token' };
  }

  const [row] = await query<OutboundRow>(
    `UPDATE outbound_messages
        SET status = $2, failure_reason = $3
      WHERE delivery_id = $1 AND ($4::uuid IS NULL OR tenant_id = $4::uuid)
      RETURNING *`,
    [deliveryId, success ? 'dispatched' : 'uncertain', success ? null : reason ?? 'resultado incerto do conector', tenantId ?? null],
  );
  return { ok: true, item: toItem(row) };
}

export async function pauseBySender(tenantId: string, channelAccountId: string, senderId: string): Promise<void> {
  await query(
    `UPDATE outbound_messages
        SET status = 'canceled'
      WHERE tenant_id = $1 AND channel_account_id = $2 AND sender_id = $3 AND status = 'pending'`,
    [tenantId, channelAccountId, senderId],
  );
}

export async function allOutbound(tenantId?: string): Promise<OutboundItem[]> {
  const rows = await query<OutboundRow>(
    `SELECT * FROM outbound_messages
      WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)
      ORDER BY created_at ASC`,
    [tenantId ?? null],
  );
  return rows.map(toItem);
}

export async function outboundCount(tenantId?: string): Promise<number> {
  const [row] = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM outbound_messages
      WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)`,
    [tenantId ?? null],
  );
  return Number(row?.count ?? 0);
}

export async function outboundPendingCount(tenantId?: string): Promise<number> {
  const [row] = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM outbound_messages
      WHERE status = 'pending' AND ($1::uuid IS NULL OR tenant_id = $1::uuid)`,
    [tenantId ?? null],
  );
  return Number(row?.count ?? 0);
}

export async function purgeExpiredOutbound(): Promise<number> {
  const rows = await query(
    `DELETE FROM outbound_messages WHERE created_at < now() - ($1 || ' days')::interval RETURNING id`,
    [getRetentionDays()],
  );
  return rows.length;
}

export async function resetOutbound(tenantId?: string): Promise<void> {
  await query('DELETE FROM outbound_messages WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid)', [tenantId ?? null]);
}
