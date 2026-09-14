# Agente de IA central para WhatsApp — Escopo v0.3

**Responsável:** Jorge  
**Data:** 14/09/2026  
**Situação:** revisão técnica proposta; orçamento, piloto e ativação em produção dependem de aprovação.  
**Base:** escopo original e v0.2, revisados após as críticas apresentadas por Jorge.

> Entregar primeiro uma conversa útil sobre informações públicas. Acrescentar acesso a dados e ações somente quando os controles daquela capacidade estiverem prontos.

## 1. Resultado e recorte

Construir uma central reutilizável em Node.js para os bots existentes. O modelo interpreta mensagens e ajuda a responder; o código controla identidade, contexto, permissões, consultas, envio e consumo.

O projeto terá dois produtos incrementais: atendimento a clientes e consultas de gestores. A entrega do primeiro não depende de concluir o segundo.

**Piloto recomendado:** Ponto do Recheio. **Primeiro resultado:** responder por texto às perguntas frequentes aprovadas, aproveitar o contexto e encaminhar o que estiver fora do alcance. Nesta entrega não há conexão ao banco de vendas, consulta de pedidos ou alteração de dados do negócio.

O sistema antigo continua responsável pelos pedidos e demais operações existentes. Sua troca pelo agente é gradual, por conversa e capacidade, sem dois respondedores ativos ao mesmo tempo.

## 2. Decisões de implementação propostas

| Tema | Decisão |
| --- | --- |
| Aplicação | Um serviço modular Node.js; TypeScript para os contratos novos. Não reescrever todos os bots. |
| IA | Uma API externa inicialmente, com orçamento aprovado e adaptador substituível. Não comparar custos sem medir o uso real. |
| Canal | Preservar o conector existente e inspecionar seu recebimento, envio e controle de sessão antes da integração. |
| Processamento integrado | Recebimento persistido, confirmação rápida e processamento assíncrono. Nunca esperar a geração da IA para confirmar um evento externo. |
| Persistência | Postgres para o estado do agente e sua fila durável. Preferir componente de fila já disponível e adequado; não introduzir Redis ou outro serviço só por hábito. |
| Primeira base | Pequeno arquivo de FAQ aprovado, versionado e limitado em tamanho, carregado por negócio. Busca sofisticada e painel de edição ficam para uma necessidade demonstrada. |
| Isolamento | Identificar negócio, canal, conversa e público autorizado desde a primeira integração. Sem contexto global compartilhado entre empresas. |
| Acesso a dados | Funções específicas, autorização no código e credenciais restritas. Sem SQL, URLs ou código arbitrários fornecidos pelo modelo. |
| Controle humano | Pausar, assumir e retomar a conversa por comando autenticado; apenas um responsável por enviar a resposta. |
| Melhoria | Revisão de erros e testes de regressão. Sem aprendizagem automática a partir de mensagens de clientes e sem fine-tuning no MVP. |

A interface do modelo deve cobrir apenas o necessário: mensagens, saída estruturada, ferramentas quando habilitadas, cancelamento, consumo e erros. Não criar uma camada universal para todas as funcionalidades de todos os provedores.

## 3. Entregas independentes e seus requisitos

| Entrega | Resultado verificável | Requisitos para liberar | Não precisa esperar |
| --- | --- | --- | --- |
| **A — Laboratório conversacional** | Conversas de teste com FAQ público, sem envio ao WhatsApp. | FAQ revisado, dados fictícios, casos de avaliação, provedor e teto antes de chamadas pagas. | Schema de vendas, gestores, integração de produção, painel de revisão. |
| **B — Observação integrada** | Receber mensagens selecionadas e registrar sugestões; cliente continua com o atendimento atual. | Integração autenticada, isolamento, fila durável, limites, registro mínimo e regras de uso/retenção dos dados reais. Envio do agente bloqueado por código. | Relatórios, RLS de vendas, busca vetorial, todos os sistemas. |
| **C — Piloto de FAQ ao vivo** | Respostas automáticas sobre o FAQ, para uma coorte limitada de conversas. | Testes críticos aprovados, qualidade medida, encaminhamento disponível, dono único da conversa, controle de envio e desligamento testados. | Conectar o banco do negócio ou terminar o módulo de gestor. |
| **D1 — Consultas de cliente** | Cardápio atual e status do próprio pedido. | Fonte atual, funções restritas, autorização por recurso e testes de titularidade. | Relatórios gerenciais. |
| **D2 — Consultas de gestor** | Indicadores agregados de vendas com datas e valores corretos. | Gestores cadastrados, métricas aprovadas, consultas de referência, acesso restrito de leitura e revogação testada. | D1 estar concluída. |
| **E — Expansão** | Novos negócios e, depois, capacidades adicionais. | Evidência do piloto e testes por capacidade/negócio. | Implantar uma plataforma genérica antecipadamente. |

