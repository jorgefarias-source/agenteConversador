import type { AppConfig } from '../config/env';
import { validatePaidConfig } from '../config/env';
import { acceptIncoming, IncomingMessagePayload } from './inbox';
import { answerFromFaq, faqByBusiness } from '../features/faq';
import { askPilotLlm } from '../features/llm';
import { getMenuForTenant, resolveOrderForCustomer } from './customer-data';
import { enqueueOutbound, OutboundItem } from './outbox';
import { escalateSender, isEscalated } from './handoff';
import { isPilotSenderAllowed, resolveTenantByChannel } from '../infra/tenants';

function normalizeForIntent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s]/gu, ' ')
    .toLowerCase()
    .trim();
}

function hasMenuIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /\bcardapio\b|\bcardapios\b|\bmenu\b/.test(normalized);
}

function parseOrderReference(text: string): string | undefined {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const match = normalized.match(/\bpedido\b[^a-z0-9]*((?:[a-z]{1,4}[-#]?\d{3,}|\d{4,}))/i);
  return match ? match[1].replace('#', '').toUpperCase() : undefined;
}

async function formatMenu(tenantId: string): Promise<string> {
  const menu = await getMenuForTenant(tenantId);
  return menu.map((item) => `- ${item.section}: ${item.name} (${item.priceText})`).join('\n');
}

function formatOrderForSender(orderRef: string, order?: { status: string; totalText: string; createdAt: string }): string {
  if (!order) {
    return `Não foi possível localizar o pedido ${orderRef}. Sem acesso suficiente para validar, seguimos com atendimento humano.`;
  }

  return [
    `Pedido: ${orderRef}`,
    `Status atual: ${order.status}`,
    `Criado em: ${order.createdAt}`,
    `Total: ${order.totalText}`,
  ].join('\n');
}

export type ProcessResult =
  | { kind: 'no_tenant' }
  | { kind: 'not_in_pilot'; receiptId: string; messageId: string; status: string; duplicate: boolean; traceId: string }
  | { kind: 'duplicate'; receiptId: string; messageId: string; status: string; duplicate: boolean; traceId: string }
  | { kind: 'escalated'; receiptId: string; messageId: string; status: string; duplicate: boolean; traceId: string }
  | { kind: 'answered'; receiptId: string; messageId: string; status: string; duplicate: boolean; traceId: string; outbound: OutboundItem };

export async function processIncomingMessage(cfg: AppConfig, payload: IncomingMessagePayload): Promise<ProcessResult> {
  const tenant = await resolveTenantByChannel(payload.channel_account_id);
  if (!tenant) {
    return { kind: 'no_tenant' };
  }

  const work = await acceptIncoming(tenant.id, payload);
  const base = {
    receiptId: work.receiptId,
    messageId: work.messageId,
    status: work.status,
    duplicate: work.duplicate,
    traceId: work.traceId,
  };

  if (tenant.pilotMode) {
    const pilotAllowed = await isPilotSenderAllowed(tenant.id, payload.sender_id);
    if (!pilotAllowed) {
      return { kind: 'not_in_pilot', ...base };
    }
  }

  if (work.status === 'duplicate') {
    return { kind: 'duplicate', ...base };
  }

  const businessId = tenant.slug;

  if (await isEscalated(payload.channel_account_id, payload.sender_id)) {
    return { kind: 'escalated', ...base };
  }

  const faq = faqByBusiness(businessId);
  const faqMatch = answerFromFaq(faq, payload.text);

  let responseText = faqMatch
    ? `${faqMatch.answer}\n\n[Fonte: ${faq.version}]`
    : 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.';
  let source: 'faq-matched' | 'fallback-human' | 'llm-paid' | 'cardapio-consult' | 'pedido-consult' = faqMatch
    ? 'faq-matched'
    : 'fallback-human';

  const text = payload.text;
  const orderRef = parseOrderReference(text);

  if (hasMenuIntent(text)) {
    responseText = `Cardápio atual:\n${await formatMenu(tenant.id)}`;
    source = 'cardapio-consult';
  } else if (orderRef) {
    const order = await resolveOrderForCustomer(tenant.id, payload.channel_account_id, payload.sender_id, orderRef);
    responseText = formatOrderForSender(orderRef, order);
    source = 'pedido-consult';
  } else if (cfg.allowPaidLLM && !faqMatch) {
    const paid = validatePaidConfig(cfg);
    if (paid.ok) {
      const llmReply = await askPilotLlm(cfg, faq, text);
      if (llmReply.ok) {
        responseText = llmReply.response;
        source = 'llm-paid';
      }
    }
  }

  if (source === 'fallback-human') {
    await escalateSender(tenant.id, payload.channel_account_id, payload.sender_id, text);
  }

  const outbound = await enqueueOutbound(tenant.id, {
    receiptId: work.receiptId,
    messageId: payload.message_id,
    channelAccountId: payload.channel_account_id,
    senderId: payload.sender_id,
    responseText,
    source,
    sourceVersion: source === 'cardapio-consult' ? 'd1-menu-v1' : source === 'pedido-consult' ? 'd1-pedido-v1' : faq.version,
  });

  return { kind: 'answered', ...base, outbound };
}
