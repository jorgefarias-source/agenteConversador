-- Migration 0006: recursos genéricos configuráveis por tenant (link, lista ou texto),
-- acionados por palavras-gatilho. Isso é o que permite, por exemplo, o PetShop cadastrar
-- um link de cardápio online, ou o Cuida cadastrar a lista de especialidades disponíveis,
-- sem precisar de código novo no Conversador para cada tipo de negócio.

CREATE TABLE IF NOT EXISTS tenant_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'list', 'text')),
  value_text TEXT,
  value_list TEXT[],
  trigger_keywords TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_resources_tenant_id ON tenant_resources(tenant_id);
