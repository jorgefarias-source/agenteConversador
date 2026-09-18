-- Credenciais de integração vinculadas a um tenant e limitadas por escopos.
-- O token em texto puro nunca é persistido; somente seu SHA-256 é armazenado.

CREATE TABLE IF NOT EXISTS integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_tenant_id
  ON integration_credentials(tenant_id);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_active_hash
  ON integration_credentials(token_hash)
  WHERE status = 'active';

