import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMockInventory,
  deleteInventoryItem,
  getInventoryData,
  InventoryItemNotFoundError,
  saveInventorySettings,
} from './inventory-repository';

const milk = {
  id: 'ingredient:milk',
  type: 'ingredient' as const,
  name: 'لبن',
  unit: 'مل',
  quantity: 100,
  lowStockThreshold: 10,
  trackStock: true,
};
const matcha = {
  id: 'ingredient:matcha',
  type: 'ingredient' as const,
  name: 'ماتشا',
  unit: 'جرام',
  quantity: 50,
  lowStockThreshold: 5,
  trackStock: true,
};

describe('mock deleteInventoryItem', () => {
  beforeEach(async () => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockInventory();
    await saveInventorySettings([milk, matcha], [
      { productId: 'p1', ingredients: [{ itemId: milk.id, quantity: 200 }, { itemId: matcha.id, quantity: 5 }] },
      { productId: 'p2', ingredients: [{ itemId: milk.id, quantity: 150 }] },
    ]);
  });

  it('removes the item and strips it from every recipe', async () => {
    await deleteInventoryItem(milk.id);
    const data = await getInventoryData([]);
    expect(data.items.map((item) => item.id)).toEqual([matcha.id]);
    expect(data.recipes).toEqual([
      { productId: 'p1', ingredients: [{ itemId: matcha.id, quantity: 5 }] },
    ]);
  });

  it('drops a recipe whose last line was removed', async () => {
    await deleteInventoryItem(matcha.id);
    await deleteInventoryItem(milk.id);
    const data = await getInventoryData([]);
    expect(data.items).toEqual([]);
    expect(data.recipes).toEqual([]);
  });

  it('throws when the item does not exist', async () => {
    await expect(deleteInventoryItem('ingredient:nope')).rejects.toBeInstanceOf(InventoryItemNotFoundError);
    const data = await getInventoryData([]);
    expect(data.items).toHaveLength(2);
    expect(data.recipes).toHaveLength(2);
  });
});