A e a preparação de D podem ser desenvolvidas em paralelo. A segurança mínima de B e C não é adiada. Áudio, imagens, grupos, campanhas, alertas proativos, escrita em pedidos/estoque e modelo local são expansões separadas.

**Observação não é atendimento ao vivo.** Serve para medir e corrigir. O ganho para o cliente começa em C ou em um modo assistido no qual um atendente aprove e envie as sugestões.

Clientes de FAQ público não precisam de cadastro prévio de autorização. A coorte inicial pode ser selecionada pelo operador. Gestores precisam de cadastro explícito antes de D2; não é preciso cadastrar todos os clientes para isso.

## 4. O que significa conversar melhor

Avaliar diálogos completos, não apenas frases simpáticas. O agente deve aproveitar informações já fornecidas, compreender mensagens com mais de uma intenção, acompanhar correções, fazer somente as perguntas necessárias e reconhecer seus limites.

| Cenário | Comportamento esperado |
| --- | --- |
| “Vocês entregam e aceitam cartão na retirada?” | Responder às duas dúvidas usando o FAQ, sem obrigar a pessoa a entrar em menus. |
| “Vou buscar. Aliás, prefiro entrega.” | Atualizar a intenção; não continuar tratando a conversa como retirada. |
| Cliente informa nome ou bairro espontaneamente. | Não pedir novamente quando isso for necessário ao encaminhamento. Não coletar esses dados apenas para responder um FAQ. |
| Cliente pergunta preço ou prazo que não está em fonte atual. | Não adivinhar. Encaminhar ou explicar qual informação falta. |
| Cliente solicita um pedido na entrega C. | Transferir para o fluxo existente ou atendente, sem dizer que registrou ou confirmou o pedido. |
| Pessoa pede atendimento humano. | Realizar a transferência e suspender as respostas automáticas. |

A resposta será breve, em português natural, sem saudações repetitivas nem promessa de ser uma pessoa. Horários, links, políticas e demais informações precisam de fonte aprovada. Falta de contexto não é motivo para inventar fatos.

Para uma base pequena que caiba no limite de contexto, enviar o FAQ filtrado e versionado é suficiente como ponto de partida. Acrescentar busca somente quando o tamanho, custo ou qualidade justificar.

## 5. Critérios do piloto

Preparar inicialmente pelo menos 30 diálogos: 20 de atendimento e 10 de falha/segurança. Incluir correções, múltiplas intenções e pedidos fora de escopo. Separar exemplos de ajuste e casos reservados para avaliação. Repetir cenários críticos ao alterar modelo, instruções ou conhecimento. [S1, S8]

**Bloqueios de liberação:** vazamento entre empresas/conversas; uso de capacidade não autorizada; resposta enviada em modo de observação; duplicação em reentrega controlada; resposta pendente enviada após tomada humana antes do despacho; falsa confirmação de pedido/ação; falha de orçamento ou de autenticação nos testes. Corrigir e repetir antes de ativar a capacidade afetada.

**Meta inicial proposta:** pelo menos 90% dos diálogos comuns aprovados pelo revisor sem correção factual ou de condução. É um alvo do piloto, não resultado já obtido. Registrar também quantos casos ficaram sem resposta útil: encaminhar tudo não conta como sucesso.

Medir separadamente tempo de confirmação técnica, espera na fila, geração e envio; custo por diálogo completo; percentual de encaminhamento; erros factuais; repetição de perguntas e sugestões aproveitadas. O tempo-alvo de atendimento será registrado após a primeira medição e antes da ativação automática.

No começo, revisar integralmente um lote pequeno de observação/piloto. Depois da estabilização, revisar todas as falhas e uma amostra dos demais atendimentos. A confiança declarada pelo modelo não seleciona sozinha os casos de revisão.

## 6. Próximo incremento de desenvolvimento

