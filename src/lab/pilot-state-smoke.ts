import { randomUUID } from 'node:crypto';

type Json = Record<string, unknown>;

const base = 'http://127.0.0.1:3002';
const token = process.env.AGENT_CONNECTOR_TOKEN || 'token_teste_local';

async function req(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Json) : {};
  return { status: response.status, body };
}

function check(condition: boolean, message: string, details: Json = {}) {
  return {
    pass: condition,
    message,
    details,
  };
}

const run = async () => {
  const checks: ReturnType<typeof check>[] = [];
  await req('/v1/observacao/state/reset', { method: 'POST' });

  const messageId = `persist-${randomUUID()}`;
  const incoming = await req('/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: '1',
      message_id: messageId,
      channel_account_id: 'canal-demo',
      sender_id: 'remetente-demo-A',
      sent_at: new Date().toISOString(),
      type: 'text',
      text: 'Qual o horario de atendimento?',
    }),
  });

  const afterPost = await req('/v1/observacao/state');
  const state = afterPost.body as { inbound_total?: number; outbound_total?: number; pending_outbound?: number; state_file?: string };

  checks.push(check(incoming.status === 202, 'messages endpoint respondeu', { status: incoming.status, body: incoming.body }));
  checks.push(check((state.inbound_total ?? 0) > 0, 'inbound persistido no estado', state));
  checks.push(check((state.outbound_total ?? 0) > 0, 'outbound persistido no estado', state));
  checks.push(check((state.state_file || '').endsWith('lab-state.json'), 'caminho do estado correto', { state_file: state.state_file }));

  const claim = await req('/v1/outbound/claim', { method: 'POST' });
  const claimed = claim.body as { delivery_id?: string };
  if (claimed.delivery_id) {
    await req(`/v1/outbound/${claimed.delivery_id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
  }

  const afterReset = await req('/v1/observacao/state/reset', { method: 'POST' });
  const resetBody = afterReset.body as { state_file?: string };
  const afterResetState = await req('/v1/observacao/state');
  const stateAfter = afterResetState.body as { inbound_total?: number; outbound_total?: number };

  checks.push(check((stateAfter.inbound_total ?? 1) === 0, 'reset retornou inbound limpo', stateAfter));
  checks.push(check((stateAfter.outbound_total ?? 1) === 0, 'reset retornou outbound limpo', stateAfter));
  checks.push(check((resetBody.state_file || '').endsWith('lab-state.json'), 'reset confirmou state file', resetBody));

  const result = {
    passed: checks.every((c) => c.pass),
    timestamp: new Date().toISOString(),
    checks,
    state_file: state.state_file,
  };

  console.log(JSON.stringify(result, null, 2));
};

await run();
