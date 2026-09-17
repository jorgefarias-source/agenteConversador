import { query } from './db';
import type { FaqEntry, FaqVersion } from '../features/faq';

interface FaqRow {
  id: string;
  theme: string;
  question: string;
  answer: string;
  approved_by: string;
  status: FaqEntry['status'];
  updated_at: string;
}

export async function faqForTenant(tenantId: string, tenantSlug: string, tenantName: string): Promise<FaqVersion> {
  const rows = await query<FaqRow>(
    `SELECT id, theme, question, answer, approved_by, status, updated_at
       FROM faq_entries
      WHERE tenant_id = $1 AND status = 'aprovado'
      ORDER BY created_at ASC`,
    [tenantId],
  );

  const entries: FaqEntry[] = rows.map((row) => ({
    id: row.id,
    theme: row.theme,
    question: row.question,
    answer: row.answer,
    approvedBy: row.approved_by,
    status: row.status,
  }));

  const latestUpdate = rows.reduce<string | undefined>((latest, row) => {
    return !latest || row.updated_at > latest ? row.updated_at : latest;
  }, undefined);

  return {
    businessId: tenantSlug,
    businessName: tenantName,
    version: latestUpdate ? `faq-${new Date(latestUpdate).toISOString()}` : 'sem-faq-cadastrado',
    updatedAt: latestUpdate ?? new Date(0).toISOString(),
    entries,
  };
}

export interface FaqEntryAdmin extends FaqEntry {
  createdAt: string;
  updatedAt: string;
}

interface FaqAdminRow extends FaqRow {
  created_at: string;
}

function toAdmin(row: FaqAdminRow): FaqEntryAdmin {
  return {
    id: row.id,
    theme: row.theme,
    question: row.question,
    answer: row.answer,
    approvedBy: row.approved_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFaqEntries(tenantId: string): Promise<FaqEntryAdmin[]> {
  const rows = await query<FaqAdminRow>(
    `SELECT * FROM faq_entries WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map(toAdmin);
}

export async function createFaqEntry(
  tenantId: string,
  input: { theme?: string; question: string; answer: string; approvedBy?: string; status?: FaqEntry['status'] },
): Promise<FaqEntryAdmin> {
  const [row] = await query<FaqAdminRow>(
    `INSERT INTO faq_entries (tenant_id, theme, question, answer, approved_by, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      input.theme?.trim() || 'geral',
      input.question.trim(),
      input.answer.trim(),
      input.approvedBy?.trim() || '',
      input.status === 'rascunho' ? 'rascunho' : 'aprovado',
    ],
  );
  return toAdmin(row);
}

export async function updateFaqEntry(
  tenantId: string,
  faqId: string,
  input: Partial<{ theme: string; question: string; answer: string; approvedBy: string; status: FaqEntry['status'] }>,
): Promise<FaqEntryAdmin | undefined> {
  const [row] = await query<FaqAdminRow>(
    `UPDATE faq_entries SET
       theme = COALESCE($3, theme),
       question = COALESCE($4, question),
       answer = COALESCE($5, answer),
       approved_by = COALESCE($6, approved_by),
       status = COALESCE($7, status),
       updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, faqId, input.theme, input.question, input.answer, input.approvedBy, input.status],
  );
  return row ? toAdmin(row) : undefined;
}

export async function deleteFaqEntry(tenantId: string, faqId: string): Promise<boolean> {
  const rows = await query('DELETE FROM faq_entries WHERE tenant_id = $1 AND id = $2 RETURNING id', [tenantId, faqId]);
  return rows.length > 0;
}
