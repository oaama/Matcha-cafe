// Single-day profit view ("اليومية"), mirroring the standalone recipe cost
// calculator: revenue for one day minus ingredient costs, that day's expenses,
// that day's wages, and the daily share of the fixed overhead.

export type DailyReportItemSale = {
  name: string;
  quantity: number;
  revenue: number;
  cost?: number;
};

export type DailyReportInput = {
  date: string;
  ordersRevenue: number;
  orderCount: number;
  manualRevenue: number;
  productCosts: number;
  uncostedOrderCount: number;
  expenses: number;
  wages: number;
  fixedOverhead: number;
  itemSales: DailyReportItemSale[];
};

export type DailyReport = DailyReportInput & {
  totalRevenue: number;
  net: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeDailyReport(input: DailyReportInput): DailyReport {
  const totalRevenue = roundMoney(input.ordersRevenue + input.manualRevenue);
  const net = roundMoney(
    totalRevenue - input.productCosts - input.expenses - input.wages - input.fixedOverhead,
  );
  return { ...input, totalRevenue, net };
}
