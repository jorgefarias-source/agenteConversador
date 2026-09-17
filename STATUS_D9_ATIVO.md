# Fase D9: recursos genéricos por tenant (link/lista/texto)

- Implementado em: 2026-09-17.
- Responde ao pedido: "não vamos mandar em texto, vamos mandar o link do cardápio... e para
  o Cuida, se o usuário pedir agendamento, preciso passar as especialidades disponíveis, por
  tenant."

## O que foi implementado

- `migrations/0006_tenant_resources.sql`: tabela `tenant_resources` (tenant_id, key, label,
  kind ['link'|'list'|'text'], value_text, value_list, trigger_keywords[]).
- [src/infra/resources-repo.ts](src/infra/resources-repo.ts): CRUD + `findMatchingResource`
  (casa palavra-gatilho, ignorando acento/maiúsculas, como palavra inteira) +
  `formatResource` (formata link/lista/texto para a resposta do bot).
- `message-processor.ts`: um recurso configurado tem **prioridade** sobre o cardápio antigo
  (fixture da Fase D1). Isso significa que qualquer tenant pode registrar "cardápio" como um
  link e isso substitui a resposta de texto — sem precisar mudar código.
- Corrigido de passagem um problema latente: o cardápio antigo (`hasMenuIntent`) agora só
  responde se o tenant realmente tiver itens em `menu_items`; antes, um tenant sem cardápio
  cadastrado receberia uma resposta vazia ("Cardápio atual:\n").
- Endpoints: `GET/POST /v1/tenants/:channel_account_id/resources`,
  `PATCH/DELETE /v1/tenants/:channel_account_id/resources/:resource_id`.
- `docs/INTEGRACAO.md` atualizado com exemplos de uso (cardápio como link, especialidades do
  Cuida como lista).

## Evidência (testado ao vivo contra o Postgres real)

- Cadastrei um recurso `kind: "link"` com gatilhos `cardapio`/`cardápio`/`menu` para o tenant
  demo → mensagem "cardapio" respondida com `"Cardápio online: https://..."`,
  `source: "tenant-resource"` — confirmando que o link tem prioridade sobre o texto antigo.
- Criei um tenant simulando o Cuida com um recurso `kind: "list"` (especialidades) e gatilhos
  `especialidade`/`agendamento`/`agendar` → mensagem "quero fazer um agendamento" respondida com
  a lista formatada em bullets.
- Smoke E2E completo (10/10) confirmando que nada quebrou no restante do fluxo.

## Como outro sistema usa isso (resumo, ver docs/INTEGRACAO.md)

```json
POST /v1/tenants/:channel_account_id/resources
{
  "key": "cardapio-online",
  "label": "Cardápio online",
  "kind": "link",
  "value_text": "https://minhaloja.com/cardapio",
  "trigger_keywords": ["cardapio", "menu"]
}
```

```json
POST /v1/tenants/:channel_account_id/resources
{
  "key": "especialidades",
  "label": "Especialidades disponíveis",
  "kind": "list",
  "value_list": ["Clínico geral", "Pediatria", "Dermatologia"],
  "trigger_keywords": ["especialidade", "agendamento", "agendar"]
}
```
