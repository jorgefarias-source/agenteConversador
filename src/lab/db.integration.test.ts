import assert from 'node:assert/strict';
import test from 'node:test';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local', override: false });

if (!process.env.DATABASE_URL) {
  test('testes de integração com Postgres pulados (DATABASE_URL ausente)', () => {
    console.log('DATABASE_URL não definida; pulando testes de integração com o banco.');
  });
} else {
  const { runMigrations, query, closePool } = await import('../infra/db');
  const { upsertTenantWithChannel } = await import('../infra/tenants');
  const { acceptIncoming, purgeExpiredInbound } = await import('./inbox');
  const { enqueueOutbound, claimOutbound, markDispatched, purgeExpiredOutbound } = await import('./outbox');
  const { escalateSender, isEscalated, resolveSender, listEscalated, purgeExpiredEscalations } = await import('./handoff');
  const { seedPontoDoRecheioMenu } = await import('../infra/seed-customer-data');
  const { getMenuForTenant, resolveOrderForCustomer, listCustomerOrders } = await import('./customer-data');

  await runMigrations();

  const suffix = Date.now();
  const channelAccountId = `canal-teste-${suffix}`;
  const tenant = await upsertTenantWithChannel(`tenant-teste-${suffix}`, 'Tenant de Teste', channelAccountId);

  test.after(async () => {
    await query('DELETE FROM escalations WHERE tenant_id = $1', [tenant.id]);
    await query('DELETE FROM outbound_messages WHERE tenant_id = $1', [tenant.id]);
    await query('DELETE FROM inbound_messages WHERE tenant_id = $1', [tenant.id]);
    await query('DELETE FROM tenant_channels WHERE tenant_id = $1', [tenant.id]);
    await query('DELETE FROM tenants WHERE id = $1', [tenant.id]);
    await closePool();
  });

  test('tenant é resolvido a partir do canal cadastrado', async () => {
    const { resolveTenantByChannel } = await import('../infra/tenants');
    const resolved = await resolveTenantByChannel(channelAccountId);
    assert.equal(resolved?.id, tenant.id);
  });

  test('inbound: aceita mensagem nova e detecta duplicata', async () => {
    const payload = {
      schema_version: '1' as const,
      message_id: `msg-${suffix}`,
      channel_account_id: channelAccountId,
      sender_id: 'remetente-teste',
      sent_at: new Date().toISOString(),
      type: 'text' as const,
      text: 'Olá',
    };

    const first = await acceptIncoming(tenant.id, payload);
    assert.equal(first.status, 'accepted');

    const duplicate = await acceptIncoming(tenant.id, payload);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.receiptId, first.receiptId);
  });

  test('outbox: enfileira, reivindica (claim) e marca como despachado', async () => {
    const item = await enqueueOutbound(tenant.id, {
      receiptId: `rec-${suffix}`,
      messageId: `msg-out-${suffix}`,
      channelAccountId,
      senderId: 'remetente-teste',
      responseText: 'Resposta de teste',
      source: 'faq-matched',
      sourceVersion: 'faq-v1',
    });
    assert.equal(item.status, 'pending');

    const claimed = await claimOutbound(15, tenant.id);
    assert.equal(claimed?.deliveryId, item.deliveryId);
    assert.ok(claimed?.claimToken);

    const result = await markDispatched(item.deliveryId, claimed!.claimToken!, true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.item.status, 'dispatched');
    }
  });

  test('outbox: marcar com claim_token errado falha', async () => {
    const item = await enqueueOutbound(tenant.id, {
      receiptId: `rec-b-${suffix}`,
      messageId: `msg-out-b-${suffix}`,
      channelAccountId,
      senderId: 'remetente-teste',
      responseText: 'Outra resposta',
      source: 'faq-matched',
      sourceVersion: 'faq-v1',
    });
    await claimOutbound(15, tenant.id);

    const result = await markDispatched(item.deliveryId, 'token-invalido', true);
    assert.equal(result.ok, false);
  });

  test('handoff: escalar, listar, suprimir e resolver', async () => {
    await escalateSender(tenant.id, channelAccountId, 'remetente-escalado', 'não sei responder');
    assert.equal(await isEscalated(channelAccountId, 'remetente-escalado'), true);

    const pending = await listEscalated();
    assert.ok(pending.some((item) => item.senderId === 'remetente-escalado' && item.channelAccountId === channelAccountId));

    const resolved = await resolveSender(channelAccountId, 'remetente-escalado');
    assert.equal(resolved, true);
    assert.equal(await isEscalated(channelAccountId, 'remetente-escalado'), false);
  });

  test('cardápio/pedidos: seed popula dados e titularidade é respeitada', async () => {
    await seedPontoDoRecheioMenu(tenant.id);

    const menu = await getMenuForTenant(tenant.id);
    assert.ok(menu.length > 0);
    assert.ok(menu.some((item) => item.name === 'X-Burguer'));

    const ownOrder = await resolveOrderForCustomer(tenant.id, 'canal-demo', 'remetente-demo-A', ' ped-1001 ');
    assert.equal(ownOrder?.status, 'Em preparo');
    assert.equal(ownOrder?.totalText, 'R$ 56,80');

    const crossTenantOrder = await resolveOrderForCustomer(tenant.id, 'canal-demo', 'remetente-demo-B', 'PED-1001');
    assert.equal(crossTenantOrder, undefined, 'remetente-demo-B nunca deve acessar pedido de remetente-demo-A');

    const noAccountOrder = await resolveOrderForCustomer(tenant.id, 'canal-demo', 'remetente-sem-cadastro', 'PED-1001');
    assert.equal(noAccountOrder, undefined);

    const ordersA = await listCustomerOrders(tenant.id, 'canal-demo', 'remetente-demo-A');
    assert.equal(ordersA.length, 2);

    const ordersB = await listCustomerOrders(tenant.id, 'canal-demo', 'remetente-demo-B');
    assert.equal(ordersB.length, 1);
    assert.equal(ordersB[0].reference, 'PED-2001');
  });

  test('retenção: expurga inbound/outbound/escalations mais antigos que o prazo configurado', async () => {
    process.env.AGENT_RETENTION_DAYS = '1';

    await query(
      `INSERT INTO inbound_messages (tenant_id, receipt_id, message_id, channel_account_id, sender_id, text, status, trace_id, dedupe_key, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'accepted', $7, $8, now() - interval '2 days')`,
      [tenant.id, `rec-old-${suffix}`, `msg-old-${suffix}`, channelAccountId, 'remetente-antigo', 'mensagem antiga', `trace-${suffix}`, `key-${suffix}`],
    );

    await query(
      `INSERT INTO outbound_messages (tenant_id, delivery_id, receipt_id, message_id, channel_account_id, sender_id, response_text, source, source_version, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'faq-matched', 'faq-v1', 'dispatched', now() - interval '2 days')`,
      [tenant.id, `del-old-${suffix}`, `rec-old2-${suffix}`, `msg-old2-${suffix}`, channelAccountId, 'remetente-antigo', 'resposta antiga'],
    );

    await query(
      `INSERT INTO escalations (tenant_id, channel_account_id, sender_id, reason, escalated_at)
       VALUES ($1, $2, $3, 'motivo antigo', now() - interval '2 days')`,
      [tenant.id, channelAccountId, 'remetente-antigo-escalado'],
    );

    const purgedInbound = await purgeExpiredInbound();
    const purgedOutbound = await purgeExpiredOutbound();
    const purgedEscalations = await purgeExpiredEscalations();

    assert.ok(purgedInbound >= 1);
    assert.ok(purgedOutbound >= 1);
    assert.ok(purgedEscalations >= 1);

    delete process.env.AGENT_RETENTION_DAYS;
  });
}
