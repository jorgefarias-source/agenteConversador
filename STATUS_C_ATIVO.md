# Fase C ativa: piloto com coorte e saída observável

Concluída com sucesso: 2026-09-14.

Arquivo de referência:
- [docs/guias/ETAPA_C_PILOTO.md](docs/guias/ETAPA_C_PILOTO.md)
- [docs/guias/ETAPA_C_SMOKE.md](docs/guias/ETAPA_C_SMOKE.md)

Entregas implementadas:
- `POST /v1/messages` com autorização e trilha de coorte.
- Mensagem fora da coorte: `pilot: false` sem `delivery_id`.
- Mensagem autorizada: `delivery_id`, registro em outbox e deduplicação por `message_id`.
- Outbound protegido por claim token em `claim` e `result`.
- Observabilidade de estado persistido em `/v1/observacao/state`.
- Smoke e E2E de piloto cobrindo:
  - geração de outbound para coorte;
  - recusa para remetente não autorizado;
  - deduplicação;
  - claim e atualização de estado para `dispatched`;
  - validação de distribuição de fonte (`faq-matched`, `fallback-human`, `llm-paid`).
- Caminho opcional de LLM pago com fallback seguro em `src/features/llm.ts`.

Comandos usados na fase:
- `npm.cmd run pilot`
- `npm.cmd run pilot:smoke`
- `npm.cmd run pilot:state:smoke`
- `npm.cmd run pilot:e2e`
- `npm.cmd run pilot:clean-e2e`

Pendência para a próxima fase:
- implementar etapa D1 com dados de cliente autorizados, consulta de cardápio/pedido e validações de propriedade.
