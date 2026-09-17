import { query } from './db';

interface MenuSeedItem {
  section: string;
  name: string;
  price: number;
}

interface CustomerSeedItem {
  channelAccountId: string;
  senderId: string;
  orders: Array<{ reference: string; status: string; total: number; createdAt: string }>;
}

export async function seedPontoDoRecheioMenu(tenantId: string): Promise<void> {
  const existing = await query<{ count: string }>('SELECT count(*)::text AS count FROM menu_items WHERE tenant_id = $1', [tenantId]);
  if (Number(existing[0]?.count ?? 0) > 0) {
    return;
  }

  const menu: MenuSeedItem[] = [
    { section: 'Lanches', name: 'X-Burguer', price: 24.9 },
    { section: 'Lanches', name: 'X-Salada', price: 27.9 },
    { section: 'Combos', name: 'Combo Frango', price: 39.9 },
    { section: 'Bebidas', name: 'Suco Natural', price: 11.0 },
  ];
  for (const item of menu) {
    await query('INSERT INTO menu_items (tenant_id, section, name, price) VALUES ($1, $2, $3, $4)', [
      tenantId,
      item.section,
      item.name,
      item.price,
    ]);
  }

  const customers: CustomerSeedItem[] = [
    {
      channelAccountId: 'canal-demo',
      senderId: 'remetente-demo-A',
      orders: [
        { reference: 'PED-1001', status: 'Em preparo', total: 56.8, createdAt: '2026-09-13T18:20:00-03:00' },
        { reference: 'PED-1002', status: 'Saiu para entrega', total: 39.9, createdAt: '2026-09-14T11:45:00-03:00' },
      ],
    },
    {
      channelAccountId: 'canal-demo',
      senderId: 'remetente-demo-B',
      orders: [{ reference: 'PED-2001', status: 'Pronto para retirada', total: 89.5, createdAt: '2026-09-14T12:10:00-03:00' }],
    },
  ];

  for (const customer of customers) {
    const [row] = await query<{ id: string }>(
      `INSERT INTO customers (tenant_id, channel_account_id, sender_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, channel_account_id, sender_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING id`,
      [tenantId, customer.channelAccountId, customer.senderId],
    );
    for (const order of customer.orders) {
      await query(
        `INSERT INTO orders (tenant_id, customer_id, reference, status, total, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, reference) DO NOTHING`,
        [tenantId, row.id, order.reference, order.status, order.total, order.createdAt],
      );
    }
  }
}
