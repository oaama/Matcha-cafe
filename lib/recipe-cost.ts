import type { InventoryItem, ProductRecipe } from './types';

export type RecipeIngredientCost = {
  itemId: string;
  quantity: number;
  unitCost?: number;
  lineCost?: number;
};

export type RecipeCost = {
  ingredients: RecipeIngredientCost[];
  totalCost?: number;
};

export function calculateRecipeCost(recipe: ProductRecipe | undefined, inventoryItems: InventoryItem[]): RecipeCost {
  if (!recipe?.ingredients.length) return { ingredients: [] };

  const itemsById = new Map(inventoryItems.map((item) => [item.id, item]));
  const ingredients = recipe.ingredients.map(({ itemId, quantity }) => {
    const unitCost = itemsById.get(itemId)?.unitCost;
    return {
      itemId,
      quantity,
      unitCost,
      lineCost: unitCost === undefined ? undefined : quantity * unitCost,
    };
  });

  if (ingredients.some((ingredient) => ingredient.lineCost === undefined)) {
    return { ingredients };
  }

  return {
    ingredients,
    totalCost: ingredients.reduce((sum, ingredient) => sum + (ingredient.lineCost ?? 0), 0),
  };
}
