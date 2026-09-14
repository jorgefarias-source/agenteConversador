import { randomUUID } from 'node:crypto';

import { clearState, getStatePath, loadState, saveState } from './storage';

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
const initialState = loadState();

for (const item of initialState.outbound) {
  outbox.set(item.deliveryId, item);
}

function syncState() {
  const state = loadState();
  saveState({
    ...state,
    outbound: Array.from(outbox.values()),
  });
}

export function enqueueOutbound(item: Omit<OutboundItem, 'deliveryId' | 'status' | 'createdAt' | 'claimedUntil'>): OutboundItem {
  const deliveryId = `del-${randomUUID()}`;
  const outbound: OutboundItem = {
    ...item,
    deliveryId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  outbox.set(deliveryId, outbound);
  syncState();
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
  syncState();
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
  syncState();
  return updated;
}

export function pauseBySender(senderId: string): void {
  let changed = false;
  for (const [deliveryId, row] of outbox.entries()) {
    if (row.senderId === senderId && row.status === 'pending') {
      outbox.set(deliveryId, { ...row, status: 'canceled' });
      changed = true;
    }
  }
  if (changed) {
    syncState();
  }
}

export function allOutbound() {
  return Array.from(outbox.values());
}

export function resetOutbound() {
  outbox.clear();
  clearState();
}

export function outboundCount() {
  return outbox.size;
}

export function outboundPendingCount() {
  return Array.from(outbox.values()).filter((item) => item.status === 'pending').length;
}

export function stateFilePath() {
  return getStatePath();
}
