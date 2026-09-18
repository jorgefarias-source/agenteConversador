# REGRAS CORPORATIVAS — JORDÃO CONSULTORIA E SOLUÇÕES

Este projeto pertence ao ecossistema de software da Jordão Consultoria e Soluções.

Antes de propor, criar ou modificar código, arquitetura, banco de dados, APIs, autenticação, permissões, integrações ou infraestrutura, o agente DEVE ler e obedecer às regras corporativas:

- `../../AI_RULES/01_COMPANY_CONTEXT.md`
- `../../AI_RULES/02_COMPLIANCE_LEGAL.md`
- `../../AI_RULES/03_SECURITY_STANDARDS.md`
- `../../AI_RULES/04_ARCHITECTURE_STANDARDS.md`
- `../../AI_RULES/05_AI_AGENT_RULES.md`

Estas regras são obrigatórias.

Em caso de conflito, prevalece:

1. Legislação e requisitos regulatórios aplicáveis
2. `02_COMPLIANCE_LEGAL.md`
3. `03_SECURITY_STANDARDS.md`
4. `04_ARCHITECTURE_STANDARDS.md`
5. `05_AI_AGENT_RULES.md`
6. Requisitos específicos deste projeto (abaixo)

O agente NÃO DEVE ignorar uma regra corporativa para concluir uma tarefa.

Se identificar possível conflito legal, de privacidade ou de segurança, deve BLOQUEAR a implementação afetada, explicar o risco e solicitar decisão humana quando necessário.

---

# CONTEXTO ESPECÍFICO — Agente Conversador (WhatsApp, fase de laboratório/piloto)

## O que é

Agente de atendimento via WhatsApp (`agente-whatsapp-laboratorio`), atualmente em fase de laboratório/piloto (Fase C concluída, Fase D1 em andamento — ver `STATUS_C_D1_ATIVO.md`). Responde FAQ, consulta cardápio e status de pedido, com fallback opcional para LLM pago.

## Domínio e dados sensíveis

- Trata dados pessoais de clientes finais via WhatsApp: identificadores de canal/remetente, conteúdo de mensagens e, na Fase D1, dados de pedido (status, vínculo com remetente).
- Não trata dados de saúde. Ainda assim, mensagens de cliente e identificadores de contato são dados pessoais sob LGPD — aplicar minimização e não persistir mais do que o necessário para o atendimento.

## Regras específicas

