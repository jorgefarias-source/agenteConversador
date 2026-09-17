# Fase D6: restrição de coorte por tenant (fim do PILOT_SENDERS global)

- Implementado em: 2026-09-17.
- Resolve a pendência registrada em `STATUS_D5_ATIVO.md`: "PILOT_SENDERS hoje é uma única lista
  global por variável de ambiente — não é por tenant."

## O que mudou

- `migrations/0004_tenant_pilot_senders.sql`: coluna `tenants.pilot_mode` (boolean, padrão
  `false`) e tabela `tenant_pilot_senders` (remetentes autorizados quando o piloto está ativo).
- **Padrão para tenant novo/real**: `pilot_mode = false` → atende **qualquer remetente** do
  WhatsApp conectado, sem lista de espera. É o comportamento correto para operação real com
  clientes de verdade.
- **Tenant em fase de piloto controlado**: liga `pilot_mode = true` e só remetentes cadastrados
  em `tenant_pilot_senders` recebem resposta automática (outros ficam registrados, sem resposta) —
  substitui exatamente o que a variável de ambiente `PILOT_SENDERS` fazia, mas agora por negócio.
- Endpoints novos: `POST /v1/tenants/:channel_account_id/pilot-mode`,
  `GET/POST /v1/tenants/:channel_account_id/pilot-senders`,
  `DELETE /v1/tenants/:channel_account_id/pilot-senders/:sender_id`.
- `PILOT_SENDERS` (variável de ambiente) e `cfg.allowPilotSenders` foram **removidos** do código
  — única fonte de verdade agora é o banco, por tenant.
- Tenant de demonstração (`ponto-do-recheio`/`canal-demo`) continua em modo piloto (por
  `npm run seed:demo`), preservando o comportamento dos smoke tests existentes.

## Evidência

- `npm test` (2/2) e `npm run test:db` (7/7) passando.
- Smoke E2E (`pilot-smoke.ts`) rodado **sem nenhuma variável `PILOT_SENDERS` no ambiente**:
  10/10 checks passando, coorte vindo 100% do banco.
- Testado manualmente: tenant novo criado sem configurar piloto (`pilot_mode` padrão `false`)
  respondeu a um remetente nunca visto antes (`pilot: true`) — comportamento de produção real
  confirmado.
