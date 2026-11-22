import { describe, expect, it } from 'vitest';
import {
  dailyFixedOverhead,
  foodCostPercent,
  fullUnitCost,
  monthlyOverheadTotal,
  netProfitPerItem,
  overheadPerUnit,
  rateFoodCost,
  suggestedSalePrice,
  summarizeItemCost,
  type OverheadSettings,
} from './overhead-costing';

const settings: OverheadSettings = {
  rent: 8000,
  labor: 0,
  electricity: 1500,
  water: 300,
  internet: 200,
  other: 1000,
  expectedMonthlyUnits: 2200,
};

describe('overhead costing', () => {
  it('sums the monthly fixed costs', () => {
    expect(monthlyOverheadTotal(settings)).toBe(11000);
  });

  it('spreads the monthly total over the expected units', () => {
    expect(overheadPerUnit(settings)).toBe(5);
  });

  it('returns no per-unit overhead until an expected unit count is set', () => {
    expect(overheadPerUnit({ ...settings, expectedMonthlyUnits: 0 })).toBeUndefined();
    expect(overheadPerUnit({ ...settings, expectedMonthlyUnits: -10 })).toBeUndefined();
  });

  it('allocates a daily fixed share for the daily view', () => {
    expect(dailyFixedOverhead({ ...settings, rent: 9000, electricity: 0, water: 0, internet: 0, other: 0 })).toBe(300);
    expect(() => dailyFixedOverhead(settings, 0)).toThrow();
  });

  it('builds the full unit cost from materials and overhead', () => {
    expect(fullUnitCost(12.5, 5)).toBe(17.5);
    expect(fullUnitCost(12.5, undefined)).toBe(12.5);
  });

  it('computes the food-cost percentage against the sale price', () => {
    expect(foodCostPercent(15, 50)).toBe(30);
    expect(foodCostPercent(15, 0)).toBeUndefined();
  });

  it('rates food cost with the calculator thresholds (30% / 35%)', () => {
    expect(rateFoodCost(30)).toBe('ok');
    expect(rateFoodCost(34.9)).toBe('warning');
    expect(rateFoodCost(35)).toBe('warning');
    expect(rateFoodCost(35.1)).toBe('high');
  });

  it('suggests a sale price from the target food-cost percentage', () => {
    // Matches the calculator: price = material cost / (target / 100).
    expect(suggestedSalePrice(15, 30)).toBe(50);
    expect(suggestedSalePrice(15, 0)).toBeUndefined();
  });

  it('computes net profit per item after materials and overhead', () => {
    expect(netProfitPerItem(50, 15, 5)).toBe(30);
    expect(netProfitPerItem(50, 15, undefined)).toBe(35);
  });

  it('summarizes an item like the calculator card does', () => {
    // Latte at 50 ج with 15 ج of materials and 2200 expected units/month.
    expect(summarizeItemCost({
      salePrice: 50,
      materialCost: 15,
      settings,
      targetFoodCostPercent: 30,
    })).toEqual({
      materialCost: 15,
      overheadShare: 5,
      fullCost: 20,
      foodCostPercent: 30,
      foodCostRating: 'ok',
      grossProfit: 35,
      netProfit: 30,
      suggestedSalePrice: 50,
    });
  });
});
