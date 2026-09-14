# Início de etapa: B observação

Atualização do projeto:
- Adicionado endpoint `/v1/messages` em modo observação.
- Autenticação por token de conector no cabeçalho `Authorization`.
- Deduplicação em memória por `channel_account_id` + `message_id`.
- Retorno de recebimento sem envio real.
- Documentação em `docs/guias/ETAPA_B_OBSERVACAO.md`.

Observação final:
- Este é ponto inicial, ainda sem integração real com conector e sem escrita no banco.
