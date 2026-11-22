import { getProductPrice } from './pricing';
import { calculateRecipeCost } from './recipe-cost';
import type { InventoryItem, Product, ProductRecipe } from './types';

export const RECIPE_LOW_STOCK_THRESHOLD = 5;

function isStockTracked(item: InventoryItem) {
  return item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0;
}

export type RecipeAvailabilityRow = {
  product: Product;
  hasRecipe: boolean;
  status: 'no-recipe' | 'incomplete' | 'untracked' | 'tracked';
  availableServings?: number;
  isLowStock: boolean;
  recipeCost?: number;
  foodCostPercent?: number;
  bottleneck?: string;
};

export function calculateRecipeAvailability(
  products: Product[],
  inventoryItems: InventoryItem[],
  recipes: ProductRecipe[],
  lowStockThreshold = RECIPE_LOW_STOCK_THRESHOLD,
) {
  const itemsById = new Map(inventoryItems.map((item) => [item.id, item]));
  const recipesByProductId = new Map(recipes.map((recipe) => [recipe.productId, recipe]));
  const productStockById = new Map(
    inventoryItems
      .filter((item) => item.type === 'product' && item.productId)
      .map((item) => [item.productId!, item]),
  );

  const rows: RecipeAvailabilityRow[] = products.map((product) => {
    const recipe = recipesByProductId.get(product.id);
    const hasRecipe = Boolean(recipe?.ingredients.length);
    const recipeCost = calculateRecipeCost(recipe, inventoryItems).totalCost;
    const price = getProductPrice(product);
    const foodCostPercent = recipeCost !== undefined && price > 0
      ? recipeCost / price * 100
      : undefined;
    const productStock = productStockById.get(product.id);
    const trackedProductStock = productStock && isStockTracked(productStock) ? productStock : undefined;

    if (!hasRecipe) {
      const availableServings = trackedProductStock?.quantity;
      return {
        product,
        hasRecipe: false,
        status: 'no-recipe',
        availableServings,
        isLowStock: availableServings !== undefined && availableServings <= lowStockThreshold,
        recipeCost,
        foodCostPercent,
        bottleneck: availableServings === undefined ? undefined : productStock?.name,
      };
    }

    const ingredientItems = recipe!.ingredients.map(({ itemId, quantity }) => {
      const item = itemsById.get(itemId);
      if (!item || item.type !== 'ingredient' || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { item, quantity };
    });

    if (ingredientItems.some((entry) => entry === null)) {
      return {
        product,
        hasRecipe: true,
        status: 'incomplete',
        isLowStock: false,
        recipeCost,
        foodCostPercent,
      };
    }

    const ingredients = ingredientItems.filter((entry) => entry !== null);
    if (ingredients.some(({ item }) => !isStockTracked(item))) {
      return {
        product,
        hasRecipe: true,
        status: 'untracked',
        isLowStock: false,
        recipeCost,
        foodCostPercent,
      };
    }

    const capacities = ingredients.map(({ item, quantity }) => ({
      servings: Math.floor((item.quantity + quantity * 1e-9) / quantity),
      name: item.name,
    }));
    if (trackedProductStock) {
      capacities.push({ servings: Math.floor(trackedProductStock.quantity + 1e-9), name: trackedProductStock.name });
    }
    const bottleneck = capacities.reduce((lowest, current) => current.servings < lowest.servings ? current : lowest);

    return {
      product,
      hasRecipe: true,
      status: 'tracked',
      availableServings: bottleneck.servings,
      isLowStock: bottleneck.servings <= lowStockThreshold,
      recipeCost,
      foodCostPercent,
      bottleneck: bottleneck.name,
    };
  });

  const configuredRecipeCount = rows.filter((row) => row.hasRecipe).length;
  return {
    rows,
    productCount: products.length,
    configuredRecipeCount,
    recipeCoveragePercent: products.length ? configuredRecipeCount / products.length * 100 : 0,
    lowStockCount: rows.filter((row) => row.isLowStock).length,
  };
}
