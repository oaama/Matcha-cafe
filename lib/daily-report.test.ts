import { describe, expect, it } from 'vitest';
import { computeDailyReport } from './daily-report';

describe('daily report', () => {
  it('nets revenue against costs, expenses, wages and fixed overhead', () => {
    // Matches the calculator's يومية line: net = revenue - materials - expenses - wages - fixed share.
    const report = computeDailyReport({
      date: '2026-11-23',
      ordersRevenue: 1500,
      orderCount: 30,
      manualRevenue: 200,
      productCosts: 450,
      uncostedOrderCount: 0,
      expenses: 100,
      wages: 250,
      fixedOverhead: 300,
      itemSales: [{ name: 'لاتيه', quantity: 10, revenue: 500, cost: 150 }],
    });
    expect(report.totalRevenue).toBe(1700);
    expect(report.net).toBe(600);
  });

  it('can go negative on a loss-making day', () => {
    const report = computeDailyReport({
      date: '2026-11-23',
      ordersRevenue: 100,
      orderCount: 2,
      manualRevenue: 0,
      productCosts: 60,
      uncostedOrderCount: 0,
      expenses: 80,
      wages: 150,
      fixedOverhead: 300,
      itemSales: [],
    });
    expect(report.totalRevenue).toBe(100);
    expect(report.net).toBe(-490);
  });
});
