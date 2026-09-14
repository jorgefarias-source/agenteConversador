export interface MenuItem {
  id: string;
  name: string;
  section: string;
  priceText: string;
}

export interface OrderSnapshot {
  reference: string;
  status: string;
  createdAt: string;
  totalText: string;
}

interface CustomerAccess {
  customerId: string;
  senderKey: string;
  orderRefs: string[];
}

interface BusinessData {
  businessId: string;
  businessName: string;
  menu: MenuItem[];
  customers: CustomerAccess[];
  orders: Array<OrderSnapshot & { customerId: string }>;
}

const DEMO_BUSINESS: BusinessData = {
  businessId: 'ponto-do-recheio',
  businessName: 'Ponto do Recheio',
  menu: [
    { id: 'm1', name: 'X-Burguer', section: 'Lanches', priceText: 'R$ 24,90' },
    { id: 'm2', name: 'X-Salada', section: 'Lanches', priceText: 'R$ 27,90' },
    { id: 'm3', name: 'Combo Frango', section: 'Combos', priceText: 'R$ 39,90' },
    { id: 'm4', name: 'Suco Natural', section: 'Bebidas', priceText: 'R$ 11,00' },
  ],
  customers: [
    { customerId: 'cli-001', senderKey: 'canal-demo:remetente-demo-A', orderRefs: ['PED-1001', 'PED-1002'] },
    { customerId: 'cli-002', senderKey: 'canal-demo:remetente-demo-B', orderRefs: ['PED-2001'] },
  ],
  orders: [
    {
      customerId: 'cli-001',
      reference: 'PED-1001',
      status: 'Em preparo',
      createdAt: '2026-09-13T18:20:00-03:00',
      totalText: 'R$ 56,80',
    },
    {
      customerId: 'cli-001',
      reference: 'PED-1002',
      status: 'Saiu para entrega',
      createdAt: '2026-09-14T11:45:00-03:00',
      totalText: 'R$ 39,90',
    },
    {
      customerId: 'cli-002',
      reference: 'PED-2001',
      status: 'Pronto para retirada',
      createdAt: '2026-09-14T12:10:00-03:00',
      totalText: 'R$ 89,50',
    },
  ],
};

const FALLBACK_BUSINESS = {
  businessId: 'demonstração',
  businessName: 'Loja de Demonstração',
  menu: [
    { id: 'm1', name: 'Mini lanche', section: 'Lanches', priceText: 'R$ 18,00' },
    { id: 'm2', name: 'Refrigerante 350ml', section: 'Bebidas', priceText: 'R$ 7,00' },
  ],
  customers: [],
  orders: [],
};

function businessDataById(businessId: string): BusinessData {
  return businessId === 'ponto-do-recheio' ? DEMO_BUSINESS : { ...FALLBACK_BUSINESS } as BusinessData;
}

function senderKey(channelAccountId: string, senderId: string): string {
  return `${channelAccountId}:${senderId}`;
}

export function getMenuForBusiness(businessId: string): MenuItem[] {
  return businessDataById(businessId).menu;
}

export function resolveCustomerIdBySender(businessId: string, channelAccountId: string, senderId: string): string | undefined {
  const item = businessDataById(businessId).customers.find((entry) => entry.senderKey === senderKey(channelAccountId, senderId));
  return item?.customerId;
}

export function resolveOrderForCustomer(businessId: string, senderId: string, channelAccountId: string, reference: string): OrderSnapshot | undefined {
  const customerId = resolveCustomerIdBySender(businessId, channelAccountId, senderId);
  if (!customerId) {
    return undefined;
  }
  const normalized = normalizeRef(reference);
  return businessDataById(businessId).orders.find((order) => order.customerId === customerId && order.reference === normalized);
}

function normalizeRef(value: string): string {
  return value.trim().toUpperCase();
}

export function listCustomerOrders(businessId: string, channelAccountId: string, senderId: string): OrderSnapshot[] {
  const customerId = resolveCustomerIdBySender(businessId, channelAccountId, senderId);
  if (!customerId) {
    return [];
  }
  return businessDataById(businessId).orders.filter((order) => order.customerId === customerId);
}