Implementar somente a entrega A e seus contratos de integração, com FAQ fictício ou aprovado e sem credenciais do banco de vendas. Produzir demonstração reproduzível, casos de teste e medição de qualidade/custo. Antes de B, integrar o recebimento persistido e o envio desabilitado.

Jorge aprova FAQ, piloto, orçamento, métricas e encaminhamento. A implementação define contratos e testes. Revisões de Claude/Codex devem apontar o requisito, a mudança e o teste correspondente; não alterar simultaneamente os mesmos arquivos sem integração controlada.

**Pendências por entrega, não uma lista bloqueando tudo:**
- A: FAQ, modelo e teto de gasto para a comparação real.
- B/C: conector piloto, retenção/configuração de dados, responsável humano e controle do envio.
- D1: relação entre remetente e pedido, fonte do cardápio.
- D2: tabelas/views estritamente necessárias, gestores e definições das métricas.

---

# Anexo técnico — consultar conforme a entrega

## T1. Identidade e autorização

O negócio é resolvido pela credencial autenticada da integração e pelo vínculo com o canal. O remetente vem dos metadados confiáveis do conector. As permissões vêm do cadastro interno por negócio. O modelo não pode alterar nenhum desses vínculos.

Tratar `sender_id` como identificador opaco do provedor; não supor que todo identificador já seja um telefone E.164. Vincular o cadastro de gestores à identidade que o conector efetivamente fornece. Nome de exibição e texto da conversa nunca autorizam acesso.

Uma credencial de conector comprometida permite simular eventos daquele escopo; protegê-la, restringi-la e permitir revogação. Validar autenticidade dos eventos externos pelo mecanismo do canal. Aplicar limites antes de chamar a IA.

Autorizar a recuperação de contexto, a execução da ferramenta e o envio da resposta. Revogar um gestor deve bloquear novas consultas e respostas ainda não despachadas. Histórico e cache de relatórios não podem continuar sendo fornecidos ao modelo depois da perda de permissão.

Nunca compartilhar contexto de gestor com o contexto público por conveniência. Cadastrar uma pessoa em uma empresa não a cadastra nas demais. O controle de acesso não pode ser somente uma frase no prompt. [S1, S2]

## T2. Recebimento durável e confirmação

Fluxo integrado escolhido:

```text
Conector autenticado
  -> validar evento e vínculo com o canal
  -> deduplicar e persistir entrada/trabalho pendente
  -> confirmar recebimento após commit
  -> worker processa sem manter a requisição aberta
  -> persistir resultado e intenção de envio
  -> conector envia e registra o resultado
```

**Regra:** confirmar recebimento depois de existir registro durável, sem esperar a IA. Se a persistência falhar, não confirmar uma entrega que será perdida. O tratamento de reentrega é parte do contrato. A Meta documenta reenvios de webhooks que falham; não confundir o prazo de confirmação técnica com o prazo de resposta ao cliente. [S3]

No webhook externo, usar o código de confirmação exigido pelo provedor. Na API interna, usar `202 Accepted` para entrada persistida e processamento posterior. Esses dois contratos são diferentes. Um `202` interno não substitui automaticamente o ACK exigido pelo WhatsApp.

Eventos inválidos, não suportados, repetidos, de status ou enviados pelo próprio bot não disparam IA. Eventos autenticados deliberadamente ignorados recebem o tratamento correto do canal, sem ciclos de reentrega intermináveis. Em lotes, só confirmar depois de persistir ou classificar todos os itens necessários.

No Venom, o recebimento usual é um evento como `onMessage`, não o webhook HTTP da Meta. O adaptador deve persistir/repetir o encaminhamento à central quando necessário. Não atribuir ao Venom garantias de recuperação de mensagens que sua versão/configuração não oferece. [S4]

### Contrato interno de entrada

```http
POST /v1/messages
Authorization: Bearer <credencial-da-integracao>
Content-Type: application/json
```

```json
{
  "schema_version": "1",
  "message_id": "id-original-estavel",
  "channel_account_id": "canal-cadastrado",
  "sender_id": "id-do-remetente-no-provedor",
  "sent_at": "2026-09-14T12:00:00Z",
  "type": "text",
  "text": "Vocês fazem entrega?"
}
```

Resposta após persistência:

```json
{
  "receipt_id": "recibo-estavel-da-central",
  "message_id": "id-original-estavel",
  "status": "accepted",
  "duplicate": false,
  "trace_id": "id-de-rastreamento"
}
```

