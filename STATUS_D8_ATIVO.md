# Fase D8: FAQ configurável por tenant + documentação de integração

- Implementado em: 2026-09-17.
- Resolve a pergunta "como configuro as respostas para cada cliente?" — antes disso, as
  respostas de FAQ estavam fixas no código (`faqByBusiness` em `src/features/faq.ts`, um `if`
  hardcoded por slug de tenant).

## O que mudou

- `migrations/0005_faq_entries.sql`: tabela `faq_entries` (tenant_id, theme, question, answer,
  approved_by, status).
- [src/infra/faq-repo.ts](src/infra/faq-repo.ts): `faqForTenant` (usado pelo motor de resposta) e
  CRUD administrativo (`listFaqEntries`/`createFaqEntry`/`updateFaqEntry`/`deleteFaqEntry`).
- Endpoints novos: `GET/POST /v1/tenants/:channel_account_id/faq`,
  `PATCH/DELETE /v1/tenants/:channel_account_id/faq/:faq_id`.
- `src/features/faq.ts` manteve só a lógica pura de comparação de perguntas
  (`answerFromFaq`) mais uma fixture (`faqDemoFixture`) usada exclusivamente pelas ferramentas
  offline sem banco (`npm run lab`, `eval-local.ts`) — o fluxo real de atendimento não usa mais
  essa fixture.
- `seed-demo-tenant.ts` agora popula o FAQ de demonstração no banco (em vez de vir do código).
- [docs/INTEGRACAO.md](docs/INTEGRACAO.md): documentação completa de como outro sistema da
  Jordão (PetShop, Mordomê, Cuida...) integra com o Conversador — cadastro de tenant, QR code de
  WhatsApp, configuração de FAQ, fila de escalonamento, modo piloto.

## Evidência

- `npm test` (2/2) e `npm run test:db` (7/7) passando.
- Testado ao vivo: criei uma entrada de FAQ nova via API (`POST /v1/tenants/canal-demo/faq`),
  mandei a pergunta correspondente pelo fluxo de mensagens, e o bot respondeu usando o conteúdo
  cadastrado no banco — sem nenhuma alteração de código.
- Smoke E2E completo (10/10) confirmando que nada quebrou no restante do fluxo (cardápio,
  pedido, coorte).

## Limitações registradas (ver docs/INTEGRACAO.md)

- `GET /v1/handoff/pending` ainda não filtra por tenant.
- Cardápio/pedidos continuam sem API de cadastro própria por tenant (só FAQ tem essa
  configurabilidade até agora).
