import http from 'node:http';

type HttpResult = {
  statusCode: number;
  body: unknown;
};

const token = process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local';
const baseUrl = process.env.PILOT_BASE_URL || 'http://127.0.0.1:3002';
const senderId = process.env.PILOT_E2E_SENDER || 'remetente-demo-A';
const nonCohortSender = `${senderId}-nao-autorizado`;

function requestJson(method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResult> {
  const payload = method === 'POST' ? JSON.stringify(body ?? {}) : '';
  const url = new URL(path, `${baseUrl}/`);

  const options: http.RequestOptions = {
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: Number(url.port),
    path: url.pathname + url.search,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (method === 'POST') {
    (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
    (options.headers as Record<string, string>)['Content-Length'] = String(Buffer.byteLength(payload));
  }

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let parsed = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { text: raw };
          }
        }
        resolve({ statusCode: res.statusCode || 200, body: parsed });
      });
    });
    req.on('error', reject);
    if (method === 'POST') {
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  const stateBefore = await requestJson('GET', '/v1/observacao/state');

  const messageId = `e2e-${Date.now()}`;
  const nonCohortMessageId = `e2e-nc-${Date.now()}`;
  const orderMessageId = `e2e-order-${Date.now()}`;

  const inbound = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: messageId,
    channel_account_id: 'canal-demo',
    sender_id: senderId,
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'cardapio',
  });

  const stateAfterAllowed = await requestJson('GET', '/v1/observacao/state');

  const nonCohortInbound = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: nonCohortMessageId,
    channel_account_id: 'canal-demo',
    sender_id: nonCohortSender,
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'cardapio',
  });

  const orderInbound = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: orderMessageId,
    channel_account_id: 'canal-demo',
    sender_id: senderId,
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'status do pedido PED-1001',
  });

  const stateAfterNonCohort = await requestJson('GET', '/v1/observacao/state');

  const claim = await requestJson('POST', '/v1/outbound/claim');
  const claimBody = claim.body as Record<string, unknown>;

  let result: HttpResult = { statusCode: 204, body: {} };
  if (claimBody && claimBody.delivery_id) {
    result = await requestJson('POST', `/v1/outbound/${String(claimBody.delivery_id)}/result`, {
      ok: true,
      reason: 'e2e local',
      claim_token: claimBody.claim_token,
    });
  }

  const work = await requestJson('GET', '/v1/observacao/work');

  const hasDelivery = !!(claimBody && claimBody.delivery_id);
  const claimBodyText = (claim.body as Record<string, unknown> | undefined)?.response;
  const claimText = typeof claimBodyText === 'string' ? String(claimBodyText).toLowerCase() : '';
  const cardapioOk = claimText.includes('cardapio') || claimText.includes('cardapio');

  const inboundBody = inbound.body as Record<string, unknown> | undefined;
  const nonCohortBody = nonCohortInbound.body as Record<string, unknown> | undefined;
  const orderBody = orderInbound.body as Record<string, unknown> | undefined;
  const stateBeforeBody = stateBefore.body as Record<string, unknown> | undefined;
  const stateAfterAllowedBody = stateAfterAllowed.body as Record<string, unknown> | undefined;
  const stateAfterNonCohortBody = stateAfterNonCohort.body as Record<string, unknown> | undefined;

  const outboundBefore = Number(stateBeforeBody?.outbound_total ?? 0);
  const outboundAfterAllowed = Number(stateAfterAllowedBody?.outbound_total ?? 0);
  const outboundAfterNonCohort = Number(stateAfterNonCohortBody?.outbound_total ?? 0);

  const outbox = ((work.body as Record<string, unknown> | undefined)?.outbox as Array<Record<string, unknown>> | undefined) || [];
  const hasPedidoOutbound = outbox.some((item) => item.source_version === 'd1-pedido-v1');

  const allowedFlowOk =
    (inbound.statusCode === 202 || inbound.statusCode === 200) &&
    inboundBody?.pilot === true &&
    inboundBody?.delivery_id !== undefined &&
    cardapioOk &&
    outboundAfterAllowed === outboundBefore + 2;

  const orderFlowOk =
    (orderInbound.statusCode === 202 || orderInbound.statusCode === 200) &&
    orderBody?.pilot === true &&
    orderBody?.delivery_id !== undefined &&
    orderBody?.source_version === 'd1-pedido-v1' &&
    hasPedidoOutbound;

  const nonCohortFlowOk =
    (nonCohortInbound.statusCode === 202 || nonCohortInbound.statusCode === 200) &&
    nonCohortBody?.pilot === false &&
    nonCohortBody?.delivery_id === undefined &&
    outboundAfterNonCohort === outboundAfterAllowed;

  const resultOk = (result.body as Record<string, unknown> | undefined)?.status === 'dispatched';

  const ok = hasDelivery && allowedFlowOk && orderFlowOk && nonCohortFlowOk && resultOk;

  console.log(
    JSON.stringify(
      {
        inbound,
        stateBefore,
        stateAfterAllowed,
        nonCohortInbound,
        orderInbound,
        stateAfterNonCohort,
        claim,
        result,
        hasDelivery,
        allowedFlowOk,
        orderFlowOk,
        nonCohortFlowOk,
        cardapioOk,
        work,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
