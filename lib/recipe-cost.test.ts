import { describe, expect, it } from 'vitest';
import { calculateRecipeCost } from './recipe-cost';
import { inventorySettingsSchema } from './validation';
import type { InventoryItem, ProductRecipe } from './types';

const ingredient: InventoryItem = {
  id: 'ingredient:milk',
  type: 'ingredient',
  name: 'Milk',
  unit: 'ml',
  unitCost: 0.02,
  quantity: 1000,
  lowStockThreshold: 100,
  trackStock: true,
};

const recipe: ProductRecipe = {
  productId: 'latte',
  ingredients: [
    { itemId: ingredient.id, quantity: 150 },
    { itemId: 'ingredient:coffee', quantity: 18 },
  ],
};

describe('recipe cost calculations', () => {
  it('calculates ingredient and total recipe costs from the current unit costs', () => {
    const coffee = { ...ingredient, id: 'ingredient:coffee', unitCost: 0.5 };

    expect(calculateRecipeCost(recipe, [ingredient, coffee])).toEqual({
      ingredients: [
        { itemId: ingredient.id, quantity: 150, unitCost: 0.02, lineCost: 3 },
        { itemId: coffee.id, quantity: 18, unitCost: 0.5, lineCost: 9 },
      ],
      totalCost: 12,
    });
    expect(calculateRecipeCost(recipe, [{ ...ingredient, unitCost: 0.03 }, coffee]).totalCost).toBe(13.5);
  });

  it('does not present an incomplete recipe cost as zero', () => {
    const result = calculateRecipeCost(recipe, [ingredient]);

    expect(result.ingredients[1]?.lineCost).toBeUndefined();
    expect(result.totalCost).toBeUndefined();
  });

  it('accepts legacy inventory records without a unit cost and rejects negative costs', () => {
    const base = {
      id: ingredient.id,
      type: ingredient.type,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: ingredient.quantity,
      lowStockThreshold: ingredient.lowStockThreshold,
      trackStock: ingredient.trackStock,
    };

    expect(inventorySettingsSchema.safeParse({ items: [base], recipes: [] }).success).toBe(true);
    expect(inventorySettingsSchema.safeParse({ items: [{ ...base, unitCost: -1 }], recipes: [] }).success).toBe(false);
  });
});
