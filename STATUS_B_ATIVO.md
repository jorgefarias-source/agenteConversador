# Início de etapa: B observação

Atualização do projeto:
- Adicionado endpoint `/v1/messages` em modo observação.
- Autenticação por token de conector no cabeçalho `Authorization`.
- Deduplicação em memória por `channel_account_id` + `message_id`.
- Retorno de recebimento sem envio real.
- Documentação em `docs/guias/ETAPA_B_OBSERVACAO.md`.

Observação final:
- Este é ponto inicial, ainda sem integração real com conector e sem escrita no banco.

- 2026-09-14T15:00:25Z: Etapa C smoke (`npm run pilot:smoke`) passou em 127.0.0.1:3002 com AGENT_CONNECTOR_TOKEN=token_teste_local e PILOT_SENDERS=remetente-demo-A.

- 2026-09-14T15:05:00Z: Etapa 3 (lab:scenarios) executada com sucesso: 30/30 cenários corretos, 0 falhas. Relatórios atualizados em eval-local-report.* e modelos/04_RESULTADOS_DA_AVALIACAO.md.
