# Etapa C — auditoria local (smoke)

A seguir o passo de validação automatizada da capacidade de piloto para revisão posterior.

Pré-requisito: servidor em modo piloto ativo (`npm.cmd run pilot`) com `AGENT_CONNECTOR_TOKEN` configurado.

Comando de validação:

```powershell
$env:AGENT_CONNECTOR_TOKEN='token-teste-local'
$env:PILOT_BASE_URL='http://127.0.0.1:3002'
npm.cmd run pilot:smoke
```

Expectativas do smoke:
- Remetente em `PILOT_SENDERS`: geração de `delivery_id`.
- Remetente fora de coorte: retorno com `pilot: false`.
- Reenvio: `duplicate=true` e mesmo `receipt_id`.
- `claim` devolve item pendente e `claim` novamente retorna vazio/sem item novo.
- Resultado do envio (`result`) marca estado para `dispatched` quando ok.

Observação:
- Mantém envio real bloqueado; smoke valida somente orquestração.
