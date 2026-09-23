// /costs-monthly → MonthCost[] sorted by month (invoices entered by hand, §5.2.3.7).

/**
 * @param {{ months?: Array<import('../api/contract.js').MonthCost> } | null} api
 * @returns {import('../api/contract.js').MonthCost[]}
 */
export function normalizeCostsMonthly(api) {
  const months = Array.isArray(api?.months) ? api.months.filter((m) => typeof m?.month === 'string') : [];
  return [...months].sort((a, b) => a.month.localeCompare(b.month));
}
