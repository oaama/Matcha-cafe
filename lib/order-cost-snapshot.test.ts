import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockInventory, getInventoryData, saveInventorySettings } from './inventory-repository';
import { clearMockOrders, getOrderRepository } from './order-repository';
import type { OrderRecord } from './types';

const ingredient = {
  id: 'ingredient:cost-snapshot',
  type: 'ingredient' as const,
  name: 'ماتشا',
  unit: 'جرام',
  unitCost: 2.5,
  quantity: 10,
  lowStockThreshold: 1,
  trackStock: true,
};

describe('order cost snapshots', () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockInventory();
    clearMockOrders();
  });

  it('stores the cost of the inventory consumed by a new order without changing its sale total', async () => {
    await saveInventorySettings([ingredient], [{
      productId: 'test-matcha-latte',
      ingredients: [{ itemId: ingredient.id, quantity: 2 }],
    }]);
    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: 'cost-snapshot-order',
      orderNumber: 'M-COST',
      type: 'TAKEAWAY',
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
      items: [{
        productId: 'test-matcha-latte',
        quantity: 1,
        unitPrice: 75,
        nameAr: 'لاتيه ماتشا',
        nameEn: 'Matcha Latte',
        selectedOptions: [],
      }],
      subtotal: 75,
      serviceFee: 0,
      tax: 0,
      total: 75,
    };

    const result = await getOrderRepository().createWithInventory(order, 'cost-snapshot-key');
    expect(result.order).toMatchObject({ total: 75, inventoryCostSnapshot: 5 });
    expect((await getInventoryData([])).items[0].quantity).toBe(8);
    expect(await getOrderRepository().createWithInventory(order, 'cost-snapshot-key')).toMatchObject({ created: false });
    expect((await getInventoryData([])).items[0].quantity).toBe(8);
  });

  it('leaves the cost snapshot unset when a consumed ingredient has no recorded unit cost', async () => {
    await saveInventorySettings([{ ...ingredient, unitCost: undefined }], [{
      productId: 'test-matcha-latte',
      ingredients: [{ itemId: ingredient.id, quantity: 2 }],
    }]);
    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: 'uncosted-order',
      orderNumber: 'M-UNCOSTED',
      type: 'TAKEAWAY',
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
      items: [{
        productId: 'test-matcha-latte',
        quantity: 1,
        unitPrice: 75,
        nameAr: 'لاتيه ماتشا',
        nameEn: 'Matcha Latte',
        selectedOptions: [],
      }],
      subtotal: 75,
      serviceFee: 0,
      tax: 0,
      total: 75,
    };

    const result = await getOrderRepository().createWithInventory(order);
    expect(result.order.inventoryCostSnapshot).toBeUndefined();
    expect(result.order.total).toBe(75);
  });
});
