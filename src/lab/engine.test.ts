import assert from 'node:assert/strict';
import test from 'node:test';

import { findByQuestion } from './faq-sample';

test('FAQ local responde quando há similaridade', () => {
  const hit = findByQuestion('Vocês fazem entrega?');
  assert.equal(hit?.id, 'FAQ-001');
});

test('FAQ local retorna sem match', () => {
  const hit = findByQuestion('Como faço reembolso?');
  assert.equal(hit, undefined);
});
