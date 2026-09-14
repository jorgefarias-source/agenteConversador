import http from 'node:http';

type HttpResult = {
  statusCode: number;
  body: unknown;
};

const token = process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local';
const baseUrl = process.env.OBSERVE_BASE_URL || 'http://127.0.0.1:3002';

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
  const messageId = `obs-${Date.now()}`;
  const inbound = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: messageId,
    channel_account_id: 'canal-demo',
    sender_id: 'remetente-demo-b',
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'Vocês aceitam entrega?',
  });

  const duplicate = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: messageId,
    channel_account_id: 'canal-demo',
    sender_id: 'remetente-demo-b',
    sent_at: new Date().toISOString(),
    type: 'text',
    text: 'Vocês aceitam entrega?',
  });

  const work = await requestJson('GET', '/v1/observacao/work');
  const state = await requestJson('GET', '/v1/observacao/state');

  const inboundBody = inbound.body as Record<string, unknown>;
  const duplicateBody = duplicate.body as Record<string, unknown>;
  const workBody = work.body as { outbox?: Array<unknown> };
  const stateBody = state.body as Record<string, unknown>;

  const ok =
    inbound.statusCode === 202 &&
    duplicate.statusCode === 202 &&
    inboundBody.duplicate === false &&
    duplicateBody.duplicate === true &&
    inboundBody.receipt_id === duplicateBody.receipt_id &&
    (!workBody.outbox || workBody.outbox.length === 0) &&
    stateBody.allow_send === false;

  console.log(
    JSON.stringify(
      {
        inbound,
        duplicate,
        work,
        state,
        ok,
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

