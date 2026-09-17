# Integração de outros sistemas com o Conversador

Este documento é para quem vai conectar **outro sistema da Jordão** (PetShop, Mordomê, Cuida,
etc.) à API do Conversador — o motor central de atendimento via WhatsApp.

## Autenticação

Toda chamada autenticada leva o header:

```
Authorization: Bearer <AGENT_CONNECTOR_TOKEN>
```

Em produção, esse token vive só na variável de ambiente do serviço no Railway — nunca commitado,
nunca hardcoded no sistema que consome a API. Peça o token de produção separadamente.

## 1) Cadastrar um cliente novo e conectar o WhatsApp dele

Cada cliente final (ex: um petshop específico) vira um **tenant** no Conversador, identificado
por um `channel_account_id` (um identificador único que você escolhe — pode ser o ID do cliente
no seu próprio sistema).

```http
POST /v1/whatsapp/connections
Content-Type: application/json

{
  "channel_account_id": "petshop-123",
  "tenant_slug": "petshop-do-joao",
  "tenant_name": "PetShop do João"
}
```

Isso cria o tenant (se não existir) e começa a tentar conectar o WhatsApp. A resposta traz o
status inicial. Em seguida:

```http
GET /v1/whatsapp/connections/petshop-123/status
```

Retorna `{"status": "qr_pending" | "connecting" | "connected" | "disconnected", "hasQr": bool}`.

Enquanto `hasQr` for `true`, busque o QR code:

```http
GET /v1/whatsapp/connections/petshop-123/qr
```

Isso devolve uma página HTML com a imagem do QR — embuta num `<iframe>` na tela do seu sistema,
ou extraia a imagem (é um `data:image/png;base64,...`) e renderize do seu jeito. O cliente
escaneia com o WhatsApp dele (Configurações → Aparelhos conectados). A sessão fica salva no
Postgres do Conversador — uma vez conectado, sobrevive a reinícios/redeploys sem precisar
escanear de novo.

Para desconectar (ex: cliente cancelou o serviço):

```http
DELETE /v1/whatsapp/connections/petshop-123?logout=true
```

## 2) Configurar as respostas do bot (FAQ) para esse cliente

Isso é o que substitui ficar configurando modelo de mensagem manualmente em cada sistema.
O FAQ é por tenant, editável via API, sem precisar programar nada:

```http
GET    /v1/tenants/petshop-123/faq
POST   /v1/tenants/petshop-123/faq
PATCH  /v1/tenants/petshop-123/faq/:faq_id
DELETE /v1/tenants/petshop-123/faq/:faq_id
```

Criar uma entrada:

```json
POST /v1/tenants/petshop-123/faq
{
  "theme": "horario",
  "question": "Qual o horário de funcionamento?",
  "answer": "Funcionamos de segunda a sábado, das 9h às 19h.",
  "approved_by": "João"
}
```

O bot casa a pergunta do cliente com as `question` cadastradas (tolera variações de escrita,
acentos, singular/plural) e responde com a `answer` correspondente. Só entradas com
`"status": "aprovado"` (padrão) entram na comparação — use `"status": "rascunho"` para preparar
uma resposta sem ativá-la ainda.

**Importante**: envie o corpo da requisição como JSON UTF-8 de verdade (qualquer biblioteca HTTP
padrão já faz isso certo). Só ferramentas de linha de comando digitando acento manualmente em
alguns terminais Windows podem corromper caracteres — não é um problema da API.

## 3) Recursos configuráveis (link, lista ou texto) — cardápio online, especialidades, etc.

Isso é o mecanismo genérico para qualquer coisa específica do tipo de negócio: um link (ex:
cardápio online de um restaurante/petshop), uma lista (ex: especialidades de uma clínica no
Cuida) ou um texto fixo. Configurável por tenant, acionado por palavras-gatilho:

```http
GET    /v1/tenants/petshop-123/resources
POST   /v1/tenants/petshop-123/resources
PATCH  /v1/tenants/petshop-123/resources/:resource_id
DELETE /v1/tenants/petshop-123/resources/:resource_id
```

Exemplo — cardápio como link (em vez do bot mandar o menu em texto):

```json
POST /v1/tenants/petshop-123/resources
{
  "key": "cardapio-online",
  "label": "Cardápio online",
  "kind": "link",
  "value_text": "https://minhaloja.com/cardapio",
  "trigger_keywords": ["cardapio", "menu"]
}
```

Exemplo — especialidades disponíveis (caso do Cuida, quando o paciente pede agendamento):

```json
POST /v1/tenants/clinica-456/resources
{
  "key": "especialidades",
  "label": "Especialidades disponíveis",
  "kind": "list",
  "value_list": ["Clínico geral", "Pediatria", "Dermatologia", "Cardiologia"],
  "trigger_keywords": ["especialidade", "especialidades", "agendamento", "agendar"]
}
```

Quando a mensagem do cliente contém qualquer uma das `trigger_keywords` (como palavra inteira,
ignorando acento/maiúsculas), o bot responde formatando automaticamente conforme o `kind`:
- `link`: `"{label}: {value_text}"`
- `list`: `"{label}:\n- item1\n- item2..."`
- `text`: `{value_text}` puro

Um recurso configurado tem prioridade sobre o cardápio/pedido de demonstração da Fase D (ver
seção 4) — é o caminho recomendado para qualquer negócio real.

## 4) Consultas específicas de cardápio/pedido (Fase D, ainda fixture — considere usar recursos)

Hoje `cardápio` e `status do pedido PED-xxxx` são reconhecidos automaticamente pelo bot, mas os
dados (menu, clientes, pedidos) ainda são de demonstração, específicos do tenant
`ponto-do-recheio` — não há API própria para outros tenants cadastrarem cardápio/pedidos reais
ainda. Se seu sistema precisar disso, é um próximo passo a construir (schema já existe:
`menu_items`, `customers`, `orders`, todos com `tenant_id`).

## 5) Fila de atendimento humano (escalonamento)

Quando o bot não sabe responder, a conversa é automaticamente movida para uma fila — o cliente
final (ex: o petshop) deve ver essa fila **dentro do próprio sistema dele**, consultando:

```http
GET /v1/handoff/pending
```

Retorna todas as conversas escaladas de todos os tenants — filtre pelo `channel_account_id` do
seu cliente no seu sistema antes de exibir (ainda não há filtro por tenant nesse endpoint, ver
seção de limitações abaixo).

Para liberar/resolver uma conversa (atendente respondeu manualmente):

```http
POST /v1/handoff/resolve
{ "channel_account_id": "petshop-123", "sender_id": "5511999999999@s.whatsapp.net" }
```

## 6) Modo piloto (opcional)

Por padrão, um tenant novo responde **qualquer remetente automaticamente** — é o comportamento
certo para operação real. Se quiser testar com poucos clientes reais antes de abrir geral:

```http
POST /v1/tenants/petshop-123/pilot-mode
{ "enabled": true }

POST /v1/tenants/petshop-123/pilot-senders
{ "sender_id": "5511999999999@s.whatsapp.net" }
```

## Limitações conhecidas (a resolver conforme necessidade)

- `GET /v1/handoff/pending` não filtra por tenant — devolve a fila de todo mundo. Filtre no seu
  sistema por enquanto, ou peça para adicionarmos um parâmetro de filtro.
- Cardápio/pedidos não têm API própria de cadastro por tenant ainda (só FAQ tem).
- Não há painel de configuração dentro do próprio Conversador para o cliente final — a intenção é
  que cada sistema (PetShop, Mordomê...) construa sua própria tela de configuração usando esta
  API, e não que o cliente final acesse o Conversador diretamente.
