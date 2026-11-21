import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockActivityLogs, listActivityLogs } from './activity-log-repository';
import { clearMockInventory, getInventoryData, saveInventorySettings } from './inventory-repository';
import {
  approvePurchaseInvoice,
  cancelPurchaseInvoice,
  clearMockPurchaseInvoices,
  createPurchaseInvoice,
  DuplicatePurchaseInvoiceError,
  listPurchaseInvoices,
  PurchaseInvoiceStateError,
  updatePurchaseInvoice,
} from './purchase-repository';

const actor = { id: 'admin-test', username: 'مدير الاختبار' };
const ingredient = {
  id: 'ingredient:test-matcha',
  type: 'ingredient' as const,
  name: 'ماتشا اختبار',
  unit: 'جرام',
  category: 'مساحيق',
  unitCost: 2,
  quantity: 10,
  lowStockThreshold: 2,
  trackStock: true,
};

describe('mock purchase invoice repository', () => {
  beforeEach(async () => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockInventory();
    clearMockPurchaseInvoices();
    clearMockActivityLogs();
    await saveInventorySettings([ingredient], []);
  });

  it('keeps drafts out of stock, approves once with weighted cost, and records the audit trail', async () => {
    const inventory = await getInventoryData([]);
    const draft = await createPurchaseInvoice({
      supplier: 'مورد الماتشا',
      invoiceNumber: ' INV-100 ',
      invoiceDate: '2026-03-01',
      items: [{ itemId: ingredient.id, quantity: 5, unitPrice: 4 }],
      notes: 'دفعة جديدة',
    }, actor, inventory.items);

    expect(draft.status).toBe('DRAFT');
    expect((await getInventoryData([])).items[0]).toMatchObject({ quantity: 10, unitCost: 2 });

    const approved = await approvePurchaseInvoice(draft.id, actor);
    expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: actor.username });
    expect((await getInventoryData([])).items[0]).toMatchObject({ quantity: 15, unitCost: 2.666667 });
    expect((await getInventoryData([])).movements[0]).toMatchObject({
      reason: 'purchase',
      referenceId: draft.id,
      performedBy: actor.username,
      previousBalance: 10,
      newBalance: 15,
    });
    await expect(approvePurchaseInvoice(draft.id, actor)).rejects.toBeInstanceOf(PurchaseInvoiceStateError);
    expect((await getInventoryData([])).items[0].quantity).toBe(15);
    expect(await listActivityLogs({ entityType: 'purchase-invoice', entityId: draft.id })).toHaveLength(2);
  });

  it('rejects duplicate supplier invoice numbers and prevents editing or cancelling approved invoices', async () => {
    const inventory = await getInventoryData([]);
    const input = {
      supplier: 'مورد الماتشا',
      invoiceNumber: 'M-44',
      invoiceDate: '2026-03-04',
      items: [{ itemId: ingredient.id, quantity: 1, unitPrice: 3 }],
    };
    const draft = await createPurchaseInvoice(input, actor, inventory.items);
    await expect(createPurchaseInvoice({
      ...input,
      supplier: '  مورد الماتشا ',
      invoiceNumber: ' m-44 ',
    }, actor, inventory.items)).rejects.toBeInstanceOf(DuplicatePurchaseInvoiceError);

    const changed = { ...input, invoiceNumber: 'M-45' };
    expect((await updatePurchaseInvoice(draft.id, changed, actor, inventory.items)).invoiceNumber).toBe('M-45');
    await approvePurchaseInvoice(draft.id, actor);
    await expect(updatePurchaseInvoice(draft.id, input, actor, inventory.items)).rejects.toBeInstanceOf(PurchaseInvoiceStateError);
    await expect(cancelPurchaseInvoice(draft.id, actor)).rejects.toThrow('لا يمكن إلغاء فاتورة معتمدة');
    expect(await listPurchaseInvoices({ supplier: 'الماتشا', status: 'APPROVED', from: '2026-03-04', to: '2026-03-04' })).toHaveLength(1);
  });

  it('cancels drafts without changing stock', async () => {
    const inventory = await getInventoryData([]);
    const draft = await createPurchaseInvoice({
      supplier: 'مورد',
      invoiceNumber: 'C-1',
      invoiceDate: '2026-03-05',
      items: [{ itemId: ingredient.id, quantity: 4, unitPrice: 1.5 }],
    }, actor, inventory.items);

    expect((await cancelPurchaseInvoice(draft.id, actor)).status).toBe('CANCELLED');
    expect((await getInventoryData([])).items[0]).toMatchObject({ quantity: 10, unitCost: 2 });
  });
});
