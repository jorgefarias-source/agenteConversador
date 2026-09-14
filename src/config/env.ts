import { randomUUID } from 'node:crypto';

export interface AppConfig {
  appMode: 'lab' | 'demo' | 'pilot';
  llmProvider: string;
  allowPaidLLM: boolean;
  allowWhatsappSend: boolean;
  llmModel: string;
  openAiApiKey: string;
  llmBudgetUsd: number;
  port: number;
  connectorToken: string;
  allowPilotSenders: Set<string>;
  channelBusinessMap: Map<string, string>;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePilotSenders(value: string | undefined): Set<string> {
  if (!value) {
    return new Set<string>();
  }
  return new Set(
    value
      .split(',')
      .map((raw) => raw.trim())
      .filter(Boolean),
  );
}

function parseChannelBusinessMap(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!value) {
    return map;
  }
  for (const pair of value.split(',')) {
    const [channel, business] = pair.split(':').map((raw) => raw.trim());
    if (channel && business) {
      map.set(channel, business);
    }
  }
  return map;
}

export function parseEnv(raw: NodeJS.ProcessEnv): AppConfig {
  return {
    appMode: raw.APP_MODE === 'demo' ? 'demo' : raw.APP_MODE === 'pilot' ? 'pilot' : 'lab',
    llmProvider: (raw.LLM_PROVIDER || 'mock').trim(),
    allowPaidLLM: parseBool(raw.ALLOW_PAID_LLM, false),
    allowWhatsappSend: parseBool(raw.ALLOW_WHATSAPP_SEND, false),
    llmModel: (raw.LLM_MODEL || '').trim(),
    openAiApiKey: (raw.OPENAI_API_KEY || '').trim(),
    llmBudgetUsd: parseNumber(raw.LLM_BUDGET_USD, 0),
    port: parseInt(raw.PORT || '3000', 10) || 3000,
    connectorToken: (raw.AGENT_CONNECTOR_TOKEN || '').trim(),
    allowPilotSenders: parsePilotSenders(raw.PILOT_SENDERS),
    channelBusinessMap: parseChannelBusinessMap(raw.CHANNEL_BUSINESS_MAP),
  };
}

export function resolveBusinessId(cfg: AppConfig, channelAccountId: string): string | undefined {
  return cfg.channelBusinessMap.get(channelAccountId);
}

export function validatePaidConfig(cfg: AppConfig): { ok: boolean; reason?: string } {
  if (!cfg.allowPaidLLM) {
    return { ok: true };
  }
  if (!cfg.llmProvider || !cfg.llmModel || !cfg.openAiApiKey) {
    return { ok: false, reason: 'Configuração paga habilitada sem LLM_PROVIDER, LLM_MODEL ou OPENAI_API_KEY.' };
  }
  if (cfg.llmBudgetUsd <= 0) {
    return { ok: false, reason: 'LLM_BUDGET_USD precisa ser maior que 0 com chamadas pagas.' };
  }
  return { ok: true };
}

export function isFeatureEnabled(cfg: AppConfig): boolean {
  return cfg.allowPaidLLM && validatePaidConfig(cfg).ok;
}

export function requireConnectorToken(cfg: AppConfig): string {
  return cfg.connectorToken || '';
}
