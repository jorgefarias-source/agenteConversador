import assert from 'node:assert/strict';
import test from 'node:test';

import { findByQuestion } from './faq-sample';
import { principalCanAccessTenant, principalHasScope } from '../infra/integration-auth';

test('FAQ local responde quando há similaridade', () => {
  const hit = findByQuestion('Vocês fazem entrega?');
  assert.equal(hit?.id, 'FAQ-001');
});

test('FAQ local retorna sem match', () => {
  const hit = findByQuestion('Como faço reembolso?');
  assert.equal(hit, undefined);
});

test('credencial de integração só acessa o próprio tenant e seus escopos', () => {
  const principal = {
    kind: 'integration' as const,
    credentialId: 'cred-1',
    tenantId: 'tenant-a',
    scopes: ['config:read' as const],
  };

  assert.equal(principalCanAccessTenant(principal, 'tenant-a'), true);
  assert.equal(principalCanAccessTenant(principal, 'tenant-b'), false);
  assert.equal(principalHasScope(principal, 'config:read'), true);
  assert.equal(principalHasScope(principal, 'config:write'), false);
});

test('credencial administrativa tem acesso global', () => {
  const principal = { kind: 'admin' as const };
  assert.equal(principalCanAccessTenant(principal, 'qualquer-tenant'), true);
  assert.equal(principalHasScope(principal, 'whatsapp:write'), true);
});
