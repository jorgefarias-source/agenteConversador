# Fase D5: conector real de WhatsApp (não oficial, via Baileys)

- Implementado em: 2026-09-17.
- Decisão de risco confirmada explicitamente pelo usuário nesta data: usar uma biblioteca
  **não oficial** (Baileys) em vez da WhatsApp Cloud API oficial da Meta.

## Risco de negócio (aceito conscientemente)

Bibliotecas não oficiais de WhatsApp (Baileys, whatsapp-web.js, etc.) automatizam o protocolo
multi-dispositivo do WhatsApp sem passar pela API oficial da Meta. Isso **viola os Termos de
Serviço da Meta** e o número conectado pode ser **banido a qualquer momento, sem aviso prévio**,
o que derrubaria o atendimento sem alerta. Não é uma violação de LGPD, mas é um risco de
continuidade de negócio que deve ser levado em conta antes de usar isso com um número real de
produção. Migrar para a WhatsApp Cloud API oficial é o caminho recomendado antes de qualquer
lançamento comercial sério.

## O que foi implementado

- [src/lab/whatsapp-connector.ts](src/lab/whatsapp-connector.ts): conecta via
  `@whiskeysockets/baileys`, gera QR code de pareamento, mantém reconexão automática (exceto
  quando deslogado explicitamente) e liga o pipeline de mensagens do bot.
- [src/infra/whatsapp-auth-store.ts](src/infra/whatsapp-auth-store.ts): sessão de autenticação
  (credenciais + chaves de sessão do protocolo Signal) persistida no **Postgres**
  (`migrations/0003_whatsapp_auth.sql`), não em arquivo local — sobrevive a redeploys/reinícios
  sem precisar escanear o QR de novo.
- [src/lab/message-processor.ts](src/lab/message-processor.ts): lógica de processamento de
  mensagem (FAQ/cardápio/pedido/escalonamento) extraída de `pilot.ts` para ser reutilizada tanto
  pelo endpoint HTTP `/v1/messages` quanto pelo conector de WhatsApp — sem duplicar regra de
  negócio.
- Endpoints novos em `pilot.ts`: `GET /v1/whatsapp/status` e `GET /v1/whatsapp/qr` (renderiza o
  QR code como imagem para pareamento).
- Ativado via variável de ambiente `WHATSAPP_CHANNEL_ACCOUNT_ID` (opcional) — sem ela, o servidor
  sobe normalmente sem tentar conectar WhatsApp nenhum, mantendo o modo piloto simulado como
  padrão seguro.
- Envio real de mensagem continua atrás de `ALLOW_WHATSAPP_SEND` (`false` por padrão) — com o
  conector conectado mas essa flag desligada, o bot recebe e processa mensagens reais, mas não
  envia nenhuma resposta de verdade.

## Bug corrigido durante a validação

A primeira tentativa de conexão falhou parcialmente: uma chave de sessão do tipo "LID" (ver
abaixo) ficou corrompida no banco porque o valor era serializado duas vezes (uma vez pelo nosso
código, outra automaticamente pelo driver `pg` ao gravar em coluna `jsonb`). Corrigido fazendo a
serialização com o `replacer` do Baileys manualmente e um cast `::jsonb` explícito, evitando a
dupla serialização.

## Achado importante: identificação por "LID"

A Meta está migrando o WhatsApp para identificar contatos por um "LID" (linked ID) opaco em vez
do número de telefone direto, por privacidade. Na prática, mensagens recebidas de um número real
podem chegar com `sender_id` no formato `<numero>@lid` em vez de `<numero>@s.whatsapp.net`. Isso
foi confirmado ao vivo: uma mensagem real do número de teste chegou com `sender_id:
"267335961174250@lid"`, não com o JID do número de telefone.

**Impacto prático**: a lista `PILOT_SENDERS` (que autoriza quem recebe resposta automática) hoje
precisa conter o identificador exato que o WhatsApp está usando para aquele contato, que pode ser
o LID em vez do número. Isso é uma limitação a resolver antes de operar com múltiplos clientes
reais — hoje é preciso descobrir o LID manualmente (registrado em `inbound_messages.sender_id`)
em vez de simplesmente cadastrar o número de telefone.

## Evidência (validação manual ao vivo)

