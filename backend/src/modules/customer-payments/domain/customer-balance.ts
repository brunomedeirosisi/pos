export type LegacyBalanceReconciliation = {
  source_field: 'CLIENTES.DBF.DEBITO';
  source_balance: number;
  reconstructed_balance: number;
  adjustment: number;
  source_sha256: string;
  import_session_id: string;
  reconciled_at: string;
};

export type CustomerFinancialTotals = {
  totalCharges: number;
  totalPaid: number;
  currentBalance?: number;
  legacyBalance?: LegacyBalanceReconciliation;
};

export function customerBalance(totals: CustomerFinancialTotals): number {
  return (
    totals.currentBalance ??
    Number((totals.totalCharges - totals.totalPaid + (totals.legacyBalance?.adjustment ?? 0)).toFixed(2))
  );
}

export function legacyBalanceFields(totals: CustomerFinancialTotals): { legacy_balance?: LegacyBalanceReconciliation } {
  return totals.legacyBalance ? { legacy_balance: totals.legacyBalance } : {};
}
