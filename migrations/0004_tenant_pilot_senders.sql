-- Migration 0004: substitui a lista global PILOT_SENDERS (variável de ambiente) por
-- configuração por tenant. Produção real deve atender qualquer remetente (pilot_mode = false);
-- a lista de remetentes autorizados só importa durante um piloto controlado por negócio.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pilot_mode BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS tenant_pilot_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_pilot_senders_tenant_id ON tenant_pilot_senders(tenant_id);
