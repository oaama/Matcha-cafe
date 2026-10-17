import type { Product } from './types';

export type PricingSettings = {
  serviceEnabled: boolean;
  serviceRate: number;
  taxEnabled: boolean;
  taxRate: number;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  serviceEnabled: false,
  serviceRate: 10,
  taxEnabled: false,
  taxRate: 5,
};

export function getProductPrice(product: Product) {
  return product.offerPrice ?? product.price;
}
