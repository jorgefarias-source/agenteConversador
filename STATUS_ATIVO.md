# Status de progresso atual

- Etapa 0: OK (decisão inicial e limites)
  - [modelos/01_DECISOES_DO_PILOTO.md](modelos/01_DECISOES_DO_PILOTO.md)
- Etapa 1: INÍCIO (FAQ e regras em template)
  - [modelos/02_FAQ_PARA_PREENCHER.md](modelos/02_FAQ_PARA_PREENCHER.md)
  - [modelos/03_REGRAS_DE_CONVERSA.md](modelos/03_REGRAS_DE_CONVERSA.md)
- Etapa 2: LABORATÓRIO (estrutura pronta)
  - [package.json](package.json)
  - [src/lab/server.ts](src/lab/server.ts)
  - [prompts/01_LABORATORIO.md](prompts/01_LABORATORIO.md)
- Etapa 3: OK (30/30 no lote local)
  - [modelos/04_CENARIOS_AVALIACAO_ETAPA3.md](modelos/04_CENARIOS_AVALIACAO_ETAPA3.md)
  - [modelos/04_RESULTADOS_DA_AVALIACAO.md](modelos/04_RESULTADOS_DA_AVALIACAO.md)

- Etapa 4: PERSISTÊNCIA LOCAL INICIADA (estado em state/lab-state.json para inbound/outbox, sem banco ainda).

- Etapa 4: adicionada observabilidade de estado persistido para restart/diagnóstico local.

- Etapa 4: validação de persistência local concluída (smoke de estado + reset).

- Etapa C — Piloto ao vivo iniciado e concluído:
  - Endpoint de piloto com controle de coorte: [src/lab/pilot.ts](src/lab/pilot.ts)
  - Outbox com claim e prova de propriedade: [src/lab/outbox.ts](src/lab/outbox.ts)
  - Testes e scripts: [src/lab/pilot.ts](src/lab/pilot.ts), [src/lab/pilot-e2e.ts](src/lab/pilot-e2e.ts), [src/lab/pilot-smoke.ts](src/lab/pilot-smoke.ts), [src/lab/pilot-clean-e2e.ts](src/lab/pilot-clean-e2e.ts), [src/lab/pilot-state-smoke.ts](src/lab/pilot-state-smoke.ts)
  - Caminho LLM pago opcional: [src/features/llm.ts](src/features/llm.ts)
  - Observabilidade de configuração/execução em `/v1/observacao` e `/v1/observacao/state`

- Próxima fase sugerida: Etapa D1 (consulta de cardápio e pedido do próprio cliente), com ambiente de dados isolado e controle de autorização.
