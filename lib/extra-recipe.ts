import type { CatalogGroup } from './types';

export const EXTRA_RECIPE_PREFIX = 'extra:';

/** Recipe key for an order option (boba, wafer...), stored in the same recipes list as products. */
export function extraRecipeKey(groupId: string, optionAr: string, optionEn: string) {
  return `${EXTRA_RECIPE_PREFIX}${groupId}:${optionEn || optionAr}`;
}

export function isExtraRecipeKey(productId: string) {
  return productId.startsWith(EXTRA_RECIPE_PREFIX);
}

export function extraRecipeKeys(groups: Record<string, CatalogGroup>) {
  return new Set(Object.values(groups).flatMap((group) => group.options.map((option) => extraRecipeKey(group.id, option.ar, option.en))));
}
