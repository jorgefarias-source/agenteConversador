import { query } from '../infra/db';

export interface MenuItem {
  id: string;
  name: string;
  section: string;
  priceText: string;
}

export interface OrderSnapshot {
  reference: string;
  status: string;
  createdAt: string;
  totalText: string;
}

function formatBRL(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function normalizeRef(value: string): string {
  return value.trim().toUpperCase();
}

interface MenuItemRow {
  id: string;
  section: string;
  name: string;
  price: string;
}

export async function getMenuForTenant(tenantId: string): Promise<MenuItem[]> {
  const rows = await query<MenuItemRow>(
    `SELECT id, section, name, price FROM menu_items WHERE tenant_id = $1 ORDER BY section, name`,
    [tenantId],
  );
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    name: row.name,
    priceText: formatBRL(row.price),
  }));
}

async function resolveCustomerId(tenantId: string, channelAccountId: string, senderId: string): Promise<string | undefined> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM customers WHERE tenant_id = $1 AND channel_account_id = $2 AND sender_id = $3`,
    [tenantId, channelAccountId, senderId],
  );
  return rows[0]?.id;
}

interface OrderRow {
  reference: string;
  status: string;
  total: string;
  created_at: string;
}

function toOrderSnapshot(row: OrderRow): OrderSnapshot {
  return {
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at,
    totalText: formatBRL(row.total),
  };
}

export async function resolveOrderForCustomer(
  tenantId: string,
  channelAccountId: string,
  senderId: string,
  reference: string,
): Promise<OrderSnapshot | undefined> {
  const customerId = await resolveCustomerId(tenantId, channelAccountId, senderId);
  if (!customerId) {
    return undefined;
  }
  const rows = await query<OrderRow>(
    `SELECT reference, status, total, created_at FROM orders
      WHERE tenant_id = $1 AND customer_id = $2 AND reference = $3`,
    [tenantId, customerId, normalizeRef(reference)],
  );
  return rows[0] ? toOrderSnapshot(rows[0]) : undefined;
}

export async function listCustomerOrders(tenantId: string, channelAccountId: string, senderId: string): Promise<OrderSnapshot[]> {
  const customerId = await resolveCustomerId(tenantId, channelAccountId, senderId);
  if (!customerId) {
    return [];
  }
  const rows = await query<OrderRow>(
    `SELECT reference, status, total, created_at FROM orders WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at ASC`,
    [tenantId, customerId],
  );
  return rows.map(toOrderSnapshot);
}
