# Fase D2: política de fallback humano implementada

- Implementado em: 2026-09-17.
- Conjunto de arquivos:
  - [src/lab/handoff.ts](src/lab/handoff.ts)
  - Alterações em [src/lab/pilot.ts](src/lab/pilot.ts) e [src/lab/storage.ts](src/lab/storage.ts)
  - Testes: [src/lab/handoff.test.ts](src/lab/handoff.test.ts)

## Problema resolvido

Pendência registrada na Fase C (`modelos/05_RESULTADOS_PILOTO_C.md`): "Definir política de encaminhamento de fallback humano na conversa ativa". Antes, quando o bot não sabia responder (`source: fallback-human`), ele apenas dizia que poderia encaminhar para atendimento humano, mas continuava respondendo automaticamente a cada nova mensagem do mesmo remetente — não havia encaminhamento real.

## Comportamento implementado

- Toda vez que o bot responde com `fallback-human`, o remetente (`channel_account_id` + `sender_id`) é automaticamente movido para uma fila de escalonamento (`escalateSender`).
- Enquanto um remetente está escalado, novas mensagens dele **não** disparam FAQ/cardápio/pedido/LLM automaticamente — a API retorna `escalated: true` e uma nota informando que a conversa já está com atendimento humano, sem gerar nova resposta automática.
- Consultas de cardápio/pedido continuam funcionando normalmente mesmo com o remetente escalado (não é um bloqueio geral, só evita repetir "não sei responder").
- Um atendente humano libera a conversa via `POST /v1/handoff/resolve` (`sender_id` + `channel_account_id`), retomando as respostas automáticas.
- `POST /v1/handoff` (handoff manual, iniciado pelo atendente) agora também escala o remetente, além de cancelar respostas pendentes já enfileiradas.
- Fila consultável via `GET /v1/handoff/pending`.
- Escalações seguem a mesma política de retenção de 90 dias (`AGENT_RETENTION_DAYS`) definida para inbound/outbound, e são limpas por `POST /v1/observacao/state/reset`.

## Limitação conhecida

Isso resolve o comportamento *dentro* do agente (parar de responder automaticamente e expor uma fila). Não implementa notificação real a um atendente humano (e-mail, painel externo, Slack etc.) — isso seria uma integração externa nova e, pelas regras corporativas (`AI_RULES/05_AI_AGENT_RULES.md`), exige decisão humana explícita antes de implementar.

## Evidência

- Testes automatizados: 19/19 passando (`npm test`), incluindo 7 casos de `handoff.test.ts`.
- Validação manual end-to-end via servidor real: escalar → aparecer em `/v1/handoff/pending` → suprimir resposta seguinte → `resolve` → voltar a responder normalmente. Todos os passos confirmados.
