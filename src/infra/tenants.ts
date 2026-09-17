import { query } from './db';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  pilotMode: boolean;
}

export async function resolveTenantByChannel(channelAccountId: string): Promise<Tenant | undefined> {
  const rows = await query<Tenant>(
    `SELECT t.id, t.slug, t.name, t.pilot_mode AS "pilotMode"
       FROM tenant_channels tc
       JOIN tenants t ON t.id = tc.tenant_id
      WHERE tc.channel_account_id = $1 AND t.status = 'active'`,
    [channelAccountId],
  );
  return rows[0];
}

export async function upsertTenantWithChannel(slug: string, name: string, channelAccountId: string): Promise<Tenant> {
  const [tenant] = await query<Tenant>(
    `INSERT INTO tenants (slug, name)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id, slug, name, pilot_mode AS "pilotMode"`,
    [slug, name],
  );

  await query(
    `INSERT INTO tenant_channels (tenant_id, channel_account_id)
     VALUES ($1, $2)
     ON CONFLICT (channel_account_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id`,
    [tenant.id, channelAccountId],
  );

  return tenant;
}

export async function setTenantPilotMode(tenantId: string, pilotMode: boolean): Promise<void> {
  await query('UPDATE tenants SET pilot_mode = $2, updated_at = now() WHERE id = $1', [tenantId, pilotMode]);
}

export async function isPilotSenderAllowed(tenantId: string, senderId: string): Promise<boolean> {
  const rows = await query('SELECT 1 FROM tenant_pilot_senders WHERE tenant_id = $1 AND sender_id = $2', [tenantId, senderId]);
  return rows.length > 0;
}

export async function addPilotSender(tenantId: string, senderId: string): Promise<void> {
  await query(
    `INSERT INTO tenant_pilot_senders (tenant_id, sender_id) VALUES ($1, $2) ON CONFLICT (tenant_id, sender_id) DO NOTHING`,
    [tenantId, senderId],
  );
}

export async function removePilotSender(tenantId: string, senderId: string): Promise<boolean> {
  const rows = await query('DELETE FROM tenant_pilot_senders WHERE tenant_id = $1 AND sender_id = $2 RETURNING id', [
    tenantId,
    senderId,
  ]);
  return rows.length > 0;
}

export async function listPilotSenders(tenantId: string): Promise<string[]> {
  const rows = await query<{ sender_id: string }>(
    'SELECT sender_id FROM tenant_pilot_senders WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return rows.map((row) => row.sender_id);
}