Reentregas válidas reutilizam o mesmo recibo, com indicação de duplicidade, sem criar outro trabalho. A unicidade da entrada combina negócio, canal e ID original da mensagem. O ID de negócio é resolvido no servidor. Reutilização do mesmo ID com conteúdo incompatível deve ser registrada e rejeitada/quarentenada.

O histórico vem do armazenamento autorizado da central, nunca de um array arbitrário enviado pelo cliente HTTP. Registrar `received_at` no servidor. `sent_at` serve para auditoria e tratamento de atraso; não redefine permissões, orçamento ou relógio do servidor.

## T3. Fila, concorrência e envio

Usar o Postgres do agente como fila inicial, com estado persistido, limite de tentativas, prazo de posse do trabalho e recuperação após reinício. API e worker podem pertencer à mesma aplicação; não é necessário criar uma plataforma de microserviços.

O Postgres documenta `SKIP LOCKED` para consumidores de tabelas semelhantes a filas. Ele auxilia a disputa por trabalhos, mas não resolve sozinho ordem por conversa, recuperação ou idempotência. Não usar uma consulta de fila como fonte dos relatórios financeiros. [S5]

Garantir um processamento ativo por conversa e ordenação interna definida. Se houver múltiplas instâncias, a exclusão deve ser compartilhada, não apenas uma variável em memória. Reivindicar o trabalho em transação curta; não manter uma transação aberta durante a chamada à IA. Usar versão/token de posse para impedir que um worker antigo confirme resultado depois de perder a posse.

Antes de despachar, conferir o estado atual da conversa, versão da resposta, permissão, validade do conhecimento e expiração. Mensagens novas podem invalidar uma resposta pendente; agrupar ou reprocessar com limite, sem ciclos infinitos de geração. Não prometer ordenação perfeita dos eventos externos apenas porque há uma fila interna.

Guardar o resultado e a intenção de envio na mesma transação, em uma estrutura de saída (`outbox`). Repetir o envio de uma resposta já pronta não exige gerar outro texto. Esse padrão trata a separação entre persistir e publicar; não transforma um canal externo em entrega exatamente uma vez. [S6]

Para conectores remotos, o contrato inicial será retirada autenticada de saídas pendentes e confirmação do resultado. Sugestão: `POST /v1/outbound/claim` e `POST /v1/outbound/{delivery_id}/result`, com posse temporária. O conector só retira saídas do próprio escopo. Não receber URL arbitrária de callback do modelo ou do usuário.

Manter ID de entrega estável e registrar o ID retornado pelo provedor. Distinguir resposta preparada, despacho iniciado, aceitação pelo provedor e entrega ao destinatário. Se o canal aceitar o envio e o processo cair antes de registrar, marcar resultado incerto e reconciliar; não reenviar cegamente. Expiração de uma posse não comprova que o envio externo não ocorreu.

Respostas vencidas são descartadas/encaminhadas, não enviadas horas depois. No canal oficial, verificar também a janela de atendimento no momento do envio. Mensagens proativas e templates continuam fora deste piloto. [S9]

## T4. Controle da conversa e fallback

Separar **modo de execução** (`observacao`, `assistido`, `automatico`) de **responsável pelo atendimento** (`legado`, `agente`, `humano`). Há um responsável autorizado a responder por vez.

Em observação, o agente não publica saídas e não altera o fluxo real. Depois, o atendimento humano ou legado deve assumir por transição registrada. Essa transição invalida respostas pendentes ainda não despachadas; o conector confere a autorização no ponto de despacho. Uma resposta já aceita pelo provedor não pode ser tratada como cancelada retroativamente.

Não implementar “esperar alguns segundos e deixar o bot antigo responder” sem cancelar a resposta tardia da IA. Timeout HTTP após uma entrada possivelmente aceita também não prova que a central deixou de trabalhar. Consultar o recibo, repetir com o mesmo ID ou coordenar a transferência antes de ativar outro respondedor.

O modo de observação bloqueia ações reais de negócio. Futuras ferramentas de escrita devem ter simulação separada; não basta ocultar a mensagem final. Desligamento por negócio/capacidade e retomada explícita devem funcionar sem redeploy.

## T5. Dados e ferramentas de D1/D2

