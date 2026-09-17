import { query } from './db';

export interface TenantStats {
  id: string;
  slug: string;
  name: string;
  status: string;
  pilotMode: boolean;
  createdAt: string;
  channelAccountIds: string[];
  inboundTotal: number;
  outboundTotal: number;
  pendingHandoff: number;
  uncertainOutbound: number;
  lastMessageAt: string | null;
}

interface Row {
  id: string;
  slug: string;
  name: string;
  status: string;
  pilot_mode: boolean;
  created_at: string;
  channel_account_ids: string[] | null;
  inbound_total: string;
  outbound_total: string;
  pending_handoff: string;
  uncertain_outbound: string;
  last_message_at: string | null;
}

export async function listTenantsWithStats(): Promise<TenantStats[]> {
  const rows = await query<Row>(`
    SELECT
      t.id,
      t.slug,
      t.name,
      t.status,
      t.pilot_mode,
      t.created_at,
      (SELECT array_agg(tc.channel_account_id) FROM tenant_channels tc WHERE tc.tenant_id = t.id) AS channel_account_ids,
      (SELECT count(*)::text FROM inbound_messages im WHERE im.tenant_id = t.id) AS inbound_total,
      (SELECT count(*)::text FROM outbound_messages om WHERE om.tenant_id = t.id) AS outbound_total,
      (SELECT count(*)::text FROM escalations e WHERE e.tenant_id = t.id) AS pending_handoff,
      (SELECT count(*)::text FROM outbound_messages om WHERE om.tenant_id = t.id AND om.status = 'uncertain') AS uncertain_outbound,
      (SELECT max(im.received_at) FROM inbound_messages im WHERE im.tenant_id = t.id) AS last_message_at
    FROM tenants t
    ORDER BY t.created_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    pilotMode: row.pilot_mode,
    createdAt: row.created_at,
    channelAccountIds: row.channel_account_ids ?? [],
    inboundTotal: Number(row.inbound_total),
    outboundTotal: Number(row.outbound_total),
    pendingHandoff: Number(row.pending_handoff),
    uncertainOutbound: Number(row.uncertain_outbound),
    lastMessageAt: row.last_message_at,
  }));
}
