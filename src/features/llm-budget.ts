// Controle simples de orçamento em memória para chamadas pagas de LLM.
// Reserva o custo estimado ANTES da chamada e só confirma o gasto real
// depois da resposta, para que chamadas concorrentes não estourem o teto
// configurado em LLM_BUDGET_USD (T7 do escopo v0.3).

let spentUsd = 0;
let reservedUsd = 0;

export interface BudgetReservation {
  amountUsd: number;
}

export function estimateCallCostUsd(model: string): number {
  // Estimativa conservadora por chamada (prompt + max_tokens=350 de saída)
  // usando o preço mais caro do catálogo mock-simulator suportado (gpt-4o-mini).
  // Serve apenas para reservar orçamento antes de saber o custo real.
  return model.toLowerCase().includes('gpt-4o-mini') ? 0.001 : 0.01;
}

export function reserveBudget(budgetUsd: number, estimatedCostUsd: number): BudgetReservation | undefined {
  if (spentUsd + reservedUsd + estimatedCostUsd > budgetUsd) {
    return undefined;
  }
  reservedUsd += estimatedCostUsd;
  return { amountUsd: estimatedCostUsd };
}

export function commitBudget(reservation: BudgetReservation, actualCostUsd: number): void {
  reservedUsd = Math.max(0, reservedUsd - reservation.amountUsd);
  spentUsd += actualCostUsd;
}

export function releaseBudget(reservation: BudgetReservation): void {
  reservedUsd = Math.max(0, reservedUsd - reservation.amountUsd);
}

export function budgetSnapshot() {
  return { spentUsd, reservedUsd };
}

export function resetBudget(): void {
  spentUsd = 0;
  reservedUsd = 0;
}
