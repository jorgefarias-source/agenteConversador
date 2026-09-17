import dotenv from 'dotenv';
import { runMigrations, closePool } from '../infra/db';
import { addPilotSender, setTenantPilotMode, upsertTenantWithChannel } from '../infra/tenants';
import { seedPontoDoRecheioMenu } from '../infra/seed-customer-data';
import { listFaqEntries, createFaqEntry } from '../infra/faq-repo';

dotenv.config();
dotenv.config({ path: '.env.local', override: false });

async function main() {
  const applied = await runMigrations();
  if (applied.length) {
    console.log(`Migrações aplicadas: ${applied.join(', ')}`);
  }

  const channelAccountId = process.env.SEED_CHANNEL_ACCOUNT_ID || 'canal-demo';
  const slug = process.env.SEED_TENANT_SLUG || 'ponto-do-recheio';
  const name = process.env.SEED_TENANT_NAME || 'Ponto do Recheio';

  const tenant = await upsertTenantWithChannel(slug, name, channelAccountId);
  console.log(`Tenant demo pronto: ${tenant.slug} (${tenant.id}) <- canal ${channelAccountId}`);

  if (tenant.slug === 'ponto-do-recheio') {
    await seedPontoDoRecheioMenu(tenant.id);
    console.log('Cardápio/clientes/pedidos de demonstração populados.');
  }

  const existingFaq = await listFaqEntries(tenant.id);
  if (existingFaq.length === 0) {
    await createFaqEntry(tenant.id, {
      theme: 'entrega',
      question: 'Vocês fazem entrega?',
      answer: 'Na versão de laboratório usamos informações de exemplo e não confirmamos disponibilidade real.',
      approvedBy: 'Pré-projeto',
    });
    await createFaqEntry(tenant.id, {
      theme: 'retirada',
      question: 'Posso retirar no balcão?',
      answer: 'Sim, a retirada pode ser informada pela equipe quando necessário. Confirmação real entra no piloto.',
      approvedBy: 'Pré-projeto',
    });
    await createFaqEntry(tenant.id, {
      theme: 'pagamento',
      question: 'Quais formas de pagamento?',
      answer: 'Use o fluxo oficial do atendimento. No laboratório tratamos como resposta de exemplo e não final.',
      approvedBy: 'Pré-projeto',
    });
    console.log('FAQ de demonstração cadastrada.');
  }

  // Tenants de demonstração/smoke ficam em modo piloto (coorte restrita), diferente de um
  // tenant real criado via API (que por padrão atende qualquer remetente).
  await setTenantPilotMode(tenant.id, true);
  await addPilotSender(tenant.id, 'remetente-demo-A');
  await addPilotSender(tenant.id, 'remetente-demo-B');
  if (process.env.SEED_EXTRA_PILOT_SENDER) {
    await addPilotSender(tenant.id, process.env.SEED_EXTRA_PILOT_SENDER);
  }
  console.log('Modo piloto ativado para o tenant de demonstração (remetentes de teste autorizados).');

  await closePool();
}

await main();
