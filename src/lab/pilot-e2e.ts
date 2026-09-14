import http from 'node:http';

type HttpResult = {
  statusCode: number;
  body: unknown;
};

const token = process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local';
const baseUrl = process.env.PILOT_BASE_URL || 'http://127.0.0.1:3002';
const senderId = process.env.PILOT_E2E_SENDER || 'remetente-demo-A';

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
  const messageId = `e2e-${Date.now()}`;

  const inbound = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: messageId,
    channel_account_id: 'canal-demo',
    sender_id: senderId,
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'cardápio',
  });

  const claim = await requestJson('POST', '/v1/outbound/claim');
  const claimBody = claim.body as Record<string, unknown>;

  let result: HttpResult = { statusCode: 204, body: {} };
  if (claimBody && claimBody.delivery_id) {
    result = await requestJson('POST', `/v1/outbound/${String(claimBody.delivery_id)}/result`, {
      ok: true,
      reason: 'e2e local',
    });
  }

  const work = await requestJson('GET', '/v1/observacao/work');

  const hasDelivery = !!(claimBody && claimBody.delivery_id);
  const claimBodyText = (claim.body as Record<string, unknown> | undefined)?.response;
  const cardapioOk =
    typeof claimBodyText === 'string' &&
    claimBodyText.toLowerCase().includes('cardápio');

  const ok =
    (inbound.statusCode === 202 || inbound.statusCode === 200) &&
    hasDelivery &&
    (result.body as Record<string, unknown> | undefined)?.status === 'dispatched' &&
    cardapioOk;

  console.log(
    JSON.stringify(
      {
        inbound,
        claim,
        result,
        hasDelivery,
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
