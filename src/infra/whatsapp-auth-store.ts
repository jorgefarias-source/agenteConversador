import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { query } from './db';

// Serializa com o replacer do Baileys (preserva Buffers/Uint8Array corretamente) e devolve
// texto JSON puro — evita que o driver do pg re-serialize o valor sem o replacer certo,
// o que corrompia estruturas especiais (ex: sessões "LID") ao gravar em coluna jsonb.
function serializeToJsonText(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

export async function usePostgresAuthState(
  channelAccountId: string,
  tenantId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const existing = await query<{ creds: unknown }>(
    'SELECT creds FROM whatsapp_auth_creds WHERE channel_account_id = $1',
    [channelAccountId],
  );
  const creds: AuthenticationCreds = existing[0] ? deserialize(existing[0].creds) : initAuthCreds();

  async function saveCreds(): Promise<void> {
    await query(
      `INSERT INTO whatsapp_auth_creds (channel_account_id, tenant_id, creds)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (channel_account_id) DO UPDATE SET creds = EXCLUDED.creds, updated_at = now()`,
      [channelAccountId, tenantId, serializeToJsonText(creds)],
    );
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result: Record<string, unknown> = {};
        if (ids.length === 0) {
          return result;
        }
        const rows = await query<{ key_id: string; key_value: unknown }>(
          `SELECT key_id, key_value FROM whatsapp_auth_keys
            WHERE channel_account_id = $1 AND key_type = $2 AND key_id = ANY($3)`,
          [channelAccountId, type, ids],
        );
        for (const row of rows) {
          let value = row.key_value !== null ? deserialize(row.key_value) : undefined;
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
          }
          result[row.key_id] = value;
        }
        return result;
      },
      set: async (data) => {
        for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const entries = data[type];
          if (!entries) continue;
          for (const id of Object.keys(entries)) {
            const value = entries[id];
            if (value === null || value === undefined) {
              await query(
                `DELETE FROM whatsapp_auth_keys WHERE channel_account_id = $1 AND key_type = $2 AND key_id = $3`,
                [channelAccountId, type, id],
              );
            } else {
              await query(
                `INSERT INTO whatsapp_auth_keys (channel_account_id, key_type, key_id, key_value)
                 VALUES ($1, $2, $3, $4::jsonb)
                 ON CONFLICT (channel_account_id, key_type, key_id)
                 DO UPDATE SET key_value = EXCLUDED.key_value, updated_at = now()`,
                [channelAccountId, type, id, serializeToJsonText(value)],
              );
            }
          }
        }
      },
    },
  };

  return { state, saveCreds };
}

export async function clearWhatsappAuth(channelAccountId: string): Promise<void> {
  await query('DELETE FROM whatsapp_auth_keys WHERE channel_account_id = $1', [channelAccountId]);
  await query('DELETE FROM whatsapp_auth_creds WHERE channel_account_id = $1', [channelAccountId]);
}
