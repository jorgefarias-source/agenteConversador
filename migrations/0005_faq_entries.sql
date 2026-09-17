-- Migration 0005: FAQ deixa de ser hardcoded (faqByBusiness em src/features/faq.ts) e
-- passa a ser configurável por tenant no banco. Isso é o que permite configurar
-- as respostas de cada cliente sem programar.

CREATE TABLE IF NOT EXISTS faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'geral',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  approved_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('rascunho', 'aprovado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_tenant_id ON faq_entries(tenant_id);
