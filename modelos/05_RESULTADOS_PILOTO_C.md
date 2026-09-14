# Resultados da Etapa C (piloto)

Preencha após o smoke com o token do ambiente de teste.

## Data: 

## Evidência automatizada

- Comando: `npm.cmd run pilot:smoke`
- Resultado geral: __aprovado__ / __falhou__
- Arquivo de saída:
  - `pilot-smoke-report.json` (se gerado)

## Evidência manual

- POST `v1/messages` remetente em coorte: 
- POST `v1/messages` remetente fora da coorte: 
- POST duplicado com o mesmo `message_id`: 
- `/v1/outbound/claim` + `/v1/outbound/{id}/result`:

## Pendências

- [ ] Aguardando validação do Jorge para coorte real
- [ ] Definir política de encaminhamento de fallback humano na conversa ativa
- [ ] Habilitar logs de retenção segura em produção