Inspecionar apenas o schema e as funções necessários à capacidade em desenvolvimento. Preferir APIs existentes que já implementem regras corretas; acesso SQL é uma opção de adaptador, não uma obrigação para todo sistema.

No banco do negócio, usar credencial somente leitura com acesso mínimo a tabelas/colunas/views e funções. No armazenamento do agente, usar credencial diferente para suas próprias estruturas. Migrações do agente não alteram vendas ou estoque.

Ferramentas permitidas iniciais: `consultar_cardapio`, `consultar_status_pedido`, `consultar_vendas_periodo` e `comparar_vendas_dia_semana`, implementadas conforme a entrega. Não expor `executar_sql`, terminal ou URLs livres. Validar argumentos e autorizações no servidor; negócio, destinatário e permissões não são argumentos escolhidos pelo modelo. [S1, S2]

Para status de pedido, verificar titularidade pelo vínculo real do sistema. Para gestor, liberar somente agregados aprovados em conversa individual. Revogação de acesso deve atingir histórico recuperável, ferramentas e envio pendente.

Consultas parametrizadas, com limite de período, linhas, concorrência e tempo. Havendo tabelas compartilhadas, usar isolamento por negócio e avaliar RLS como defesa adicional. Superusuários, `BYPASSRLS` e normalmente proprietários de tabela contornam RLS; testar com o papel efetivamente usado pela aplicação. [S7]

No Railway, priorizar rede privada para serviços no mesmo projeto e ambiente. Se a central não compartilha esse ambiente, usar integração autenticada apropriada, sem presumir acesso privado entre projetos. [S10]

## T6. Métricas e calendário de D2

Antes de liberar cada indicador, Jorge aprova sua definição: quantidade de pedidos ou itens, estados válidos, bruto/líquido, descontos, devoluções, data de referência e dia civil/operacional. Documentar a versão da métrica.

Proposta inicial: fuso `America/Sao_Paulo`; períodos com início inclusivo e fim exclusivo. “Últimas cinco segundas” exclui a atual incompleta, salvo pedido explícito em contrário. Em 14/09/2026, o conjunto proposto é 10/08, 17/08, 24/08, 31/08 e 07/09/2026. Comparações parciais devem declarar a diferença de período.

O modelo ajuda a selecionar intenção e argumentos. Datas, filtros, cálculos, arredondamentos e apresentação dos valores ficam no código. Para dinheiro, usar centavos inteiros ou decimal apropriado. Não permitir que um parágrafo livre contradiga o bloco numérico determinístico.

Cada resultado informa métrica, período, fuso, horário de consulta e condição parcial. Resultado zero, dado ausente e falha são estados distintos. Validar com dados sintéticos e consulta de referência. Não liberar um indicador que esteja semanticamente indefinido.

## T7. Conhecimento, privacidade e consumo

Separar conhecimento aprovado, memória de conversa e dados operacionais. Registrar versão, origem, negócio e público de cada fonte. Mensagens de clientes são dados, não atualização de política; resumos de histórico também não concedem acesso. Dados de preço, estoque e vendas não viram FAQ permanente.

Para a primeira entrega, edição do FAQ por revisão de arquivo é suficiente. Depois, corrigir falhas na camada certa: conhecimento, instruções, recuperação, código, integração ou métrica. Não acumular pares pergunta/resposta sem origem e validade. Não registrar raciocínio interno do modelo como mecanismo de auditoria; registrar decisões operacionais observáveis, argumentos, fontes e resultados necessários.

Antes de usar conversas reais, registrar finalidade, acessos, prazo de retenção, descarte, tratamento pelo provedor e destino das solicitações sobre dados. Minimizar texto e identificadores enviados à IA; dados agregados para gestores. Logs técnicos não devem conter tokens, senhas ou cópias integrais de conversas por padrão. A política deve corresponder à configuração efetiva, incluindo backups. O regime de pequeno porte da ANPD não é uma dispensa geral de proteção de dados. [S11]

Chamadas pagas ficam desabilitadas sem configuração expressa de orçamento e provedor. Controlar entrada, saída, contexto, número de chamadas, ferramentas e tentativas. Reservar orçamento para chamadas concorrentes antes do envio à API; reconciliar consumo informado, inclusive falhas quando houver cobrança. Não trocar automaticamente para um provedor mais caro.

