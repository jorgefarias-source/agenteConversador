import dotenv from 'dotenv';
import express from 'express';

import { parseEnv, requireConnectorToken, validatePaidConfig } from '../config/env';
import { IncomingMessagePayload } from './inbox';
import { allOutbound, claimOutbound, markDispatched, outboundCount, outboundPendingCount, pauseBySender, resetOutbound } from './outbox';
import { resetWork, inboundCount } from './inbox';
import { escalateSender, listEscalated, resetEscalations, resolveSender } from './handoff';
import {
  addPilotSender,
  listPilotSenders,
  removePilotSender,
  resolveTenantByChannel,
  setTenantPilotMode,
  upsertTenantWithChannel,
} from '../infra/tenants';
import { runMigrations } from '../infra/db';
import { listTenantsWithStats } from '../infra/admin-stats';
import { createFaqEntry, deleteFaqEntry, listFaqEntries, updateFaqEntry } from '../infra/faq-repo';
import { createResource, deleteResource, listResources, updateResource } from '../infra/resources-repo';
import {
  AuthPrincipal,
  createIntegrationCredential,
  INTEGRATION_SCOPES,
  IntegrationScope,
  authenticateBearerToken,
  isIntegrationScope,
  principalCanAccessTenant,
  principalHasScope,
  revokeIntegrationCredential,
} from '../infra/integration-auth';
import { processIncomingMessage } from './message-processor';
import {
  getConnectionQr,
  getConnectionStatus,
  listConnections,
  resumeAllWhatsappConnections,
  startWhatsappConnector,
  stopWhatsappConnector,
} from './whatsapp-connector';

dotenv.config();
dotenv.config({ path: '.env.local', override: false });
const cfg = parseEnv(process.env);

const app = express();
app.use(express.json());

const requestPrincipals = new WeakMap<express.Request, AuthPrincipal>();

async function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const principal = await authenticateBearerToken(match?.[1]?.trim() || '', requireConnectorToken(cfg));
    if (!principal) {
      return res.status(401).json({ error: 'Autorização inválida.' });
    }
    requestPrincipals.set(req, principal);
    return next();
  } catch (error) {
    return next(error);
  }
}

function principalOf(req: express.Request): AuthPrincipal {
  const principal = requestPrincipals.get(req);
  if (!principal) throw new Error('Principal autenticado ausente.');
  return principal;
}

function tenantIdOf(principal: AuthPrincipal): string | undefined {
  return principal.kind === 'integration' ? principal.tenantId : undefined;
}

function adminOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (principalOf(req).kind !== 'admin') {
    return res.status(403).json({ error: 'Operação restrita à administração interna.' });
  }
  return next();
}

function requireScope(scope: IntegrationScope) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!principalHasScope(principalOf(req), scope)) {
      return res.status(403).json({ error: `Escopo obrigatório ausente: ${scope}.` });
    }
    return next();
  };
}

async function authorizedTenant(req: express.Request, res: express.Response, channelAccountId: string) {
  const tenant = await resolveTenantByChannel(channelAccountId);
  if (!tenant) {
    res.status(404).json({ error: 'Canal sem tenant cadastrado.' });
    return undefined;
  }
  if (!principalCanAccessTenant(principalOf(req), tenant.id)) {
    res.status(403).json({ error: 'Credencial não autorizada para este tenant.' });
    return undefined;
  }
  return tenant;
}

