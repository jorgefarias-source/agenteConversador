import http from 'node:http';

type ClaimResponse = {
  delivery_id?: string;
  receipt_id?: string;
  response?: string;
  source?: string;
  source_version?: string;
  status?: string;
};

type RequestResult = {
  statusCode: number;
  body: unknown;
};

const token = process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local';
const baseUrl = process.env.PILOT_BASE_URL || 'http://127.0.0.1:3002';
const maxClaims = Number(process.env.PILOT_WORKER_MAX_CLAIMS || '20');
const delayMs = Number(process.env.PILOT_WORKER_INTERVAL_MS || '1200');

function requestJson(method: 'POST' | 'GET', path: string, body?: unknown): Promise<RequestResult> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let processed = 0;
  let emptyRounds = 0;

  for (let i = 0; i < maxClaims; i += 1) {
    const claimResp = await requestJson('POST', '/v1/outbound/claim');

    if (claimResp.statusCode === 204) {
      emptyRounds += 1;
      if (emptyRounds >= 2) {
        console.log(`sem mensagens pendentes após ${emptyRounds} rodada(s). encerrando.`);
        break;
      }
      await sleep(delayMs);
      continue;
    }

    emptyRounds = 0;
    const claim = claimResp.body as ClaimResponse;
    if (!claim?.delivery_id) {
      console.error('claim inválido', claimResp.body);
      continue;
    }

    const result = await requestJson('POST', `/v1/outbound/${claim.delivery_id}/result`, {
      ok: true,
      reason: 'enviado por worker local de laboratório',
    });

    processed += 1;
    console.log(
      JSON.stringify(
        {
          ok: result.statusCode === 200,
          delivery_id: claim.delivery_id,
          response: claim.response,
          posted_status: (result.body as Record<string, unknown>)?.status,
        },
        null,
        2,
      ),
    );

    await sleep(delayMs);
  }

  if (processed > 0) {
    console.log(`finalizado: ${processed} mensagem(ns) processada(s)`);
  }
}

await main();

