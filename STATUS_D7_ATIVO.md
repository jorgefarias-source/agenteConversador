# Fase D7: painel interno JCS (monitoramento de uso e saúde)

- Implementado em: 2026-09-17.
- Uso interno da Jordão (não é exposto a clientes finais) — autenticado pelo mesmo
  `AGENT_CONNECTOR_TOKEN` já usado no restante da API, conforme decidido para esta fase.

## O que foi implementado

- [src/infra/admin-stats.ts](src/infra/admin-stats.ts): agrega, por tenant, contagem de
  mensagens recebidas/respondidas, escalonamentos pendentes, falhas de envio (`status='uncertain'`
  em `outbound_messages`) e data da última mensagem.
- `GET /v1/admin/overview` (JSON): lista todos os tenants de todos os produtos que usam o
  Conversador, cruzando os dados acima com o status **ao vivo** da conexão WhatsApp
  (`listConnections()`), e marca `hasIssue: true` quando:
  - alguma conexão WhatsApp do tenant não está `connected`, ou
  - há falhas de envio registradas (`uncertainOutbound > 0`), ou
  - a fila de escalonamento passou de 3 conversas pendentes (heurística inicial, ajustável).
- `GET /v1/admin/painel` (HTML): tabela com auto-atualização a cada 10s, mostrando negócio,
  canal(is), status da conexão, modo (piloto/aberto), uso e sinais de problema em destaque.

## Limitação conhecida

O status de conexão WhatsApp vem do estado em memória do processo (`listConnections()`), não do
banco. Se o Conversador rodar em mais de uma instância (escala horizontal), cada instância só
enxerga as conexões que ela mesma iniciou — o painel não teria visão unificada nesse cenário.
Hoje, com uma única instância rodando o processo, isso não é problema, mas é algo a revisar antes
de escalar horizontalmente (`04_ARCHITECTURE_STANDARDS.md` seção 15: "nenhuma otimização
prematura", então isso fica documentado, não resolvido agora).

## Evidência

- Testado ao vivo contra o Postgres real do Railway: painel mostrou corretamente o tenant
  `ponto-do-recheio` conectado, sem problemas, após limpar dados residuais de depuração.
- Também exibiu corretamente um tenant de teste sem conexão iniciada (`hasIssue: true`,
  status `sem_conexao`), confirmando que o sinalizador de problema funciona.
