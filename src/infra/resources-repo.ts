import { query } from './db';

export type ResourceKind = 'link' | 'list' | 'text';

export interface TenantResource {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  kind: ResourceKind;
  valueText: string | null;
  valueList: string[] | null;
  triggerKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

interface ResourceRow {
  id: string;
  tenant_id: string;
  key: string;
  label: string;
  kind: ResourceKind;
  value_text: string | null;
  value_list: string[] | null;
  trigger_keywords: string[];
  created_at: string;
  updated_at: string;
}

function toResource(row: ResourceRow): TenantResource {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.key,
    label: row.label,
    kind: row.kind,
    valueText: row.value_text,
    valueList: row.value_list,
    triggerKeywords: row.trigger_keywords,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeKeyword(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function formatResource(resource: TenantResource): string {
  if (resource.kind === 'link') {
    return `${resource.label}: ${resource.valueText ?? ''}`;
  }
  if (resource.kind === 'list') {
    const items = (resource.valueList ?? []).map((item) => `- ${item}`).join('\n');
    return `${resource.label}:\n${items}`;
  }
  return resource.valueText ?? '';
}

export async function listResources(tenantId: string): Promise<TenantResource[]> {
  const rows = await query<ResourceRow>(`SELECT * FROM tenant_resources WHERE tenant_id = $1 ORDER BY created_at ASC`, [
    tenantId,
  ]);
  return rows.map(toResource);
}

/** Acha o primeiro recurso do tenant cuja palavra-gatilho aparece na mensagem (como palavra inteira). */
export async function findMatchingResource(tenantId: string, text: string): Promise<TenantResource | undefined> {
  const resources = await listResources(tenantId);
  const normalizedText = normalizeKeyword(text).replace(/[^\p{L}\p{N}\s]/gu, ' ');

  for (const resource of resources) {
    const matches = resource.triggerKeywords.some((keyword) => {
      const normalizedKeyword = normalizeKeyword(keyword);
      if (!normalizedKeyword) return false;
      const pattern = new RegExp(`\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      return pattern.test(normalizedText);
    });
    if (matches) {
      return resource;
    }
  }
  return undefined;
}

export async function createResource(
  tenantId: string,
  input: {
    key: string;
    label: string;
    kind: ResourceKind;
    valueText?: string;
    valueList?: string[];
    triggerKeywords: string[];
  },
): Promise<TenantResource> {
  const [row] = await query<ResourceRow>(
    `INSERT INTO tenant_resources (tenant_id, key, label, kind, value_text, value_list, trigger_keywords)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, key) DO UPDATE SET
       label = EXCLUDED.label,
       kind = EXCLUDED.kind,
       value_text = EXCLUDED.value_text,
       value_list = EXCLUDED.value_list,
       trigger_keywords = EXCLUDED.trigger_keywords,
       updated_at = now()
     RETURNING *`,
    [
      tenantId,
      input.key.trim(),
      input.label.trim(),
      input.kind,
      input.valueText?.trim() ?? null,
      input.valueList ?? null,
      input.triggerKeywords,
    ],
  );
  return toResource(row);
}

export async function updateResource(
  tenantId: string,
  resourceId: string,
  input: Partial<{ label: string; kind: ResourceKind; valueText: string | null; valueList: string[] | null; triggerKeywords: string[] }>,
): Promise<TenantResource | undefined> {
  const [row] = await query<ResourceRow>(
    `UPDATE tenant_resources SET
       label = COALESCE($3, label),
       kind = COALESCE($4, kind),
       value_text = COALESCE($5, value_text),
       value_list = COALESCE($6, value_list),
       trigger_keywords = COALESCE($7, trigger_keywords),
       updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, resourceId, input.label, input.kind, input.valueText, input.valueList, input.triggerKeywords],
  );
  return row ? toResource(row) : undefined;
}

export async function deleteResource(tenantId: string, resourceId: string): Promise<boolean> {
  const rows = await query('DELETE FROM tenant_resources WHERE tenant_id = $1 AND id = $2 RETURNING id', [
    tenantId,
    resourceId,
  ]);
  return rows.length > 0;
}
