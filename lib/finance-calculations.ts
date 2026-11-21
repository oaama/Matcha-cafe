export type FinancialSummaryInput = {
  completedOrders: Array<{ total: number; inventoryCostSnapshot?: number }>;
  estimatedProductCosts: number;
  uncostedOrderCount: number;
  manualRevenue: number;
  operatingExpenses: number;
  payroll: Array<{ baseWages: number; overtimeEarnings: number; totalAdvances: number }>;
  outstandingDebts: number;
  approvedPurchases: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFinancialSummary(input: FinancialSummaryInput) {
  const onlineOrderRevenue = roundMoney(input.completedOrders.reduce((sum, order) => sum + order.total, 0));
  const savedProductCosts = roundMoney(input.completedOrders.reduce(
    (sum, order) => sum + (order.inventoryCostSnapshot ?? 0),
    0,
  ));
  const estimatedProductCosts = roundMoney(input.estimatedProductCosts);
  const productCosts = roundMoney(savedProductCosts + estimatedProductCosts);
  const manualRevenue = roundMoney(input.manualRevenue);
  const operatingExpenses = roundMoney(input.operatingExpenses);
  const baseWages = roundMoney(input.payroll.reduce((sum, record) => sum + record.baseWages, 0));
  const overtimeCosts = roundMoney(input.payroll.reduce((sum, record) => sum + record.overtimeEarnings, 0));
  const advances = roundMoney(input.payroll.reduce((sum, record) => sum + record.totalAdvances, 0));
  const completedOrdersCount = input.completedOrders.length;

  return {
    sales: onlineOrderRevenue,
    onlineOrderRevenue,
    manualRevenue,
    productCosts,
    savedProductCosts,
    estimatedProductCosts,
    uncostedOrderCount: input.uncostedOrderCount,
    operatingExpenses,
    baseWages,
    overtimeCosts,
    advances,
    outstandingDebts: roundMoney(input.outstandingDebts),
    approvedPurchases: roundMoney(input.approvedPurchases),
    operationalResult: roundMoney(onlineOrderRevenue + manualRevenue - productCosts - operatingExpenses - baseWages - overtimeCosts),
    orderCount: completedOrdersCount,
    averageOrderValue: completedOrdersCount ? roundMoney(onlineOrderRevenue / completedOrdersCount) : 0,
  };
}
