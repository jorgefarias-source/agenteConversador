import { validatePaidConfig, AppConfig } from '../config/env';
import type { FaqVersion } from './faq';

export interface PaidReplyResult {
  ok: boolean;
  source: 'llm-paid' | 'llm-fallback';
  response: string;
  reason?: string;
}

function safeSnippet(value: string): string {
  return value.trim().slice(0, 3500);
}

function buildPrompt(faq: FaqVersion, text: string): string {
  return [
    'Você é agente de atendimento de WhatsApp em modo laboratório. Responda em português claro e objetivo.',
    'Use APENAS informações da base de FAQ abaixo.',
    'Se não houver resposta segura na base, responda apenas com: Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
    `Negócio: ${faq.businessName}`,
    `FAQ versão: ${faq.version}`,
    `Atualizado em: ${faq.updatedAt}`,
    'Questão do cliente:',
    text,
    'FAQ (resumido):',
    ...faq.entries.map((entry) => `- ${entry.question}: ${entry.answer}`),
  ].join('\n');
}

export async function askPilotLlm(
  cfg: AppConfig,
  faq: FaqVersion,
  text: string,
): Promise<PaidReplyResult> {
  const paid = validatePaidConfig(cfg);
  if (!paid.ok) {
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: paid.reason,
    };
  }

  const model = cfg.llmModel || 'gpt-4o-mini';
  const key = cfg.openAiApiKey;

  if (!cfg.llmProvider || cfg.llmProvider.toLowerCase() !== 'openai' || !key) {
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: 'provider not ready',
    };
  }

  const prompt = buildPrompt(faq, text);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Você é um assistente de atendimento e segue regras estritas de segurança.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 350,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: `llm-status:${response.status}`,
    };
  }

  try {
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      return {
        ok: false,
        source: 'llm-fallback',
        response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
        reason: 'empty_response',
      };
    }

    return {
      ok: true,
      source: 'llm-paid',
      response: safeSnippet(content),
    };
  } catch {
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: 'invalid_json',
    };
  }
}
