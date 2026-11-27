import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockInventory, getInventoryData, InventoryStockError, saveInventorySettings } from './inventory-repository';
import { clearMockOrders, getOrderRepository } from './order-repository';
import { extraRecipeKey } from './extra-recipe';
import type { OrderRecord } from './types';

const item = (id: string, quantity: number, unitCost = 1) => ({ id, type: 'ingredient' as const, name: id, unit: 'جرام', unitCost, quantity, lowStockThreshold: 1, trackStock: true });
const mkOrder = (id: string, qty: number): OrderRecord => {
  const now = new Date().toISOString();
  return { id, orderNumber: `M-${id}`, type: 'TAKEAWAY', status: 'NEW', createdAt: now, updatedAt: now, subtotal: 0, serviceFee: 0, tax: 0, total: 0,
    items: [{ productId: 'latte', quantity: qty, unitPrice: 50, nameAr: 'لاتيه', nameEn: 'Latte', selectedOptions: [] }] };
};
const stock = async () => Object.fromEntries((await getInventoryData([])).items.map((i) => [i.id, i.quantity]));

describe('order -> inventory recipe flow', () => {
  beforeEach(async () => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockInventory();
    clearMockOrders();
    await saveInventorySettings([item('milk', 100), item('matcha', 20)], [{ productId: 'latte', ingredients: [{ itemId: 'milk', quantity: 10 }, { itemId: 'matcha', quantity: 2 }] }]);
  });

  it('deducts every recipe ingredient times the quantity', async () => {
    await getOrderRepository().createWithInventory(mkOrder('a', 3), 'key-a');
    expect(await stock()).toMatchObject({ milk: 70, matcha: 14 });
  });

  it('rejects an order that needs more than the stock and deducts nothing', async () => {
    await expect(getOrderRepository().createWithInventory(mkOrder('b', 11), 'key-b')).rejects.toBeInstanceOf(InventoryStockError);
    expect(await stock()).toMatchObject({ milk: 100, matcha: 20 });
  });

  it('returns the stock when the order is cancelled, and only once', async () => {
    const { order } = await getOrderRepository().createWithInventory(mkOrder('c', 2), 'key-c');
    expect(await stock()).toMatchObject({ milk: 80, matcha: 16 });
    const repo = getOrderRepository();
    await repo.updateStatus(order.id, 'NEW', 'CANCELLED', new Date().toISOString());
    expect(await stock()).toMatchObject({ milk: 100, matcha: 20 });
    await repo.updateStatus(order.id, 'CANCELLED', 'CANCELLED', new Date().toISOString());
    expect(await stock()).toMatchObject({ milk: 100, matcha: 20 });
  });

  it('deducts the extras recipe (boba) per ordered item and returns it on cancel', async () => {
    const key = extraRecipeKey('extras', 'بوبا', 'Boba');
    await saveInventorySettings([item('milk', 100), item('matcha', 20), item('pearls', 50)], [
      { productId: 'latte', ingredients: [{ itemId: 'milk', quantity: 10 }] },
      { productId: key, ingredients: [{ itemId: 'pearls', quantity: 15 }] },
    ]);
    const order = mkOrder('d', 2);
    order.items[0].selectedOptions = [{ groupId: 'extras', optionAr: 'بوبا', optionEn: 'Boba', price: 25 }];
    const { order: created } = await getOrderRepository().createWithInventory(order, 'key-d');
    expect(await stock()).toMatchObject({ milk: 80, pearls: 20 });
    await getOrderRepository().updateStatus(created.id, 'NEW', 'CANCELLED', new Date().toISOString());
    expect(await stock()).toMatchObject({ milk: 100, pearls: 50 });
    const tooMany = mkOrder('e', 4);
    tooMany.items[0].selectedOptions = order.items[0].selectedOptions;
    await expect(getOrderRepository().createWithInventory(tooMany, 'key-e')).rejects.toBeInstanceOf(InventoryStockError);
    expect(await stock()).toMatchObject({ milk: 100, pearls: 50 });
  });
});
