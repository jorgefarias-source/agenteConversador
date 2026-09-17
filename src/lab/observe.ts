import express from 'express';
import dotenv from 'dotenv';

import { parseEnv, requireConnectorToken, validatePaidConfig } from '../config/env';
import { acceptIncoming, allWork, IncomingMessagePayload, inboundCount, resetWork } from './inbox';
import { allOutbound, outboundCount, outboundPendingCount, resetOutbound } from './outbox';
import { resolveTenantByChannel } from '../infra/tenants';
import { runMigrations } from '../infra/db';

dotenv.config();
const cfg = parseEnv(process.env);

const app = express();
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization || '';
  const expected = requireConnectorToken(cfg);

  if (!expected) {
    return res.status(401).json({ error: 'AGENT_CONNECTOR_TOKEN ausente no ambiente local de observação.' });
  }

  if (token !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Autorização inválida.' });
  }

  return next();
}

app.post('/v1/messages', auth, async (req, res) => {
  const payload = req.body as IncomingMessagePayload;

  if (!payload || payload.schema_version !== '1' || !payload.message_id || !payload.channel_account_id || !payload.sender_id || !payload.text) {
    return res.status(400).json({ error: 'Payload inválido para contrato de entrada.' });
  }

  const tenant = await resolveTenantByChannel(payload.channel_account_id);
  if (!tenant) {
    return res.status(202).json({ note: 'Canal sem tenant cadastrado; mensagem não registrada.' });
  }

  const result = await acceptIncoming(tenant.id, payload);

  return res.status(202).json({
    receipt_id: result.receiptId,
    message_id: result.messageId,
    status: result.status,
    duplicate: result.duplicate,
    trace_id: result.traceId,
  });
});

app.get('/v1/observacao', async (_req, res) => {
  res.json({
    mode: 'observacao',
    allow_send: false,
    allow_paid_llm: validatePaidConfig(cfg).ok,
    total: (await allWork()).length,
  });
});

app.get('/v1/observacao/work', auth, async (_req, res) => {
  res.json(await allWork());
});

app.get('/v1/observacao/state', auth, async (_req, res) => {
  res.json({
    storage: 'postgres',
    inbound_total: await inboundCount(),
    outbound_total: await outboundCount(),
    pending_outbound: await outboundPendingCount(),
    allow_send: false,
  });
});

app.post('/v1/observacao/state/reset', auth, async (_req, res) => {
  await resetWork();
  await resetOutbound();
  res.json({ ok: true, action: 'estado de inbound/outbox limpo', storage: 'postgres' });
});

const port = cfg.port;

runMigrations().then(() => {
  app.listen(port, '127.0.0.1', () => {
    console.log(`Observacao ativa em http://127.0.0.1:${port}/v1`);
    console.log('Modo B: recebimento persistido simulado + envio bloqueado.');
  });
});