Limitar consumo por negócio e remetente; uma conversa não deve consumir toda a fila. Medir IA, banco/hospedagem e canal separadamente. Reavaliar preços e termos na escolha do provedor; nenhum valor de tarifa discutido anteriormente é incorporado como garantia neste escopo.

## T8. Testes técnicos mínimos da integração

| Caso | Evidência exigida |
| --- | --- |
| Credencial errada ou canal de outra empresa | Rejeição antes de recuperar contexto ou chamar IA. |
| Mensagem repetida, inclusive concorrente | Um recibo/trabalho lógico; nenhuma segunda resposta criada pelo reenvio. |
| Queda antes/depois da persistência | Sem confirmação enganosa; trabalho persistido recuperado após reinício. |
| Queda após geração e antes de envio | Reutilização da saída persistida, sem nova geração desnecessária. |
| Resultado externo de envio incerto | Estado explícito e reconciliação, sem reenvio cego. |
| Duas mensagens e uma correção | Sem duas execuções concorrentes da mesma conversa; tratamento da resposta desatualizada. |
| Humano assume durante geração | Saída ainda não despachada invalidada; bot antigo e IA não respondem juntos. |
| Observação com mensagem real | Nenhum envio automático nem ação real de negócio. |
| Orçamento esgotado ou modelo indisponível | Sem novas chamadas proibidas; transferência/fallback controlado. |
| Cliente pede dados internos ou de outro cliente | Negativa sem divulgar esses dados. |
| Gestor revogado com relatório em histórico/fila | Sem reutilização ou envio de dados protegidos pendentes. |
| Fila muito atrasada | Sem resposta vencida ou envio incompatível com o canal. |

Não exigir testes de uma ferramenta ainda inexistente para liberar FAQ. Exigir os testes relevantes à exposição atual e adicionar os demais ao habilitar a capacidade.

## Registro das mudanças em relação à v0.2

A entrega de FAQ foi desacoplada de relatórios e do banco de vendas. Observação passou a anteceder as consultas. O contrato de recebimento tornou-se explicitamente assíncrono e durável. Foram separados modo de execução e responsável por enviar. Foram acrescentados critérios de conversa, revogação sobre histórico, tratamento de envio incerto e condições de liberação por capacidade. Referências de segurança passaram a priorizar OWASP; não há dependência do Agent Builder.

## Referências verificadas em 14/09/2026

As fontes sustentam mecanismos e riscos. Metas, contratos e sequência são escolhas propostas para este projeto, não exigências literais dessas referências.

- **[S1] OWASP — AI Agent Security Cheat Sheet:** `https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html`
- **[S2] OWASP — LLM Prompt Injection Prevention:** `https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html`
- **[S3] Meta — WhatsApp Webhooks e Throughput:** `https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview` e `https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput`. Nesta revisão, as informações de reentrega e baixa latência foram obtidas nos trechos indexados das páginas oficiais; a abertura integral retornou erro. Confirmar o contrato completo no conector escolhido antes da integração.
- **[S4] Venom — repositório e eventos de mensagens:** `https://github.com/vynect/venom`
- **[S5] PostgreSQL — SELECT, cláusulas de bloqueio e SKIP LOCKED:** `https://www.postgresql.org/docs/current/sql-select.html`
- **[S6] AWS Prescriptive Guidance — Transactional Outbox Pattern:** `https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html`. Referência do padrão; não é uma proposta de adotar a infraestrutura AWS.
- **[S7] PostgreSQL — Row Security Policies:** `https://www.postgresql.org/docs/current/ddl-rowsecurity.html`
- **[S8] OpenAI — Evaluation Best Practices:** `https://developers.openai.com/api/docs/guides/evaluation-best-practices`. Referência conceitual; testes e casos permanecerão no repositório próprio, sem dependência do serviço hospedado Evals.
- **[S9] WhatsApp — Business Policy:** `https://whatsappbusiness.com/policy/`
- **[S10] Railway — Private Networking:** `https://docs.railway.com/networking/private-networking`
- **[S11] ANPD — Resolução CD/ANPD nº 2/2022:** `https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022`

**Nota de verificação:** a documentação oficial do Agent Builder confirma desligamento previsto para 30/11/2026: `https://developers.openai.com/api/docs/guides/agent-builder`. O encerramento do produto não invalida automaticamente princípios gerais de segurança; nesta revisão, as instruções de implementação não dependem desse produto.
