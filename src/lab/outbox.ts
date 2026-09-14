import { randomUUID } from 'node:crypto';

export interface OutboundItem {
  deliveryId: string;
  receiptId: string;
  messageId: string;
  channelAccountId: string;
  senderId: string;
  responseText: string;
  source: 'faq-matched' | 'fallback-human';
  sourceVersion: string;
  status: 'pending' | 'dispatched' | 'canceled' | 'uncertain';
  createdAt: string;
  claimedUntil?: string;
}

const outbox = new Map<string, OutboundItem>();

export function enqueueOutbound(item: Omit<OutboundItem, 'deliveryId' | 'status' | 'createdAt' | 'claimedUntil'>): OutboundItem {
  const deliveryId = `del-${randomUUID()}`;
  const outbound: OutboundItem = {
    ...item,
    deliveryId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  outbox.set(deliveryId, outbound);
  return outbound;
}

export function claimOutbound(limitSec = 10): OutboundItem | undefined {
  const now = Date.now();
  const entry = [...outbox.values()].find((row) => {
    if (row.status !== 'pending') {
      return false;
    }

    if (!row.claimedUntil) {
      return true;
    }

    return new Date(row.claimedUntil).getTime() < now;
  });

  if (!entry) {
    return undefined;
  }

  const updated = {
    ...entry,
    claimedUntil: new Date(now + limitSec * 1000).toISOString(),
  };

  outbox.set(entry.deliveryId, updated);
  return updated;
}

export function markDispatched(deliveryId: string, success: boolean, reason?: string): OutboundItem | undefined {
  const row = outbox.get(deliveryId);
  if (!row) {
    return undefined;
  }

  const updated: OutboundItem = {
    ...row,
    status: success ? 'dispatched' : 'uncertain',
    claimedUntil: row.claimedUntil,
  };
  if (!success) {
    (updated as any).failureReason = reason ?? 'resultado incerto do conector';
  }

  outbox.set(deliveryId, updated);
  return updated;
}

export function pauseBySender(senderId: string): void {
  for (const [deliveryId, row] of outbox.entries()) {
    if (row.senderId === senderId && row.status === 'pending') {
      outbox.set(deliveryId, { ...row, status: 'canceled' });
    }
  }
}

export function allOutbound() {
  return [...outbox.values()];
}
