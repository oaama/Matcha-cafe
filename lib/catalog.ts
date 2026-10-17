import type { CatalogGroup, Category, Product } from './types';

export type CatalogData = {
  categories: Category[];
  products: Product[];
  groups: Record<string, CatalogGroup>;
};
