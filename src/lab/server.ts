import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';

import { parseEnv, validatePaidConfig } from '../config/env';
import { answerFromFaq, faqByBusiness } from '../features/faq';

dotenv.config();
const cfg = parseEnv(process.env);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  const htmlPath = path.join(process.cwd(), 'src', 'lab', 'index.html');
  res.sendFile(htmlPath);
});

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    appMode: cfg.appMode,
    allowPaidLlm: cfg.allowPaidLLM,
    allowWhatsappSend: cfg.allowWhatsappSend,
    provider: cfg.llmProvider,
  });
});

app.post('/api/chat', (req, res) => {
  const start = performance.now();
  const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId : 'demo';
  const text = typeof req.body?.text === 'string' ? req.body.text : '';

  const paid = validatePaidConfig(cfg);
  const source = faqByBusiness(businessId);
  const matched = answerFromFaq(source, text);

  const responseText = matched?.answer || 'Não consigo responder com segurança. Posso encaminhar para atendimento humano.';

  res.json({
    response: responseText,
    businessId: source.businessId,
    businessName: source.businessName,
    faqVersion: source.version,
    source: matched ? 'faq-matched' : 'fallback-human',
    mode: cfg.appMode,
    latencyMs: Math.round(performance.now() - start),
    costUsd: paid.ok ? 0.0008 : 0,
    configWarnings: paid.ok ? [] : [paid.reason],
  });
});

const port = cfg.port;
app.listen(port, '127.0.0.1', () => {
  console.log(`LABORATÓRIO ativo em http://127.0.0.1:${port}`);
  if (!validatePaidConfig(cfg).ok) {
    console.log('Modo simulado ativo. Chaves de IA não configuradas ou chamadas pagas desabilitadas.');
  }
});
