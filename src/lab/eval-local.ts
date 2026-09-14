import fs from 'node:fs';

import { parseEnv, validatePaidConfig } from '../config/env';
import { answerFromFaq, faqByBusiness } from '../features/faq';

const cfg = parseEnv(process.env);
const paid = validatePaidConfig(cfg);
const raw = fs.readFileSync('src/lab/scenarios.json', 'utf8');
const parsed = JSON.parse(raw) as {
  scenarios: Array<{ id: string; input: string; kind: 'atendimento' | 'falha'; expected: 'faq-matched' | 'fallback-human' }>;
};

function simulate(input: string) {
  const business = faqByBusiness('ponto-do-recheio');
  const match = answerFromFaq(business, input);
  return match ? 'faq-matched' : 'fallback-human';
}

async function main() {
  const results = parsed.scenarios.map((scenario) => {
    const source = simulate(scenario.input);
    const passed = source === scenario.expected;
    return {
      id: scenario.id,
      kind: scenario.kind,
      input: scenario.input,
      expected: scenario.expected,
      got: source,
      passed,
      note: paid.ok ? '' : 'Lab sem IA paga configurada; regras de simulador em vigor.',
    };
  });

  const passed = results.filter((r) => r.passed).length;

  fs.writeFileSync('eval-local-report.json', JSON.stringify({
    total: results.length,
    passed,
    paidConfigOk: paid.ok,
    details: results,
    generatedAt: new Date().toISOString(),
  }, null, 2));

  const lines: string[] = [
    '# Relatorio local',
    `Total: ${results.length}`,
    `Acertos (regra de fonte): ${passed}`,
    `Config Paid: ${paid.ok ? 'ok' : paid.reason ?? 'desligada'}`,
    '',
  ];

  for (const item of results) {
    lines.push(`- ${item.id} (${item.kind}): ${item.passed ? 'OK' : 'FALHA'} — esperado ${item.expected}, recebeu ${item.got}`);
  }

  fs.writeFileSync('eval-local-report.md', `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

await main();
