-- Migration 0003: sessão de autenticação do conector não-oficial de WhatsApp (Baileys).
-- Guardada no Postgres (não em arquivo local) para sobreviver a redeploys/reinícios
-- do serviço sem exigir escanear o QR code de novo a cada subida.
-- Risco de negócio: número pode ser banido pela Meta a qualquer momento (ver AGENTS.md).

CREATE TABLE IF NOT EXISTS whatsapp_auth_creds (
  channel_account_id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  creds JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
  channel_account_id TEXT NOT NULL,
  key_type TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_account_id, key_type, key_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_keys_channel ON whatsapp_auth_keys(channel_account_id);
