import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { query } from './db';

export const INTEGRATION_SCOPES = [
  'messages:write',
  'handoff:read',
  'handoff:write',
  'config:read',
  'config:write',
  'whatsapp:read',
  'whatsapp:write',
  'observability:read',
  'observability:reset',
  'outbound:write',
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export type AuthPrincipal =
  | { kind: 'admin' }
  | { kind: 'integration'; credentialId: string; tenantId: string; scopes: IntegrationScope[] };

interface CredentialRow {
  id: string;
  tenant_id: string;
  scopes: string[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isIntegrationScope(value: string): value is IntegrationScope {
  return (INTEGRATION_SCOPES as readonly string[]).includes(value);
}

export function principalHasScope(principal: AuthPrincipal, scope: IntegrationScope): boolean {
  return principal.kind === 'admin' || principal.scopes.includes(scope);
}

export function principalCanAccessTenant(principal: AuthPrincipal, tenantId: string): boolean {
  return principal.kind === 'admin' || principal.tenantId === tenantId;
}

export async function authenticateBearerToken(token: string, adminToken?: string): Promise<AuthPrincipal | undefined> {
  if (!token) return undefined;

  if (adminToken && constantTimeEqual(token, adminToken)) {
    return { kind: 'admin' };
  }

  const [credential] = await query<CredentialRow>(
    `SELECT id, tenant_id, scopes
       FROM integration_credentials
      WHERE token_hash = $1 AND status = 'active'`,
    [hashToken(token)],
  );
  if (!credential) return undefined;

  const scopes = credential.scopes.filter(isIntegrationScope);
  await query('UPDATE integration_credentials SET last_used_at = now() WHERE id = $1', [credential.id]);
  return { kind: 'integration', credentialId: credential.id, tenantId: credential.tenant_id, scopes };
}

export async function createIntegrationCredential(
  tenantId: string,
  name: string,
  scopes: IntegrationScope[],
): Promise<{ id: string; token: string; name: string; scopes: IntegrationScope[] }> {
  const token = `jcs_int_${randomBytes(32).toString('base64url')}`;
  const [row] = await query<{ id: string }>(
    `INSERT INTO integration_credentials (tenant_id, name, token_hash, scopes)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, name.trim(), hashToken(token), scopes],
  );
  return { id: row.id, token, name: name.trim(), scopes };
}

export async function revokeIntegrationCredential(tenantId: string, credentialId: string): Promise<boolean> {
  const rows = await query(
    `UPDATE integration_credentials
        SET status = 'revoked', revoked_at = now()
      WHERE id = $1 AND tenant_id = $2 AND status = 'active'
      RETURNING id`,
    [credentialId, tenantId],
  );
  return rows.length > 0;
}
