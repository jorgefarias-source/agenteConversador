# Etapa B — Observação integrada (escopo inicial)

Objetivo: receber mensagens reais selecionadas sem envio ao cliente e sem ações reais.

## Contrato mínimo interno (`POST /v1/messages`)

- Método: `POST`
- Path: `/v1/messages`
- Autenticação: `Authorization: Bearer <AGENT_CONNECTOR_TOKEN>`
- Resposta: retorno de recibo (`receipt_id`, `status`, `duplicate`, `trace_id`)

Comportamentos exigidos:
- `status = accepted` ao persistir a entrada
- `status = duplicate` em reenvio com mesmo `message_id` + mesmo canal
- Sem chamada à IA, sem envio ao WhatsApp nesse modo
- Apenas log local de entrada para análise e sugestão

## Execução local da observação

```powershell
npm.cmd run observe
```

### Evidência esperada

- Um primeiro POST retorna `202` e `status: accepted`.
- Reenvio do mesmo `message_id` retorna o mesmo `receipt_id` e `duplicate: true`.
- Consultar `/v1/observacao/work` mostra o registro persistido.