function routeParam(req: express.Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

app.get('/', (_req, res) => {
  res.json({
    service: 'agente-whatsapp-laboratorio',
    mode: 'pilot-worker',
    endpoints: {
      health: '/v1',
      observe: '/v1/observacao',
      claim: '/v1/outbound/claim',
      result: '/v1/outbound/:delivery_id/result',
      messages: '/v1/messages',
    },
  });
});

app.get('/v1', (_req, res) => {
  res.json({ ok: true, mode: 'pilot-lab', message: 'Servidor de laboratório ativo', version: 'v0.4' });
});

app.get('/v1/painel', (_req, res) => {
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Painel de teste - piloto</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; background: #f4f6fb; color: #18202d; }
          button { margin-right: 8px; padding: 8px 12px; }
          pre { background: #fff; border: 1px solid #d7deea; padding: 12px; border-radius: 8px; }
          .row { margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <h1>Painel de teste (modo piloto)</h1>
        <div class="row">
          <h3>Enviar mensagem</h3>
          <label>message_id: </label><input id="messageId" value="test-` + Date.now().toString() + `" size="26" />
          <label>sender_id: </label><input id="senderId" value="remetente-demo-A" size="20" /><br/>
          <label>channel_account_id: </label><input id="channelId" value="canal-demo" size="20" /><br/>
          <label>texto: </label><br/>
          <textarea id="text" rows="3" cols="68">cardápio</textarea><br/>
          <button onclick="sendMessage()">POST /v1/messages</button>
        </div>
        <div class="row">
          <button onclick="ping()">GET /v1</button>
          <button onclick="state()">GET estado</button>
          <button onclick="claim()">Claim outbound</button>
          <button onclick="result()">Result (OK) no último claim</button>
          <button onclick="reset()">Reset estado</button>
        </div>
        <div class="row">
          <label>Último delivery_id: </label>
          <input id="deliveryId" size="48" />
        </div>
        <pre id="log">carregando...</pre>
        <script>
          const token = sessionStorage.getItem('pilot_token') || prompt('Token da integração') || '';
          if (token) sessionStorage.setItem('pilot_token', token);
          const base = '';
          const log = (value) => document.getElementById('log').textContent = JSON.stringify(value, null, 2);
          const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
          const request = async (path, method='GET', body) => {
            const r = await fetch(base + path, {
              method,
              headers,
              body: body ? JSON.stringify(body) : undefined
            });
            const text = await r.text();
            try { return JSON.parse(text || '{}'); } catch { return { statusCode: r.status, text }; }
          };
          const sendMessage = async () => {
            const payload = {
              schema_version: '1',
              message_id: document.getElementById('messageId').value || ('test-' + Date.now()),
              channel_account_id: document.getElementById('channelId').value,
              sender_id: document.getElementById('senderId').value,
              sent_at: new Date().toISOString(),
              type: 'text',
              text: document.getElementById('text').value,
            };
            const response = await request('/v1/messages', 'POST', payload);
            log(response);
          };
          const ping = async () => log(await request('/v1'));
          const state = async () => log(await request('/v1/observacao/state'));
          let lastClaimToken = '';
          const claim = async () => {
            const claimResult = await request('/v1/outbound/claim', 'POST', {});
            if (claimResult.delivery_id) {
              document.getElementById('deliveryId').value = claimResult.delivery_id;
              lastClaimToken = claimResult.claim_token || '';
            }
            log(claimResult);
          };
          const result = async () => {
            const id = document.getElementById('deliveryId').value;
            if (!id) { log({ error: 'Informe um delivery_id' }); return; }
            log(await request('/v1/outbound/' + id + '/result', 'POST', { ok: true, reason: 'disparado pelo painel', claim_token: lastClaimToken }));
          };
          const reset = async () => log(await request('/v1/observacao/state/reset', 'POST', {}));
        </script>
      </body>
    </html>`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(html);
});

// Painel interno JCS: visão de todos os tenants (todos os produtos que usam o Conversador),
// status de conexão do WhatsApp e sinais de problema na automação. Uso interno (Jordão),
// autenticado pelo mesmo AGENT_CONNECTOR_TOKEN.

app.get('/v1/admin/overview', auth, adminOnly, async (_req, res) => {
  const [tenants, connections] = await Promise.all([listTenantsWithStats(), Promise.resolve(listConnections())]);
  const connectionByChannel = new Map(connections.map((c) => [c.channelAccountId, c]));

  const overview = tenants.map((tenant) => {
    const channelConnections = tenant.channelAccountIds.map((channelAccountId) => ({
      ...(connectionByChannel.get(channelAccountId) ?? { status: 'sem_conexao', hasQr: false }),
      channelAccountId,
    }));

    const hasIssue =
      tenant.uncertainOutbound > 0 ||
      tenant.pendingHandoff > 3 ||
      channelConnections.some((c) => c.status !== 'connected');

    return { ...tenant, connections: channelConnections, hasIssue };
  });

  res.json({
    generated_at: new Date().toISOString(),
    tenants_total: overview.length,
    tenants_with_issue: overview.filter((t) => t.hasIssue).length,
    tenants: overview,
  });
});

app.get('/v1/admin/painel', (_req, res) => {
  const html = `<!doctype html>
    <html lang="pt-br">
      <head>
        <meta charset="utf-8" />
        <title>Painel interno JCS — Conversador</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; background: #f4f6fb; color: #18202d; }
          table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; }
          th, td { padding: 10px 12px; border-bottom: 1px solid #e4e8f0; text-align: left; font-size: 14px; }
          th { background: #eef1f8; }
          .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; color: #fff; }
          .ok { background: #2e9e5b; }
          .warn { background: #d97706; }
          .bad { background: #d63535; }
          .muted { color: #7a8296; }
          .summary { margin-bottom: 16px; font-size: 15px; }
        </style>
      </head>
      <body>
        <h1>Painel interno JCS — Conversador</h1>
        <div class="summary" id="summary">carregando...</div>
        <table id="table">
          <thead>
            <tr>
              <th>Negócio</th>
              <th>Canal(is)</th>
              <th>Conexão WhatsApp</th>
              <th>Modo</th>
              <th>Mensagens recebidas</th>
              <th>Respostas geradas</th>
              <th>Escalonados pendentes</th>
              <th>Falhas de envio</th>
              <th>Última mensagem</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <script>
          const token = sessionStorage.getItem('admin_token') || prompt('Token administrativo') || '';
          if (token) sessionStorage.setItem('admin_token', token);
          async function load() {
            const r = await fetch('/v1/admin/overview', { headers: { Authorization: 'Bearer ' + token } });
            const data = await r.json();
            document.getElementById('summary').textContent =
              data.tenants_total + ' negócio(s) no total — ' + data.tenants_with_issue + ' com possível problema.';
            const statusBadge = (s) => {
              if (s === 'connected') return '<span class="badge ok">conectado</span>';
              if (s === 'qr_pending') return '<span class="badge warn">aguardando QR</span>';
              if (s === 'connecting') return '<span class="badge warn">conectando</span>';
              if (s === 'sem_conexao') return '<span class="muted">sem conector iniciado</span>';
              return '<span class="badge bad">desconectado</span>';
            };
            const tbody = document.querySelector('#table tbody');
            tbody.innerHTML = data.tenants.map((t) => \`
              <tr style="\${t.hasIssue ? 'background:#fff4f0' : ''}">
                <td><strong>\${t.name}</strong><br/><span class="muted">\${t.slug}</span></td>
                <td>\${t.channelAccountIds.join(', ') || '—'}</td>
                <td>\${t.connections.map((c) => statusBadge(c.status)).join(' ') || '<span class="muted">nenhum</span>'}</td>
                <td>\${t.pilotMode ? 'piloto (coorte restrita)' : 'aberto (produção)'}</td>
                <td>\${t.inboundTotal}</td>
                <td>\${t.outboundTotal}</td>
                <td>\${t.pendingHandoff > 3 ? '<span class="badge bad">' + t.pendingHandoff + '</span>' : t.pendingHandoff}</td>
                <td>\${t.uncertainOutbound > 0 ? '<span class="badge bad">' + t.uncertainOutbound + '</span>' : '0'}</td>
                <td>\${t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString('pt-BR') : '<span class="muted">nunca</span>'}</td>
              </tr>
            \`).join('');
          }
          load();
          setInterval(load, 10000);
        </script>
      </body>
    </html>`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(html);
});

app.post('/v1/messages', auth, requireScope('messages:write'), async (req, res) => {
  const payload = req.body as IncomingMessagePayload;
  if (!payload || payload.schema_version !== '1' || !payload.message_id || !payload.channel_account_id || !payload.sender_id || !payload.text) {
    return res.status(400).json({ error: 'Payload inválido para contrato de entrada.' });
  }

  const tenant = await authorizedTenant(req, res, payload.channel_account_id);
  if (!tenant) return;

  const result = await processIncomingMessage(cfg, payload);

  if (result.kind === 'no_tenant') {
    return res.status(202).json({
      pilot: false,
      note: 'Canal sem tenant cadastrado (tenant_channels); mensagem não registrada.',
    });
  }

  const base = {
    receipt_id: result.receiptId,
    message_id: result.messageId,
    status: result.status,
    duplicate: result.duplicate,
    trace_id: result.traceId,
  };

  switch (result.kind) {
    case 'not_in_pilot':
      return res.status(202).json({ ...base, pilot: false, note: 'Mensagem registrada em observação; sem resposta automática.' });
    case 'duplicate':
      return res.status(202).json({ ...base, pilot: true, note: 'Mensagem duplicada; sem nova resposta automática.' });
    case 'escalated':
      return res.status(202).json({
        ...base,
        pilot: true,
        escalated: true,
        note: 'Conversa já encaminhada para atendimento humano; sem nova resposta automática até liberação (/v1/handoff/resolve).',
      });
    case 'answered':
      return res.status(202).json({
        ...base,
        pilot: true,
        delivery_id: result.outbound.deliveryId,
        pending: result.outbound.status,
      });
  }
});

app.get('/v1/observacao', auth, requireScope('observability:read'), async (req, res) => {
  const tenantId = tenantIdOf(principalOf(req));
  const paid = validatePaidConfig(cfg);
  res.json({
    mode: 'piloto-limited',
    allow_send: false,
    allow_paid_llm: cfg.allowPaidLLM,
    paid_enabled_effective: paid.ok,
    paid_config_error: paid.reason ?? null,
    llm_provider: cfg.llmProvider || null,
    llm_model: cfg.llmModel || null,
    pending_outbound: await outboundPendingCount(tenantId),
  });
});

app.get('/v1/observacao/work', auth, requireScope('observability:read'), async (req, res) => {
  const tenantId = tenantIdOf(principalOf(req));
  res.json({
    outbox: await allOutbound(tenantId),
  });
});

app.get('/v1/observacao/state', auth, requireScope('observability:read'), async (req, res) => {
  const tenantId = tenantIdOf(principalOf(req));
  const outbox = await allOutbound(tenantId);
  const sourceDistribution = outbox.reduce<Record<string, number>>((acc, item) => {
    const key = item.source;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    storage: 'postgres',
    inbound_total: await inboundCount(tenantId),
    outbound_total: await outboundCount(tenantId),
    pending_outbound: await outboundPendingCount(tenantId),
    pending_handoff: (await listEscalated(tenantId)).length,
    source_distribution: sourceDistribution,
    allow_send: false,
  });
});

app.post('/v1/observacao/state/reset', auth, requireScope('observability:reset'), async (req, res) => {
  const tenantId = tenantIdOf(principalOf(req));
  await resetWork(tenantId);
  await resetOutbound(tenantId);
  await resetEscalations(tenantId);
  res.json({
    ok: true,
    action: tenantId ? 'estado do tenant em inbound/outbox/handoff limpo' : 'estado global de inbound/outbox/handoff limpo',
    storage: 'postgres',
  });
});

app.post('/v1/outbound/claim', auth, requireScope('outbound:write'), async (req, res) => {
  const tenantId = tenantIdOf(principalOf(req));
  const row = await claimOutbound(15, tenantId);
  if (!row) {
    return res.status(204).send();
  }
  return res.json({
    delivery_id: row.deliveryId,
    claim_token: row.claimToken,
    receipt_id: row.receiptId,
    channel_account_id: row.channelAccountId,
    sender_id: row.senderId,
    response: row.responseText,
    source: row.source,
    source_version: row.sourceVersion,
    status: row.status,
  });
});

app.post('/v1/outbound/:delivery_id/result', auth, requireScope('outbound:write'), async (req, res) => {
  const deliveryId = String(req.params.delivery_id || '').trim();
  const payload = req.body || {};
  const claimToken = String(payload.claim_token || '').trim();
  const success = payload.ok === true;
  const reason = payload.reason;

  const result = await markDispatched(deliveryId, claimToken, success, reason, tenantIdOf(principalOf(req)));
  if (!result.ok) {
    const statusCode = result.reason === 'not_found' ? 404 : 409;
    return res.status(statusCode).json({ error: result.reason });
  }

  return res.json({
    delivery_id: result.item.deliveryId,
    status: result.item.status,
  });
});

app.post('/v1/handoff', auth, requireScope('handoff:write'), async (req, res) => {
  const body = req.body || {};
  const senderId = String(body.sender_id || '').trim();
  const channelAccountId = String(body.channel_account_id || '').trim();
  const reason = String(body.reason || 'atendente assumiu a conversa manualmente');
  if (!senderId || !channelAccountId) {
    return res.status(400).json({ error: 'sender_id e channel_account_id são obrigatórios.' });
  }
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  await pauseBySender(tenant.id, channelAccountId, senderId);
  await escalateSender(tenant.id, channelAccountId, senderId, reason);
  return res.json({
    ok: true,
    sender_id: senderId,
    channel_account_id: channelAccountId,
    action: 'respostas pendentes canceladas; conversa encaminhada para atendimento humano',
  });
});

app.get('/v1/handoff/pending', auth, requireScope('handoff:read'), async (req, res) => {
  const principal = principalOf(req);
  res.json({ pending: await listEscalated(principal.kind === 'integration' ? principal.tenantId : undefined) });
});

app.post('/v1/handoff/resolve', auth, requireScope('handoff:write'), async (req, res) => {
  const body = req.body || {};
  const senderId = String(body.sender_id || '').trim();
  const channelAccountId = String(body.channel_account_id || '').trim();
  if (!senderId || !channelAccountId) {
    return res.status(400).json({ error: 'sender_id e channel_account_id são obrigatórios.' });
  }
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  const resolved = await resolveSender(tenant.id, channelAccountId, senderId);
  return res.json({ ok: true, resolved, sender_id: senderId, channel_account_id: channelAccountId });
});

// Configuração de piloto por tenant: por padrão (pilot_mode=false) um tenant atende
// qualquer remetente do próprio WhatsApp. Ativar o piloto restringe a resposta automática
// a uma lista de remetentes autorizados — útil para testar com poucos clientes reais antes
// de abrir para todo mundo.

app.post('/v1/tenants/:channel_account_id/pilot-mode', auth, requireScope('config:write'), async (req, res) => {
  const channelAccountId = routeParam(req, 'channel_account_id');
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  const enabled = Boolean((req.body || {}).enabled);
  await setTenantPilotMode(tenant.id, enabled);
  return res.json({ ok: true, channel_account_id: channelAccountId, pilot_mode: enabled });
});

app.get('/v1/tenants/:channel_account_id/pilot-senders', auth, requireScope('config:read'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  return res.json({ pilot_mode: tenant.pilotMode, senders: await listPilotSenders(tenant.id) });
});

app.post('/v1/tenants/:channel_account_id/pilot-senders', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const senderId = String((req.body || {}).sender_id || '').trim();
  if (!senderId) {
    return res.status(400).json({ error: 'sender_id é obrigatório.' });
  }
  await addPilotSender(tenant.id, senderId);
  return res.status(201).json({ ok: true, sender_id: senderId });
});

app.delete('/v1/tenants/:channel_account_id/pilot-senders/:sender_id', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const removed = await removePilotSender(tenant.id, routeParam(req, 'sender_id'));
  return res.json({ ok: true, removed });
});

// FAQ por tenant: é assim que se configura o que o bot responde para cada cliente,
// sem programar. Só entradas com status "aprovado" entram no matching de respostas.

app.get('/v1/tenants/:channel_account_id/faq', auth, requireScope('config:read'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  return res.json({ entries: await listFaqEntries(tenant.id) });
});

app.post('/v1/tenants/:channel_account_id/faq', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const body = req.body || {};
  const question = String(body.question || '').trim();
  const answer = String(body.answer || '').trim();
  if (!question || !answer) {
    return res.status(400).json({ error: 'question e answer são obrigatórios.' });
  }
  const entry = await createFaqEntry(tenant.id, {
    question,
    answer,
    theme: body.theme,
    approvedBy: body.approved_by,
    status: body.status === 'rascunho' ? 'rascunho' : 'aprovado',
  });
  return res.status(201).json({ entry });
});

app.patch('/v1/tenants/:channel_account_id/faq/:faq_id', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const body = req.body || {};
  const entry = await updateFaqEntry(tenant.id, routeParam(req, 'faq_id'), {
    theme: body.theme,
    question: body.question,
    answer: body.answer,
    approvedBy: body.approved_by,
    status: body.status === 'rascunho' || body.status === 'aprovado' ? body.status : undefined,
  });
  if (!entry) {
    return res.status(404).json({ error: 'Entrada de FAQ não encontrada para esse tenant.' });
  }
  return res.json({ entry });
});

app.delete('/v1/tenants/:channel_account_id/faq/:faq_id', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const removed = await deleteFaqEntry(tenant.id, routeParam(req, 'faq_id'));
  return res.json({ ok: true, removed });
});

// Recursos genéricos por tenant: link/lista/texto acionado por palavra-gatilho. É o que
// permite, por exemplo, um cardápio online (link) para um PetShop ou uma lista de
// especialidades disponíveis para o Cuida, sem precisar de código novo por tipo de negócio.

app.get('/v1/tenants/:channel_account_id/resources', auth, requireScope('config:read'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  return res.json({ resources: await listResources(tenant.id) });
});

app.post('/v1/tenants/:channel_account_id/resources', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const body = req.body || {};
  const key = String(body.key || '').trim();
  const label = String(body.label || '').trim();
  const kind = body.kind;
  const triggerKeywords = Array.isArray(body.trigger_keywords) ? body.trigger_keywords.map(String) : [];

  if (!key || !label || !['link', 'list', 'text'].includes(kind) || triggerKeywords.length === 0) {
    return res.status(400).json({
      error: 'key, label, kind (link|list|text) e trigger_keywords (lista não vazia) são obrigatórios.',
    });
  }
  if ((kind === 'link' || kind === 'text') && !body.value_text) {
    return res.status(400).json({ error: 'value_text é obrigatório para kind=link ou kind=text.' });
  }
  if (kind === 'list' && (!Array.isArray(body.value_list) || body.value_list.length === 0)) {
    return res.status(400).json({ error: 'value_list (lista não vazia) é obrigatório para kind=list.' });
  }

  const resource = await createResource(tenant.id, {
    key,
    label,
    kind,
    valueText: body.value_text,
    valueList: Array.isArray(body.value_list) ? body.value_list.map(String) : undefined,
    triggerKeywords,
  });
  return res.status(201).json({ resource });
});

app.patch('/v1/tenants/:channel_account_id/resources/:resource_id', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const body = req.body || {};
  const resource = await updateResource(tenant.id, routeParam(req, 'resource_id'), {
    label: body.label,
    kind: body.kind,
    valueText: body.value_text,
    valueList: Array.isArray(body.value_list) ? body.value_list.map(String) : undefined,
    triggerKeywords: Array.isArray(body.trigger_keywords) ? body.trigger_keywords.map(String) : undefined,
  });
  if (!resource) {
    return res.status(404).json({ error: 'Recurso não encontrado para esse tenant.' });
  }
  return res.json({ resource });
});

app.delete('/v1/tenants/:channel_account_id/resources/:resource_id', auth, requireScope('config:write'), async (req, res) => {
  const tenant = await authorizedTenant(req, res, routeParam(req, 'channel_account_id'));
  if (!tenant) return;
  const removed = await deleteResource(tenant.id, routeParam(req, 'resource_id'));
  return res.json({ ok: true, removed });
});

// Credenciais das integrações clientes. Somente a administração interna pode emitir
// ou revogar tokens. O token em texto puro é devolvido uma única vez na criação.
app.post('/v1/admin/tenants/:channel_account_id/credentials', auth, adminOnly, async (req, res) => {
  const tenant = await resolveTenantByChannel(routeParam(req, 'channel_account_id'));
  if (!tenant) {
    return res.status(404).json({ error: 'Canal sem tenant cadastrado.' });
  }
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const requestedScopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
  if (!name || requestedScopes.length === 0 || !requestedScopes.every(isIntegrationScope)) {
    return res.status(400).json({
      error: 'name e scopes válidos são obrigatórios.',
      allowed_scopes: INTEGRATION_SCOPES,
    });
  }
  const credential = await createIntegrationCredential(
    tenant.id,
    name,
    Array.from(new Set(requestedScopes)) as IntegrationScope[],
  );
  return res.status(201).json({
    credential,
    warning: 'Copie o token agora. Ele não poderá ser consultado novamente.',
  });
});

app.delete('/v1/admin/tenants/:channel_account_id/credentials/:credential_id', auth, adminOnly, async (req, res) => {
  const tenant = await resolveTenantByChannel(routeParam(req, 'channel_account_id'));
  if (!tenant) {
    return res.status(404).json({ error: 'Canal sem tenant cadastrado.' });
  }
  const revoked = await revokeIntegrationCredential(tenant.id, routeParam(req, 'credential_id'));
  return res.json({ ok: true, revoked });
});

// API multi-tenant: cada sistema cliente (PetShop, Mordomê, etc.) chama isso para
// conectar o WhatsApp de UM negócio específico. Uma conexão por channel_account_id,
// todas rodando ao mesmo tempo dentro deste processo.

app.get('/v1/whatsapp/connections', auth, requireScope('whatsapp:read'), (req, res) => {
  const principal = principalOf(req);
  const connections = listConnections().filter((connection) =>
    principal.kind === 'admin' || connection.tenantId === principal.tenantId,
  );
  res.json({ connections });
});

app.post('/v1/whatsapp/connections', auth, adminOnly, async (req, res) => {
  const body = req.body || {};
  const channelAccountId = String(body.channel_account_id || '').trim();
  const tenantSlug = String(body.tenant_slug || '').trim();
  const tenantName = String(body.tenant_name || '').trim();

  if (!channelAccountId || !tenantSlug || !tenantName) {
    return res.status(400).json({ error: 'channel_account_id, tenant_slug e tenant_name são obrigatórios.' });
  }

  await upsertTenantWithChannel(tenantSlug, tenantName, channelAccountId);

  try {
    await startWhatsappConnector(cfg, channelAccountId);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }

  return res.status(202).json({ ok: true, channel_account_id: channelAccountId, status: getConnectionStatus(channelAccountId) });
});

app.get('/v1/whatsapp/connections/:channel_account_id/status', auth, requireScope('whatsapp:read'), async (req, res) => {
  const channelAccountId = routeParam(req, 'channel_account_id');
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  const status = getConnectionStatus(channelAccountId);
  if (!status) {
    return res.status(404).json({ error: 'Nenhuma conexão ativa para esse canal.' });
  }
  res.json(status);
});

app.get('/v1/whatsapp/connections/:channel_account_id/qr', auth, requireScope('whatsapp:read'), async (req, res) => {
  const channelAccountId = routeParam(req, 'channel_account_id');
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  const qr = getConnectionQr(channelAccountId);
  if (!qr) {
    return res.status(404).json({ error: 'Nenhum QR code pendente para esse canal.' });
  }
  const html = `<!doctype html><html><body style="font-family:sans-serif;text-align:center;margin-top:40px">
    <h2>Escaneie com o WhatsApp (Aparelhos conectados)</h2>
    <img src="${qr}" width="320" height="320" />
    <p>Atualize esta página se o QR expirar.</p>
  </body></html>`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(html);
});

app.delete('/v1/whatsapp/connections/:channel_account_id', auth, requireScope('whatsapp:write'), async (req, res) => {
  const channelAccountId = routeParam(req, 'channel_account_id');
  const tenant = await authorizedTenant(req, res, channelAccountId);
  if (!tenant) return;
  const logout = String(req.query.logout || 'false') === 'true';
  const stopped = await stopWhatsappConnector(channelAccountId, logout);
  res.json({ ok: true, stopped, logout });
});

const port = cfg.port;

runMigrations()
  .then(async (applied) => {
    if (applied.length) {
      console.log(`Migrações aplicadas: ${applied.join(', ')}`);
    }
    const host = process.env.HOST || '0.0.0.0';
    app.listen(port, host, () => {
      console.log(`Modo C (piloto limitado) em http://${host}:${port}/v1`);
    });

    await resumeAllWhatsappConnections(cfg);
  })
  .catch((error) => {
    console.error('Falha ao aplicar migrações/subir o servidor:', error);
    process.exit(1);
  });
