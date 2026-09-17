import { randomUUID } from 'node:crypto';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';

import type { AppConfig } from '../config/env';
import { usePostgresAuthState, clearWhatsappAuth } from '../infra/whatsapp-auth-store';
import { resolveTenantByChannel } from '../infra/tenants';
import { query } from '../infra/db';
import { processIncomingMessage } from './message-processor';
import { claimOutbound, markDispatched } from './outbox';

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'silent' });

export type WhatsappStatus = 'connecting' | 'qr_pending' | 'connected' | 'disconnected';

interface Connection {
  channelAccountId: string;
  tenantId: string;
  status: WhatsappStatus;
  qrDataUrl?: string;
  sock: ReturnType<typeof makeWASocket>;
}

const connections = new Map<string, Connection>();

export function listConnections() {
  return Array.from(connections.values()).map((c) => ({
    channelAccountId: c.channelAccountId,
    tenantId: c.tenantId,
    status: c.status,
    hasQr: Boolean(c.qrDataUrl),
  }));
}

export function getConnectionStatus(channelAccountId: string): { status: WhatsappStatus; hasQr: boolean } | undefined {
  const conn = connections.get(channelAccountId);
  if (!conn) return undefined;
  return { status: conn.status, hasQr: Boolean(conn.qrDataUrl) };
}

export function getConnectionQr(channelAccountId: string): string | undefined {
  return connections.get(channelAccountId)?.qrDataUrl;
}

async function outboundLoop(channelAccountId: string, tenantId: string, sock: ReturnType<typeof makeWASocket>) {
  while (connections.get(channelAccountId)?.status === 'connected') {
    const item = await claimOutbound(20, tenantId);
    if (!item) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    try {
      await sock.sendMessage(item.senderId, { text: item.responseText });
      await markDispatched(item.deliveryId, item.claimToken!, true);
    } catch (error) {
      await markDispatched(item.deliveryId, item.claimToken!, false, (error as Error).message);
    }
  }
}

export async function startWhatsappConnector(cfg: AppConfig, channelAccountId: string): Promise<void> {
  if (connections.has(channelAccountId)) {
    return; // já conectado ou conectando; evita duas sessões concorrentes para o mesmo canal
  }

  const tenant = await resolveTenantByChannel(channelAccountId);
  if (!tenant) {
    throw new Error(`Nenhum tenant cadastrado para o canal "${channelAccountId}" (cadastre via upsertTenantWithChannel antes de conectar).`);
  }

  const { state, saveCreds } = await usePostgresAuthState(channelAccountId, tenant.id);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
  });

  const connection: Connection = { channelAccountId, tenantId: tenant.id, status: 'connecting', sock };
  connections.set(channelAccountId, connection);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection: connState, lastDisconnect, qr } = update;
    const current = connections.get(channelAccountId);
    if (!current) return;

    if (qr) {
      current.status = 'qr_pending';
      current.qrDataUrl = await qrcode.toDataURL(qr);
      console.log(`[whatsapp:${channelAccountId}] QR code gerado.`);
    }

    if (connState === 'open') {
      current.status = 'connected';
      current.qrDataUrl = undefined;
      console.log(`[whatsapp:${channelAccountId}] Conectado.`);
      if (cfg.allowWhatsappSend) {
        outboundLoop(channelAccountId, tenant.id, sock).catch((error) => {
          console.error(`[whatsapp:${channelAccountId}] Erro no loop de envio:`, error);
        });
      } else {
        console.log(`[whatsapp:${channelAccountId}] ALLOW_WHATSAPP_SEND=false — apenas recebendo, sem enviar respostas reais.`);
      }
    }

    if (connState === 'close') {
      current.status = 'disconnected';
      connections.delete(channelAccountId);
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`[whatsapp:${channelAccountId}] Conexão encerrada (statusCode=${statusCode}). Logged out: ${loggedOut}.`);
      if (loggedOut) {
        await clearWhatsappAuth(channelAccountId);
      } else {
        setTimeout(() => {
          startWhatsappConnector(cfg, channelAccountId).catch((error) => {
            console.error(`[whatsapp:${channelAccountId}] Falha ao reconectar:`, error);
          });
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      return;
    }
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) {
        continue;
      }
      let senderId = msg.key.remoteJid;
      if (!senderId || senderId.endsWith('@g.us') || senderId === 'status@broadcast') {
        continue; // ignora grupos e status, atende só conversa direta
      }

      // WhatsApp identifica contatos por um "LID" opaco em vez do número de telefone
      // por padrão (privacidade). Resolvemos para o número real sempre que possível,
      // para que a coorte de piloto e o histórico fiquem consistentes por telefone.
      if (senderId.endsWith('@lid')) {
        const altPn = msg.key.remoteJidAlt;
        if (altPn) {
          senderId = altPn;
        } else {
          try {
            const resolved = await sock.signalRepository.lidMapping.getPNForLID(senderId);
            if (resolved) {
              senderId = resolved;
            }
          } catch {
            // sem mapeamento ainda disponível; segue com o LID mesmo
          }
        }
      }
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';
      if (!text.trim()) {
        continue;
      }

      await processIncomingMessage(cfg, {
        schema_version: '1',
        message_id: msg.key.id || randomUUID(),
        channel_account_id: channelAccountId,
        sender_id: senderId,
        sent_at: new Date((Number(msg.messageTimestamp) || Date.now() / 1000) * 1000).toISOString(),
        type: 'text',
        text,
      });
    }
  });
}

export async function stopWhatsappConnector(channelAccountId: string, logout: boolean): Promise<boolean> {
  const current = connections.get(channelAccountId);
  if (!current) {
    return false;
  }
  connections.delete(channelAccountId);
  try {
    if (logout) {
      await current.sock.logout();
      await clearWhatsappAuth(channelAccountId);
    } else {
      current.sock.end(undefined);
    }
  } catch {
    // conexão já pode estar fechada; seguimos com a limpeza local
  }
  return true;
}

/** Reconecta automaticamente todos os canais que já têm sessão salva — chamado na subida do servidor. */
export async function resumeAllWhatsappConnections(cfg: AppConfig): Promise<void> {
  const rows = await query<{ channel_account_id: string }>('SELECT channel_account_id FROM whatsapp_auth_creds');
  for (const row of rows) {
    startWhatsappConnector(cfg, row.channel_account_id).catch((error) => {
      console.error(`[whatsapp:${row.channel_account_id}] Falha ao retomar conexão salva:`, error);
    });
  }
}