- **Modelo de tenant padrão implementado (2026-09-17)**: o negócio é resolvido por `tenant_channels` → `tenants` no PostgreSQL (`src/infra/tenants.ts`), não mais por variável de ambiente. Toda tabela de domínio (`inbound_messages`, `outbound_messages`, `escalations`) tem `tenant_id NOT NULL` com FK para `tenants`, conforme `04_ARCHITECTURE_STANDARDS.md` seções 3-4. Novo canal/negócio é cadastrado via `upsertTenantWithChannel` (script `npm run seed:demo` para o tenant de demonstração).
- **Titularidade de pedido obrigatória**: toda consulta de pedido (`status do pedido PED-xxxx`) deve validar que o pedido pertence à identidade do canal+remetente que está perguntando. Nunca retornar dado de pedido de terceiro. Esta regra é crítica e qualquer mudança que a enfraqueça deve ser bloqueada e escalada (equivalente a reduzir isolamento entre partes, ver `05_AI_AGENT_RULES.md` seção 3).
- **LLM pago é opt-in e tem orçamento**: uso de LLM pago é controlado por `ALLOW_PAID_LLM` e `LLM_BUDGET_USD` (`src/features/llm-budget.ts`). Nunca enviar dados pessoais do cliente (nome, telefone, número de pedido, conteúdo de mensagem completo) para o provedor de LLM sem necessidade estrita para responder à pergunta; qualquer novo destino externo para dados do cliente (novo provider de LLM, novo webhook, nova integração) exige confirmação humana antes de implementar, conforme `05_AI_AGENT_RULES.md` seção 2.
- **Envio real de WhatsApp é opt-in**: `ALLOW_WHATSAPP_SEND=false` por padrão. Não habilitar envio real em ambiente de laboratório/CI.
- **Conector de WhatsApp é biblioteca não oficial (decisão final do usuário em 2026-09-17)**: `src/lab/whatsapp-connector.ts` usa `@whiskeysockets/baileys`, que automatiza o protocolo do WhatsApp sem passar pela API oficial da Meta — isso viola os Termos de Serviço da Meta e o número pode ser banido a qualquer momento, sem aviso. O usuário avaliou esse risco conscientemente (após validar o conector funcionando de ponta a ponta com envio real) e decidiu manter a biblioteca não oficial; não é mais uma pendência em aberto. Se um número real vier a ser banido, a alternativa registrada é migrar para a WhatsApp Cloud API oficial (ver `STATUS_D5_ATIVO.md`). Sessão de autenticação fica no Postgres (`whatsapp_auth_creds`/`whatsapp_auth_keys`), nunca em arquivo local. Conexões são iniciadas dinamicamente via `POST /v1/whatsapp/connections`, uma por tenant.
- **WhatsApp identifica contatos por "LID" (identificador opaco), não só por número de telefone**: resolvido automaticamente (2026-09-17) em `whatsapp-connector.ts` via `remoteJidAlt`/`sock.signalRepository.lidMapping.getPNForLID`. Mensagens chegam identificadas pelo número de telefone real sempre que o mapeamento estiver disponível; ver `STATUS_D5_ATIVO.md`.
- **Conector é multi-tenant dinâmico**: o Conversador é o motor central de atendimento WhatsApp para vários produtos da Jordão (PetShop, Mordomê, Cuida...). Cada cliente final conecta o próprio WhatsApp via API (`POST /v1/whatsapp/connections`) de dentro do sistema que contratou — não existe (nem deve existir) um login de cliente final direto no Conversador.
- **Restrição de coorte é por tenant, no banco (2026-09-17)**: `tenants.pilot_mode` + tabela `tenant_pilot_senders` (`migrations/0004`). Um tenant novo/real por padrão atende qualquer remetente (`pilot_mode=false`) — é o comportamento correto para clientes reais. Ativar `pilot_mode=true` restringe a resposta automática a uma lista controlada, útil só durante testes com um negócio específico. A variável de ambiente `PILOT_SENDERS` foi removida; não recriá-la — a fonte de verdade é o banco.
- **Recursos genéricos por tenant (link/lista/texto), via API (2026-09-17)**: `tenant_resources` (`migrations/0006`) — mecanismo genérico para qualquer coisa específica de tipo de negócio (link de cardápio online, lista de especialidades do Cuida, etc.), acionado por palavra-gatilho, sem precisar de código novo por vertical. Tem prioridade sobre o cardápio/pedido de demonstração da Fase D. Ver `docs/INTEGRACAO.md` seção 3 e `STATUS_D9_ATIVO.md`.
- **FAQ é configurável por tenant, via API, no banco (2026-09-17)**: `faq_entries` (`migrations/0005`) substitui o antigo `faqByBusiness` hardcoded. Configuração via `POST/GET/PATCH/DELETE /v1/tenants/:channel_account_id/faq` — é assim que se responde "como configuro as respostas de cada cliente" (ver `docs/INTEGRACAO.md`). `src/features/faq.ts` só guarda a lógica pura de comparação (`answerFromFaq`) e uma fixture de demonstração usada exclusivamente por ferramentas offline sem banco (`npm run lab`, `eval-local.ts`) — nunca usada no fluxo real de atendimento.
- **Integração com outros sistemas da Jordão é via API HTTP**: ver `docs/INTEGRACAO.md` — é o documento de referência para conectar PetShop/Mordomê/Cuida ao Conversador. O `AGENT_CONNECTOR_TOKEN` é exclusivamente administrativo; cada sistema cliente usa credencial própria, vinculada a um tenant e limitada por escopos (`integration_credentials`, migration `0007`). O token da integração só é exibido na criação e apenas seu hash é persistido. `GET /v1/handoff/pending` filtra automaticamente pelo tenant da credencial.
- **Cardápio/clientes/pedidos em PostgreSQL (2026-09-17)**: `src/lab/customer-data.ts` saiu da fixture em memória para as tabelas `menu_items`, `customers` e `orders` (`migrations/0002_customer_data.sql`), com `tenant_id` e dinheiro em `NUMERIC(12,2)` (nunca float, conforme `04_ARCHITECTURE_STANDARDS.md` seção 25). Ainda são dados de demonstração (populados por `npm run seed:demo` / `src/infra/seed-customer-data.ts`), não uma fonte real de produção. Integrar com a fonte real (ERP, sistema de pedidos do negócio) continua sendo uma integração externa nova e exige decisão humana antes de implementar.
- **Persistência em PostgreSQL (2026-09-17)**: `inbox.ts`, `outbox.ts` e `handoff.ts` usam PostgreSQL via `src/infra/db.ts` (pool `pg`), não mais arquivo JSON local. Schema versionado em `migrations/0001_init.sql`, aplicado automaticamente na subida do servidor (`runMigrations()`) e rastreado em `schema_migrations`. Banco de piloto hoje roda no Railway, projeto `agenteConversador` (serviço "Postgres", ambiente `production`) — criado com autorização explícita do usuário.
- Segredos (`OPENAI_API_KEY`, `AGENT_CONNECTOR_TOKEN`, `DATABASE_URL`) vivem em `.env.local`/variáveis de ambiente, nunca commitados — `.env.example` deve continuar sem valores reais.
- Não logar conteúdo completo de mensagens de cliente nem números de telefone em texto plano nos logs de observabilidade (`/v1/observacao/state`).
- **Retenção de histórico (LGPD)**: mensagens inbound/outbound e escalações são retidas por **90 dias** por padrão (`getRetentionDays()` em `src/infra/retention.ts`, configurável via `AGENT_RETENTION_DAYS`), expurgadas via `DELETE ... WHERE created_at/received_at/escalated_at < now() - interval` (`purgeExpiredInbound`/`purgeExpiredOutbound`/`purgeExpiredEscalations`). Prazo definido em 2026-09-17 como decisão humana explícita, atendendo a `02_COMPLIANCE_LEGAL.md` seção 1. Mudar esse prazo é decisão de política de dados e deve ser confirmada por humano.
- **Acesso público temporário ao banco**: o serviço Postgres do Railway já teve um proxy TCP público criado e removido mais de uma vez, sempre com autorização explícita do usuário, só para validar migrações a partir do ambiente local de desenvolvimento. Antes de qualquer uso real em produção, confirmar que esse proxy está removido — a aplicação deve se conectar ao Postgres pela rede privada do Railway (`RAILWAY_PRIVATE_DOMAIN`), nunca pelo proxy público, conforme `04_ARCHITECTURE_STANDARDS.md` seção 16.

## Stack específica

- Runtime: Node.js + TypeScript (`tsx`), Express — compatível com o padrão.
- Persistência: PostgreSQL (padrão corporativo), com modelo de tenant (`tenants`, `tenant_channels`) conforme `04_ARCHITECTURE_STANDARDS.md`.
- Hospedagem do banco: Railway, projeto `agenteConversador`.

## Fluxo de entrega confirmado

- **Commit e deploy após alterações (decisão do usuário em 2026-09-18):** depois de modificar o Conversador e concluir as validações aplicáveis, criar commit e enviar a branch `main` ao remoto para acionar o deploy de produção. O usuário está validando este projeto diretamente em produção. Não aplicar migrations manualmente no banco: o deploy executa as migrations versionadas na inicialização. Se uma mudança for destrutiva, envolver segredo ou não passar nas validações, bloquear e informar antes do deploy conforme as regras corporativas.
