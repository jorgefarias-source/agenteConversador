# Fase D3: migração para PostgreSQL + modelo padrão de tenant

- Implementado em: 2026-09-17.
- Referência corporativa: `AI_RULES/04_ARCHITECTURE_STANDARDS.md` (seções 3, 4, 9, 16).

## O que mudou

- Persistência saiu do arquivo JSON local (`state/lab-state.json`) para **PostgreSQL**.
- Novo modelo de dados versionado em [migrations/0001_init.sql](migrations/0001_init.sql):
  `tenants`, `tenant_channels`, `inbound_messages`, `outbound_messages`, `escalations` — todas as
  tabelas de domínio com `tenant_id NOT NULL` e índice, conforme o padrão corporativo.
- `CHANNEL_BUSINESS_MAP` (variável de ambiente) foi **removido**. O mapeamento canal → negócio
  agora vive em `tenant_channels`/`tenants` (`src/infra/tenants.ts`,
  `resolveTenantByChannel`/`upsertTenantWithChannel`).
- [src/infra/db.ts](src/infra/db.ts): pool de conexão (`pg`) e `runMigrations()`, que aplica
  migrações pendentes automaticamente na subida do servidor e registra o que já rodou em
  `schema_migrations`.
- `inbox.ts`, `outbox.ts` e `handoff.ts` reescritos para Postgres — todas as funções agora são
  assíncronas.
- Retenção de 90 dias (decisão da Fase D2) migrada de expurgo em memória/JSON para `DELETE ...
  WHERE ... < now() - interval` no banco (`purgeExpiredInbound`/`purgeExpiredOutbound`/
  `purgeExpiredEscalations`).
- Novo script `npm run seed:demo` — aplica migrações e cadastra o tenant de demonstração
  (`ponto-do-recheio` / `canal-demo`), substituindo o antigo `CHANNEL_BUSINESS_MAP` em
  `.env.local`/scripts de e2e.

## Infraestrutura provisionada (Railway)

Com autorização explícita do usuário, foi criado:

- Projeto Railway **agenteConversador** (novo, esse projeto ainda não tinha infraestrutura).
- Serviço **Postgres** (imagem `postgres:16`), com volume persistente e variáveis de conexão
  (`DATABASE_URL` interna via rede privada, `DATABASE_PUBLIC_URL` via proxy TCP).
- Um **proxy TCP público temporário** foi criado só para validar a migração a partir do ambiente
  local de desenvolvimento. **Isso deve ser removido antes de qualquer uso em produção** — a
  aplicação real deve se conectar pela rede privada do Railway (`RAILWAY_PRIVATE_DOMAIN`), nunca
  pelo proxy público, conforme `04_ARCHITECTURE_STANDARDS.md` seção 16. Ver pendência abaixo.

## Evidência

- `npm test` (unitário, sem banco): 9/9 passando.
- `npm run test:db` (integração real contra o Postgres do Railway): 6/6 passando — cobre
  resolução de tenant, inbound (aceite + deduplicação), outbox (enqueue/claim/dispatch,
  claim_token inválido), handoff (escalar/listar/resolver) e expurgo de retenção.
- Smoke end-to-end (`pilot-smoke.ts`) rodado contra o servidor real conectado ao Postgres:
  10/10 checks passando (mesmos cenários da Fase D1: cardápio, pedido autorizado, bloqueio de
  pedido de terceiro).
- Fluxo de handoff (Fase D2) validado manualmente contra o Postgres: escalar → aparecer em
  `/v1/handoff/pending` → suprimir resposta automática → `resolve` → voltar a responder.

## Pendências

- [x] Remover o proxy TCP público do serviço Postgres no Railway — feito manualmente pelo usuário
      em 2026-09-17. A partir de agora, testes/local dev que dependem do banco (`npm run test:db`,
      `npm run pilot` com DB) exigem recriar um proxy temporário ou rodar dentro da rede privada
      do Railway.
- [ ] `src/lab/customer-data.ts` (cardápio/pedidos) continua em fixture local, fora do Postgres —
      migrá-lo para tabelas reais é trabalho futuro e depende de decisão sobre a fonte de dados
      de produção (ver `AGENTS.md`).
- [ ] Ao existir mais de um negócio real, revisar índices/constraints de unicidade
      (`tenant_channels.channel_account_id`, `outbound_messages.delivery_id`) sob carga.
