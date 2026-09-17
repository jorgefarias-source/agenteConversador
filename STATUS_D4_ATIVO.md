# Fase D4: cardápio/clientes/pedidos migrados para PostgreSQL

- Implementado em: 2026-09-17.
- Continuação direta da Fase D3 (migração de inbox/outbox/handoff para Postgres).

## O que mudou

- [src/lab/customer-data.ts](src/lab/customer-data.ts) deixou de ser uma fixture em memória e
  passou a consultar as tabelas `menu_items`, `customers` e `orders`
  ([migrations/0002_customer_data.sql](migrations/0002_customer_data.sql)), todas com `tenant_id`.
- Preço de item de cardápio e total de pedido armazenados em `NUMERIC(12,2)` (nunca `float`),
  conforme `AI_RULES/04_ARCHITECTURE_STANDARDS.md` seção 25; formatação para `R$ x,xx` fica na
  camada de apresentação (`formatBRL` em `customer-data.ts`).
- Funções agora recebem `tenantId` (UUID) em vez do slug `businessId`, já que o `pilot.ts` resolve
  o tenant real via `resolveTenantByChannel` antes de consultar cardápio/pedido.
- Dados de demonstração (mesmo cardápio/clientes/pedidos que já existiam na fixture) agora são
  populados por [src/infra/seed-customer-data.ts](src/infra/seed-customer-data.ts), chamado por
  `npm run seed:demo`.

## O que NÃO mudou (limitação conhecida, já documentada)

Isso ainda são **dados de demonstração no banco do piloto**, não uma integração com a fonte real
de produção do negócio (ERP, sistema de pedidos). Migrar para uma fonte real continua sendo uma
integração externa nova e exige decisão humana antes de implementar (`AGENTS.md`).

## Evidência

- `npm run test:db`: 7/7 passando, incluindo o novo teste de cardápio/pedidos com titularidade
  cruzada (remetente B não acessa pedido do remetente A) contra o Postgres real.
- Smoke E2E (`pilot-smoke.ts`) contra o servidor real: 10/10 passando, cardápio e pedido servidos
  do banco, não mais de memória.
