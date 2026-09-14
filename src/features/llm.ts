import { validatePaidConfig, AppConfig } from '../config/env';
import { commitBudget, estimateCallCostUsd, releaseBudget, reserveBudget } from './llm-budget';
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

  const estimatedCostUsd = estimateCallCostUsd(model);
  const reservation = reserveBudget(cfg.llmBudgetUsd, estimatedCostUsd);
  if (!reservation) {
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: 'budget_exhausted',
    };
  }

  const prompt = buildPrompt(faq, text);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
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
  } catch (error) {
    releaseBudget(reservation);
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: controller.signal.aborted ? 'llm-timeout' : 'llm-network-error',
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    releaseBudget(reservation);
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
      releaseBudget(reservation);
      return {
        ok: false,
        source: 'llm-fallback',
        response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
        reason: 'empty_response',
      };
    }

    commitBudget(reservation, estimatedCostUsd);
    return {
      ok: true,
      source: 'llm-paid',
      response: safeSnippet(content),
    };
  } catch {
    releaseBudget(reservation);
    return {
      ok: false,
      source: 'llm-fallback',
      response: 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.',
      reason: 'invalid_json',
    };
  }
}