- QR code gerado e escaneado com sucesso por um WhatsApp real.
- Sessão persistida no Postgres (`whatsapp_auth_creds`, `whatsapp_auth_keys`) e reconexão
  automática confirmada **sem novo QR** após reiniciar o processo duas vezes.
- Mensagem real recebida do número de teste (+55 22 98134-3859) e registrada corretamente em
  `inbound_messages`.
- Não foi possível concluir o teste do fluxo de resposta completo (FAQ/cardápio) nesta sessão —
  fica pendente para a próxima vez que o servidor for religado com o LID correto autorizado em
  `PILOT_SENDERS`.

## Evolução: conector multi-tenant dinâmico (mesmo dia, 2026-09-17)

Esclarecimento de arquitetura importante do usuário: o Conversador é o motor central de
atendimento via WhatsApp para **vários produtos da Jordão** (PetShop, Mordomê, Cuida, etc.).
Cada cliente final de cada produto conecta o **próprio WhatsApp** (escaneando o QR **de dentro do
sistema que contratou**), e quando o bot não sabe responder, escala para o atendimento humano
**daquele negócio específico** — nunca centralizado na Jordão.

Isso exigia que o conector deixasse de ser "um WhatsApp por processo, configurado no boot" e
passasse a ser **multi-conexão dinâmico**, com uma API para outros sistemas iniciarem/consultarem/
encerrarem a conexão de um tenant específico a qualquer momento:

- `POST /v1/whatsapp/connections` — cria/atualiza o tenant+canal e inicia a conexão (retorna
  status; o QR fica disponível logo em seguida).
- `GET /v1/whatsapp/connections` — lista todas as conexões ativas neste processo.
- `GET /v1/whatsapp/connections/:channel_account_id/status` e `.../qr`.
- `DELETE /v1/whatsapp/connections/:channel_account_id?logout=true|false` — encerra a conexão
  (com `logout=true`, invalida a sessão salva; sem isso, só desconecta localmente e permite
  retomar depois).
- `resumeAllWhatsappConnections()` — na subida do servidor, reconecta automaticamente **todos**
  os canais que já têm sessão salva no Postgres, sem precisar de nenhuma variável de ambiente.

**Validado ao vivo**: com o processo já rodando com o WhatsApp real conectado (`canal-demo`),
uma segunda conexão foi criada via API para um tenant diferente (`petshop-exemplo`,
`canal-teste-2`), gerou QR code próprio, e ambas coexistiram simultaneamente sem interferência —
confirmando isolamento entre conexões concorrentes.

## Resolvido: identificação por LID (2026-09-17)

`src/lab/whatsapp-connector.ts` agora resolve o LID para o número de telefone real
automaticamente antes de processar a mensagem, usando (em ordem de preferência):
1. `msg.key.remoteJidAlt` (quando o próprio Baileys já entrega o par PN/LID na mensagem).
2. `sock.signalRepository.lidMapping.getPNForLID(lid)` (consulta o mapeamento LID↔PN que o
   Baileys mantém na mesma store de chaves já persistida no Postgres).

Se nenhum dos dois resolver (mapeamento ainda não sincronizado), o LID é usado como identificador
mesmo, sem quebrar o fluxo.

**Validado ao vivo**: mensagem real recebida com `sender_id: "5522981343859@s.whatsapp.net"`
(número de telefone), não mais `"...@lid"`. Fluxo completo testado: mensagem "Cardápio" recebida
→ remetente autorizado dinamicamente via `POST /v1/tenants/canal-demo/pilot-senders` (sem
reiniciar o servidor) → bot reconheceu a intenção → resposta gerada a partir do cardápio real no
Postgres.

## Decisão final sobre API oficial vs. não oficial

Em 2026-09-17, após validar a biblioteca não oficial (Baileys) funcionando de ponta a ponta —
conexão real, recepção, resposta e envio real confirmados — o usuário decidiu **manter a
biblioteca não oficial**, mesmo ciente do risco de banimento do número pela Meta (documentado
acima). Não há mais pendência de decisão sobre isso; se o risco se materializar (número banido),
a alternativa é migrar para a WhatsApp Cloud API oficial, mas isso não é mais bloqueio para seguir
usando o Conversador como está.
