// Fixed-overhead costing helpers, mirroring the standalone "حاسبة تكلفة الريسيبي"
// (recipe cost calculator) the café uses today. These cover what recipe-cost.ts
// does not: spreading fixed monthly operating costs over items, target
// food-cost percentages, and suggested sale prices.
//
// Pure functions only: no repository or UI coupling, so existing behavior is
// unchanged until a dashboard screen opts into these helpers.

export type OverheadSettings = {
  /** Monthly rent. */
  rent: number;
  /** Monthly fixed labor cost. Set to 0 when wages are tracked per shift/day instead. */
  labor: number;
  /** Monthly electricity. */
  electricity: number;
  /** Monthly water. */
  water: number;
  /** Monthly internet. */
  internet: number;
  /** Any other monthly fixed cost. */
  other: number;
  /** Expected units sold per month, used to spread the fixed costs per item. */
  expectedMonthlyUnits: number;
};

export const DEFAULT_OVERHEAD_SETTINGS: OverheadSettings = {
  rent: 0,
  labor: 0,
  electricity: 0,
  water: 0,
  internet: 0,
  other: 0,
  expectedMonthlyUnits: 0,
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Total fixed operating cost per month. */
export function monthlyOverheadTotal(settings: OverheadSettings): number {
  return roundMoney(
    settings.rent +
      settings.labor +
      settings.electricity +
      settings.water +
      settings.internet +
      settings.other,
  );
}

/**
 * Fixed cost allocated to a single sold unit (monthly total / expected units).
 * Returns undefined when no expected unit count is set, matching the
 * calculator which shows no overhead line until units are entered.
 */
export function overheadPerUnit(settings: OverheadSettings): number | undefined {
  if (!Number.isFinite(settings.expectedMonthlyUnits) || settings.expectedMonthlyUnits <= 0) {
    return undefined;
  }
  return roundMoney(monthlyOverheadTotal(settings) / settings.expectedMonthlyUnits);
}

/** Fixed cost allocated to one day (monthly total / days in month). */
export function dailyFixedOverhead(settings: OverheadSettings, daysInMonth = 30): number {
  if (!Number.isInteger(daysInMonth) || daysInMonth <= 0) {
    throw new Error('daysInMonth must be a positive integer');
  }
  return roundMoney(monthlyOverheadTotal(settings) / daysInMonth);
}

/** Full cost of one item: recipe material cost plus its overhead share. */
export function fullUnitCost(materialCost: number, perUnitOverhead: number | undefined): number {
  return roundMoney(materialCost + (perUnitOverhead ?? 0));
}

/**
 * Material (food) cost as a percentage of the sale price.
 * Returns undefined when the price is not positive.
 */
export function foodCostPercent(materialCost: number, salePrice: number): number | undefined {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return undefined;
  return roundMoney((materialCost / salePrice) * 100);
}

export type FoodCostRating = 'ok' | 'warning' | 'high';

/**
 * Traffic-light rating used by the calculator:
 * ok up to 30%, warning up to 35%, high above that.
 */
export function rateFoodCost(percent: number): FoodCostRating {
  if (percent <= 30) return 'ok';
  if (percent <= 35) return 'warning';
  return 'high';
}

/**
 * Sale price that hits the target food-cost percentage for the given
 * material cost. Returns undefined when the target is not positive.
 */
export function suggestedSalePrice(materialCost: number, targetFoodCostPercent: number): number | undefined {
  if (!Number.isFinite(targetFoodCostPercent) || targetFoodCostPercent <= 0) return undefined;
  return roundMoney(materialCost / (targetFoodCostPercent / 100));
}

/** Net profit per item after material cost and its fixed-overhead share. */
export function netProfitPerItem(
  salePrice: number,
  materialCost: number,
  perUnitOverhead: number | undefined,
): number {
  return roundMoney(salePrice - materialCost - (perUnitOverhead ?? 0));
}

export type ItemCostSummary = {
  materialCost: number;
  overheadShare?: number;
  fullCost: number;
  foodCostPercent?: number;
  foodCostRating?: FoodCostRating;
  grossProfit: number;
  netProfit: number;
  suggestedSalePrice?: number;
};

/** One-call summary for a menu item, mirroring the calculator's item card. */
export function summarizeItemCost(input: {
  salePrice: number;
  materialCost: number;
  settings: OverheadSettings;
  targetFoodCostPercent?: number;
}): ItemCostSummary {
  const overheadShare = overheadPerUnit(input.settings);
  const percent = foodCostPercent(input.materialCost, input.salePrice);
  return {
    materialCost: roundMoney(input.materialCost),
    overheadShare,
    fullCost: fullUnitCost(input.materialCost, overheadShare),
    foodCostPercent: percent,
    foodCostRating: percent === undefined ? undefined : rateFoodCost(percent),
    grossProfit: roundMoney(input.salePrice - input.materialCost),
    netProfit: netProfitPerItem(input.salePrice, input.materialCost, overheadShare),
    suggestedSalePrice:
      input.targetFoodCostPercent === undefined
        ? undefined
        : suggestedSalePrice(input.materialCost, input.targetFoodCostPercent),
  };
}
