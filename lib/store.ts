import { menuSeed, optionGroups } from './menu-data';
import { OrderStatus, Product } from './types';
import { DEFAULT_PRICING_SETTINGS, getProductPrice, type PricingSettings } from './pricing';
import type { CatalogGroup } from './types';

const catalogProducts = menuSeed.products;
const catalogCategories = menuSeed.categories;
export const SERVICE_FEE_RATE = 0.1;
export const TAX_RATE = 0.05;

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function getCatalogProducts() {
  return catalogProducts;
}

export function getCatalogCategories() {
  return catalogCategories;
}

export function getCatalogGroupMap() {
  return optionGroups;
}

export function calculateOrderTotal(
  items: Array<{ productId: string; quantity: number; customizations: Array<{ groupId: string; optionIndex: number }> }>,
  pricing: PricingSettings = DEFAULT_PRICING_SETTINGS,
  products: Product[] = getCatalogProducts(),
  groups: Record<string, CatalogGroup> = optionGroups,
) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  let subtotal = 0;

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    let itemTotal = getProductPrice(product) * item.quantity;
    for (const customization of item.customizations) {
      const group = groups[customization.groupId];
      const option = group?.options[customization.optionIndex];
      if (group && option) {
        itemTotal += option.price * item.quantity;
      }
    }
    subtotal += itemTotal;
  }

  const serviceFee = pricing.serviceEnabled ? roundMoney(subtotal * pricing.serviceRate / 100) : 0;
  const tax = pricing.taxEnabled ? roundMoney((subtotal + serviceFee) * pricing.taxRate / 100) : 0;
  return { subtotal: roundMoney(subtotal), serviceFee, tax, total: roundMoney(subtotal + serviceFee + tax) };
}

export function validateProductSelections(
  product: Product,
  customizations: Array<{ groupId: string; optionIndex: number }>,
  groupMap: Record<string, CatalogGroup> = getCatalogGroupMap(),
) {
  const selected = new Map<string, number[]>();

  for (const customization of customizations) {
    const group = groupMap[customization.groupId];
    const option = group?.options[customization.optionIndex];
    if (!group || !option) {
      return { valid: false, error: `Invalid option for ${product.ar}` };
    }

    if (!product.groups.includes(customization.groupId)) {
      return { valid: false, error: `Option group not available for ${product.ar}` };
    }

    const current = selected.get(customization.groupId) ?? [];
    if (current.includes(customization.optionIndex)) {
      return { valid: false, error: `Duplicate option for ${group.ar}` };
    }
    current.push(customization.optionIndex);
    selected.set(customization.groupId, current);
  }

  for (const groupId of product.groups) {
    const group = groupMap[groupId];
    if (!group) continue;
    const selectedIndexes = selected.get(groupId) ?? [];
    if (group.required && selectedIndexes.length === 0) {
      return { valid: false, error: `Missing required option: ${group.ar}` };
    }
    if (!group.multi && selectedIndexes.length > 1) {
      return { valid: false, error: `Choose only one option for ${group.ar}` };
    }
  }

  return { valid: true };
}

export function getOrderStatusLabel(status: OrderStatus) {
  const map: Record<OrderStatus, string> = {
    NEW: 'New',
    PREPARING: 'Preparing',
    READY: 'Ready',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return map[status];
}

export function applyOrderStatusTransition(current: OrderStatus, next: OrderStatus) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    NEW: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['COMPLETED'],
    CANCELLED: ['CANCELLED'],
  };

  const transitions = allowed[current] ?? [];
  if (!transitions.includes(next)) {
    return false;
  }
  return true;
}
