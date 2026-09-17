const DEFAULT_RETENTION_DAYS = 90;

export function getRetentionDays(): number {
  const parsed = Number(process.env.AGENT_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}
