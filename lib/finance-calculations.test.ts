import { describe, expect, it } from 'vitest';
import { calculateFinancialSummary } from './finance-calculations';

describe('calculateFinancialSummary', () => {
  it('keeps revenue sources separate and does not subtract purchases or advances twice', () => {
    const summary = calculateFinancialSummary({
      completedOrders: [
        { total: 100, inventoryCostSnapshot: 20 },
        { total: 50 },
      ],
      estimatedProductCosts: 8,
      uncostedOrderCount: 0,
      manualRevenue: 30,
      operatingExpenses: 10,
      payroll: [{ baseWages: 15, overtimeEarnings: 5, totalAdvances: 7 }],
      outstandingDebts: 40,
      approvedPurchases: 60,
    });

    expect(summary).toMatchObject({
      sales: 150,
      onlineOrderRevenue: 150,
      manualRevenue: 30,
      productCosts: 28,
      savedProductCosts: 20,
      estimatedProductCosts: 8,
      operatingExpenses: 10,
      baseWages: 15,
      overtimeCosts: 5,
      advances: 7,
      outstandingDebts: 40,
      approvedPurchases: 60,
      operationalResult: 122,
      averageOrderValue: 75,
    });
  });
});
