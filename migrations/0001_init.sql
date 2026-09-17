-- Migration 0001: modelo padrão de tenant + persistência do piloto em PostgreSQL
-- Substitui o armazenamento local em state/lab-state.json (JSON) e o
-- mapeamento CHANNEL_BUSINESS_MAP por variável de ambiente.
-- Referência: AI_RULES/04_ARCHITECTURE_STANDARDS.md (seções 3, 4, 9).

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mapeia um canal de mensageria (ex: WhatsApp Business Account) para um tenant.
-- Substitui CHANNEL_BUSINESS_MAP.
CREATE TABLE IF NOT EXISTS tenant_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_account_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_channels_tenant_id ON tenant_channels(tenant_id);

-- Mensagens recebidas (equivalente ao antigo inbox.ts em JSON).
CREATE TABLE IF NOT EXISTS inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_account_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedupe_key TEXT NOT NULL,
  UNIQUE (channel_account_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_tenant_id ON inbound_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbound_received_at ON inbound_messages(received_at);

-- Mensagens de saída/fila (equivalente ao antigo outbox.ts em JSON).
CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL UNIQUE,
  receipt_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_account_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  source TEXT NOT NULL,
  source_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_until TIMESTAMPTZ,
  claim_token TEXT,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbound_tenant_id ON outbound_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_created_at ON outbound_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_messages(status);

-- Fila de escalonamento para atendimento humano (Fase D2).
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_account_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_escalations_tenant_id ON escalations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_escalations_escalated_at ON escalations(escalated_at);
