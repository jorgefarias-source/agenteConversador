import http from 'node:http';

type MessageRecord = {
  message_id: string;
  sender_id: string;
  channel_account_id: string;
  text: string;
};

const token = process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local';
const baseHost = 'http://127.0.0.1:3002';

function requestJson(method: 'POST' | 'GET', path: string, body?: unknown): Promise<any> {
  const fullUrl = `${baseHost}${path}`;
  const options: any = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (method === 'POST') {
    const payload = JSON.stringify(body ?? {});
    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = Buffer.byteLength(payload);

    return new Promise((resolve, reject) => {
      const req = http.request(fullUrl, options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw || '{}'));
          } catch {
            resolve({ text: raw, statusCode: res.statusCode });
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  return new Promise((resolve, reject) => {
    const req = http.get(fullUrl, options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch {
          resolve({ text: raw, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const scenarios: MessageRecord[] = [
    {
      message_id: 'audit-pilot-1',
      sender_id: 'remetente-demo-A',
      channel_account_id: 'canal-demo',
      text: 'Posso retirar no balcão?',
    },
    {
      message_id: 'audit-pilot-2',
      sender_id: 'remetente-demo-NOT-IN',
      channel_account_id: 'canal-demo',
      text: 'Vocês fazem entrega?',
    },
  ];

  const first = scenarios[0];
  const firstPayload = {
    schema_version: '1' as const,
    message_id: first.message_id,
    channel_account_id: first.channel_account_id,
    sender_id: first.sender_id,
    sent_at: '2026-09-14T12:00:00Z',
    type: 'text' as const,
    text: first.text,
  };
  const p1 = await requestJson('POST', '/v1/messages', firstPayload);
  const duplicate = await requestJson('POST', '/v1/messages', firstPayload);

  const second = scenarios[1];
  const p2 = await requestJson('POST', '/v1/messages', {
    schema_version: '1',
    message_id: second.message_id,
    channel_account_id: second.channel_account_id,
    sender_id: second.sender_id,
    sent_at: '2026-09-14T12:00:01Z',
    type: 'text',
    text: second.text,
  });

  const claim = await requestJson('POST', '/v1/outbound/claim', {});
  const claim2 = await requestJson('POST', '/v1/outbound/claim', {});

  let statusUpdated = false;
  if (claim.delivery_id) {
    const result = await requestJson('POST', `/v1/outbound/${claim.delivery_id}/result`, { ok: true });
    statusUpdated = result.status === 'dispatched';
  }

  const work = await requestJson('GET', '/v1/observacao/work', undefined);

  const checks = [
    { name: 'coorte_autorizada_gera_outbound', pass: !!p1.delivery_id, detail: p1 },
    { name: 'coorte_nao_autorizada_nao_dispara', pass: p2.pilot === false, detail: p2 },
    { name: 'deduplicacao', pass: duplicate.duplicate === true && duplicate.receipt_id === p1.receipt_id, detail: { p1, duplicate } },
    { name: 'claim_e_resultado', pass: !!claim.delivery_id && claim2.status === undefined && statusUpdated, detail: { claim, claim2, statusUpdated } },
  ];

  const passed = checks.every((item) => item.pass);
  const result = {
    passed,
    timestamp: new Date().toISOString(),
    checks,
    work,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!passed) {
    process.exitCode = 1;
  }
}

await main();
