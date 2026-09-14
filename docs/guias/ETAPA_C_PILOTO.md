# Etapa C — Piloto ao vivo com capacidade de resposta de FAQ limitada

Objetivo: permitir resposta automática de FAQ apenas para uma coorte aprovada.

Modo inicial:
- `APP_MODE=pilot`
- `PILOT_SENDERS` define remetentes autorizados no piloto.

Comportamento:
- `POST /v1/messages` com autorização válida.
- Mensagem de remetente fora da coorte: apenas registrada, sem retorno automático.
- Remetente incluído: registra resposta sugerida em outbox.
- Retorno 202 com `delivery_id` para acompanhamento.

Endpoints de observabilidade (sem integração ativa do WhatsApp neste passo):
- `GET /v1/observacao/work` (mostra outbox)
- `POST /v1/outbound/claim` (conector retira resposta pendente)
- `POST /v1/outbound/:delivery_id/result` (marca resultado)
- `POST /v1/handoff` (interrompe respostas pendentes de um remetente)

Execução:

```powershell
npm.cmd run pilot
```

Checklist mínimo antes de ativar a capacidade real:
- Deduplicação mantida.
- Não enviar resposta para quem não entrou na coorte.
- Encaminhamento de erro não inventa resposta final.
- Falha de conector não reenviada cegamente.
