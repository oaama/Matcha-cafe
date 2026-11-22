import { describe, expect, it } from 'vitest';
import { calculateRecipeAvailability, RECIPE_LOW_STOCK_THRESHOLD } from './recipe-availability';
import type { InventoryItem, Product, ProductRecipe } from './types';

const product: Product = {
  id: 'drink',
  categoryId: 'tea',
  ar: 'ماتشا',
  en: 'Matcha',
  descriptionAr: '',
  descriptionEn: '',
  price: 100,
  available: true,
  groups: [],
};

const inventoryItems: InventoryItem[] = [
  { id: 'matcha', type: 'ingredient', name: 'ماتشا', unit: 'جم', unitCost: 2, quantity: 24, lowStockThreshold: 0, trackStock: true },
  { id: 'cup', type: 'ingredient', name: 'كوب', unit: 'قطعة', unitCost: 1, quantity: 30, lowStockThreshold: 0, trackStock: true },
];

const recipe: ProductRecipe = {
  productId: product.id,
  ingredients: [
    { itemId: 'matcha', quantity: 4 },
    { itemId: 'cup', quantity: 1 },
  ],
};

describe('calculateRecipeAvailability', () => {
  it('uses the limiting ingredient, offer price, and configured low-stock threshold', () => {
    const result = calculateRecipeAvailability(
      [{ ...product, offerPrice: 80 }],
      inventoryItems,
      [recipe],
    );

    expect(result.rows[0]).toMatchObject({
      status: 'tracked',
      availableServings: 6,
      isLowStock: false,
      recipeCost: 9,
      foodCostPercent: 11.25,
      bottleneck: 'ماتشا',
    });
    expect(result.recipeCoveragePercent).toBe(100);
    expect(RECIPE_LOW_STOCK_THRESHOLD).toBe(5);
  });

  it('alerts at five servings and treats untracked ingredient stock as unknown', () => {
    const lowStock = calculateRecipeAvailability(
      [product],
      inventoryItems.map((item) => item.id === 'matcha' ? { ...item, quantity: 20 } : item),
      [recipe],
    );
    const unknown = calculateRecipeAvailability(
      [product],
      inventoryItems.map((item) => item.id === 'matcha' ? { ...item, quantity: 0, trackStock: false } : item),
      [recipe],
    );
    const legacyTracked = calculateRecipeAvailability(
      [product],
      inventoryItems.map((item) => item.id === 'matcha' ? { ...item, trackStock: false } : item),
      [recipe],
    );

    expect(lowStock.rows[0]).toMatchObject({ status: 'tracked', availableServings: 5, isLowStock: true });
    expect(unknown.rows[0]).toMatchObject({ status: 'untracked', isLowStock: false });
    expect(unknown.rows[0].availableServings).toBeUndefined();
    expect(legacyTracked.rows[0]).toMatchObject({ status: 'tracked', availableServings: 6 });
  });

  it('marks missing recipe ingredients incomplete and counts recipe coverage', () => {
    const result = calculateRecipeAvailability(
      [product, { ...product, id: 'missing-recipe' }],
      inventoryItems,
      [{ ...recipe, ingredients: [{ itemId: 'deleted-item', quantity: 1 }] }],
    );

    expect(result.rows.map((row) => row.status)).toEqual(['incomplete', 'no-recipe']);
    expect(result.configuredRecipeCount).toBe(1);
    expect(result.recipeCoveragePercent).toBe(50);
  });
});
