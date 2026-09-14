import dotenv from 'dotenv';
import express from 'express';

import { parseEnv, requireConnectorToken, validatePaidConfig } from '../config/env';
import { acceptIncoming, IncomingMessagePayload } from './inbox';
import { answerFromFaq, faqByBusiness } from '../features/faq';
import { allOutbound, claimOutbound, enqueueOutbound, markDispatched, pauseBySender } from './outbox';

dotenv.config();
const cfg = parseEnv(process.env);

const app = express();
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = requireConnectorToken(cfg);
  if (!expected) {
    return res.status(401).json({ error: 'AGENT_CONNECTOR_TOKEN ausente no ambiente.' });
  }

  if ((req.headers.authorization || '') !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Autorização inválida.' });
  }

  return next();
}

app.post('/v1/messages', auth, (req, res) => {
  const payload = req.body as IncomingMessagePayload;
  if (!payload || payload.schema_version !== '1' || !payload.message_id || !payload.channel_account_id || !payload.sender_id || !payload.text) {
    return res.status(400).json({ error: 'Payload inválido para contrato de entrada.' });
  }

  const work = acceptIncoming(payload);
  const pilotAllowed = cfg.allowPilotSenders.has(payload.sender_id);

  if (!pilotAllowed) {
    return res.status(202).json({
      receipt_id: work.receiptId,
      message_id: work.messageId,
      status: work.status,
      duplicate: work.duplicate,
      trace_id: work.traceId,
      pilot: false,
      note: 'Mensagem registrada em observação; sem resposta automática.',
    });
  }

  if (work.status === 'duplicate') {
    return res.status(202).json({
      receipt_id: work.receiptId,
      message_id: work.messageId,
      status: work.status,
      duplicate: work.duplicate,
      trace_id: work.traceId,
      pilot: true,
      note: 'Mensagem duplicada; sem nova resposta automática.',
    });
  }

  const faq = faqByBusiness('ponto-do-recheio');
  const faqMatch = answerFromFaq(faq, payload.text);
  const responseText = faqMatch
    ? `${faqMatch.answer}\n\n[Fonte: ${faq.version}]`
    : 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.';

  const outbound = enqueueOutbound({
    receiptId: work.receiptId,
    messageId: payload.message_id,
    channelAccountId: payload.channel_account_id,
    senderId: payload.sender_id,
    responseText,
    source: faqMatch ? 'faq-matched' : 'fallback-human',
    sourceVersion: faq.version,
  });

  return res.status(202).json({
    receipt_id: work.receiptId,
    message_id: work.messageId,
    status: work.status,
    duplicate: work.duplicate,
    trace_id: work.traceId,
    pilot: true,
    delivery_id: outbound.deliveryId,
    pending: outbound.status,
  });
});

app.get('/v1/observacao', (_req, res) => {
  res.json({
    mode: 'piloto-limited',
    allow_send: false,
    allow_paid_llm: validatePaidConfig(cfg).ok,
    allowed_sender_count: cfg.allowPilotSenders.size,
    pending_outbound: allOutbound().filter((row) => row.status === 'pending').length,
  });
});

app.get('/v1/observacao/work', (_req, res) => {
  res.json({
    outbox: allOutbound(),
  });
});

app.post('/v1/outbound/claim', (_req, res) => {
  const row = claimOutbound(15);
  if (!row) {
    return res.status(204).send();
  }
  return res.json({
    delivery_id: row.deliveryId,
    receipt_id: row.receiptId,
    channel_account_id: row.channelAccountId,
    sender_id: row.senderId,
    response: row.responseText,
    source: row.source,
    source_version: row.sourceVersion,
    status: row.status,
  });
});

app.post('/v1/outbound/:delivery_id/result', (req, res) => {
  const deliveryId = String(req.params.delivery_id || '').trim();
  const payload = req.body || {};
  const success = payload.ok === true;
  const reason = payload.reason;

  const updated = markDispatched(deliveryId, success, reason);
  if (!updated) {
    return res.status(404).json({ error: 'delivery_id nao encontrado.' });
  }

  return res.json({
    delivery_id: updated.deliveryId,
    status: updated.status,
  });
});

app.post('/v1/handoff', (req, res) => {
  const body = req.body || {};
  const senderId = String(body.sender_id || '').trim();
  if (!senderId) {
    return res.status(400).json({ error: 'sender_id obrigatório.' });
  }
  pauseBySender(senderId);
  return res.json({ ok: true, sender_id: senderId, action: 'respostas pendentes canceladas' });
});

const port = cfg.port;
app.listen(port, '127.0.0.1', () => {
  console.log(`Modo C (piloto limitado) em http://127.0.0.1:${port}/v1`);
});
