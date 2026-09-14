# Fase C concluída (piloto com coorte)

- Concluída em: 2026-09-14.
- Conjunto de arquivos:
  - [src/lab/pilot.ts](src/lab/pilot.ts)
  - [src/lab/outbox.ts](src/lab/outbox.ts)
  - [src/lab/pilot-e2e.ts](src/lab/pilot-e2e.ts)
  - [src/lab/pilot-smoke.ts](src/lab/pilot-smoke.ts)
  - [src/lab/pilot-state-smoke.ts](src/lab/pilot-state-smoke.ts)
  - [src/lab/pilot-clean-e2e.ts](src/lab/pilot-clean-e2e.ts)

Observações de entrega:
- Coorte obrigatória em `/v1/messages`.
- Mensagem fora de coorte retorna `pilot: false`.
- Duplicação por `message_id`+`channel_account_id`.
- Outbound com claim token e validação no resultado.
- Observabilidade em `/v1/observacao/state` com distribuição de origem.
- Caminho de LLM pago opcional com fallback seguro.

# Fase D1 iniciada no piloto

- Avanço em 2026-09-14 com base local simulada de dados de cliente.
- Novos arquivos: [src/lab/customer-data.ts](src/lab/customer-data.ts)
- Integração inicial de consulta:
  - `cardapio` -> retorna cardápio atualizado (simulado) com fonte `d1-menu-v1`.
  - `status do pedido PED-xxxx` -> retorna pedido apenas se vinculado ao remetente/canal.

Critério de auditoria atual da D1:
- Deve validar titularidade do pedido por identidade do canal+remetente.
- Falha de autorização/consulta não deve responder dados de terceiros.
- Resultado segue no mesmo fluxo de outbox, com rastreabilidade por `source_version`.

Observação:
- Ainda sem integração real com fonte de produção; consultas estão em fixture local para validação de controle e arquitetura.
