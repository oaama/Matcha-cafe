import { describe, expect, it, vi } from 'vitest';
import { calculateOrderTotal, SERVICE_FEE_RATE, TAX_RATE, validateProductSelections } from './store';
import { menuSeed } from './menu-data';
import { createStaffSessionToken, hasStaffCredentials, isValidStaffSessionToken, verifyStaffCredentials } from './staff-auth';
import { endShift, getActiveShift, listShifts, reactivateShift, startShift } from './shift-repository';
import { formatShiftDuration, getShiftDurationMinutes, getShiftBusinessDate, getShiftsCoveringTimestamp, shiftEndedToday } from './shift-time';
import { getShiftReportOrders } from './shift-attribution';
import { clearMockOrders, getOrderRepository } from './order-repository';
import { clearMockExpenses, createExpense, listExpenses } from './expense-repository';
import { clearMockPricingSettings, getPricingSettings, updatePricingSettings } from './pricing-settings';
import { clearMockCatalog, getCatalog, saveCatalog } from './catalog-repository';
import { catalogSchema, createOrderSchema } from './validation';
import { adjustInventory, clearMockInventory, getInventoryData, saveInventorySettings } from './inventory-repository';
import { createStaffPasswordHash, verifyStaffPassword } from './staff-account-repository';
import { isAuthorizedCronRequest } from './cron-auth';
import { buildCustomerDirectory, clearMockCustomerFollowUps, normalizeCustomerPhone, updateCustomerFollowUp } from './customer-repository';
import type { OrderRecord } from './types';

describe('catalog validation', () => {
  it('accepts valid matcha selections', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    const result = validateProductSelections(product, [{ groupId: 'sugar', optionIndex: 0 }, { groupId: 'ice', optionIndex: 1 }]);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid options', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    const result = validateProductSelections(product, [{ groupId: 'unknown', optionIndex: 0 }]);
    expect(result.valid).toBe(false);
  });

  it('calculates totals with option surcharges', () => {
    const totals = calculateOrderTotal([
      { productId: 'matcha-2', quantity: 2, customizations: [{ groupId: 'extras', optionIndex: 0 }, { groupId: 'ice', optionIndex: 1 }] },
    ]);
    expect(totals.subtotal).toBeGreaterThan(0);
    expect(totals.total).toBe(totals.subtotal);
    expect(totals.serviceFee).toBe(0);
    expect(totals.tax).toBe(0);
  });

  it('calculates rounded service and tax from subtotal including add-ons', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    const totals = calculateOrderTotal([
      { productId: product.id, quantity: 2, customizations: [{ groupId: 'extras', optionIndex: 0 }] },
    ], { serviceEnabled: true, serviceRate: 10, taxEnabled: true, taxRate: 5 });
    expect(totals.subtotal).toBe((product.price + 20) * 2);
    expect(totals.serviceFee).toBe(Math.round(totals.subtotal * SERVICE_FEE_RATE * 100) / 100);
    expect(totals.tax).toBe(Math.round((totals.subtotal + totals.serviceFee) * TAX_RATE * 100) / 100);
    expect(totals.total).toBe(totals.subtotal + totals.serviceFee + totals.tax);
  });

  it('supports service and tax being enabled independently with custom rates', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    const items = [{ productId: product.id, quantity: 1, customizations: [] }];
    const serviceOnly = calculateOrderTotal(items, {
      serviceEnabled: true,
      serviceRate: 7.5,
      taxEnabled: false,
      taxRate: 5,
    });
    const taxOnly = calculateOrderTotal(items, {
      serviceEnabled: false,
      serviceRate: 10,
      taxEnabled: true,
      taxRate: 14,
    });

    expect(serviceOnly.serviceFee).toBe(product.price * 0.075);
    expect(serviceOnly.tax).toBe(0);
    expect(taxOnly.serviceFee).toBe(0);
    expect(taxOnly.tax).toBe(product.price * 0.14);
  });

  it('uses an active offer price when calculating an order total', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    const discounted = { ...product, offerPrice: product.price - 10 };
    const totals = calculateOrderTotal(
      [{ productId: product.id, quantity: 2, customizations: [] }],
      undefined,
      [discounted],
    );
    expect(totals.subtotal).toBe(discounted.offerPrice! * 2);
    expect(totals.total).toBe(totals.subtotal);
  });

  it('accepts multiple distinct add-ons and rejects a duplicate option', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    expect(validateProductSelections(product, [
      { groupId: 'sugar', optionIndex: 0 },
      { groupId: 'ice', optionIndex: 0 },
      { groupId: 'extras', optionIndex: 0 },
      { groupId: 'extras', optionIndex: 1 },
    ]).valid).toBe(true);
    expect(validateProductSelections(product, [
      { groupId: 'sugar', optionIndex: 0 },
      { groupId: 'ice', optionIndex: 0 },
      { groupId: 'extras', optionIndex: 0 },
      { groupId: 'extras', optionIndex: 0 },
    ]).valid).toBe(false);
  });

  it('accepts required groups with a default option when no explicit selection is sent', () => {
    const product = menuSeed.products.find((item) => item.id === 'matcha-2')!;
    expect(validateProductSelections(product, []).valid).toBe(true);
  });

  it('includes default option prices in totals when the selection is omitted', () => {
    const group = {
      id: 'default-price', ar: 'الحجم', en: 'Size', required: true, multi: false,
      options: [
        { ar: 'عادي', en: 'Regular', price: 7, default: true },
        { ar: 'كبير', en: 'Large', price: 5 },
      ],
    };
    const product = { ...menuSeed.products[0], groups: ['default-price'] };
    const totals = calculateOrderTotal([{ productId: product.id, quantity: 1, customizations: [] }], undefined, [product], { 'default-price': group });
    expect(totals.subtotal).toBe(product.price + 7);
  });
});

describe('customer follow-up', () => {
  it('requires a valid customer phone number for every order type', () => {
    const order = {
      orderType: 'TAKEAWAY' as const,
      items: [{ productId: 'matcha-2', quantity: 1, customizations: [] }],
    };
    expect(createOrderSchema.safeParse(order).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...order, customerPhone: '+20 10 1234 5678' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...order, customerPhone: 'café please' }).success).toBe(false);
    expect(normalizeCustomerPhone('010 1234 5678')).toBe('201012345678');
    expect(normalizeCustomerPhone('+20 (10) 1234-5678')).toBe('201012345678');
  });

  it('groups customer orders by normalized phone and keeps follow-up notes in mock storage', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockCustomerFollowUps();
    const firstOrder: OrderRecord = {
      id: 'customer-order-1',
      orderNumber: 'M-FIRST',
      type: 'TAKEAWAY',
      status: 'COMPLETED',
      customerName: 'عميل ماتشا',
      customerPhone: '010 1234 5678',
      createdAt: '2026-11-08T10:00:00.000Z',
      updatedAt: '2026-11-08T10:30:00.000Z',
      items: [],
      subtotal: 100,
      serviceFee: 0,
      tax: 0,
      total: 100,
    };
    const secondOrder: OrderRecord = {
      ...firstOrder,
      id: 'customer-order-2',
      orderNumber: 'M-SECOND',
      status: 'NEW',
      customerPhone: '+20 10 1234 5678',
      customerAddress: 'شارع النيل',
      createdAt: '2026-11-09T10:00:00.000Z',
      updatedAt: '2026-11-09T10:00:00.000Z',
      total: 150,
    };

    try {
      const [customer] = buildCustomerDirectory([firstOrder, secondOrder]);
      expect(customer).toMatchObject({
        phoneKey: '201012345678',
        name: 'عميل ماتشا',
        address: 'شارع النيل',
        orderCount: 2,
        completedOrderCount: 1,
        totalSpent: 100,
        lastOrderNumber: 'M-SECOND',
        followUpStatus: 'NEW',
      });

      const saved = await updateCustomerFollowUp(customer.phoneKey, {
        status: 'FOLLOW_UP',
        note: 'يرغب في متابعة العروض',
      }, new Date('2026-11-09T11:00:00.000Z'));
      expect(buildCustomerDirectory([firstOrder, secondOrder], [saved])[0]).toMatchObject({
        followUpStatus: 'FOLLOW_UP',
        note: 'يرغب في متابعة العروض',
      });
      const contacted = await updateCustomerFollowUp(customer.phoneKey, { markContacted: true }, new Date('2026-11-09T12:00:00.000Z'));
      expect(contacted).toMatchObject({
        status: 'CONTACTED',
        note: 'يرغب في متابعة العروض',
        lastContactedAt: '2026-11-09T12:00:00.000Z',
      });
    } finally {
      clearMockCustomerFollowUps();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });
});

describe('shift tracking', () => {
  it('calculates elapsed whole minutes from server timestamps for active and ended shifts', () => {
    const now = Date.parse('2026-11-09T12:03:59.000Z');
    expect(getShiftDurationMinutes({ startedAt: '2026-11-09T12:00:00.000Z' }, now)).toBe(3);
    expect(getShiftDurationMinutes({ startedAt: '2026-11-09T12:00:00.000Z', endedAt: '2026-11-09T12:02:59.000Z' }, now)).toBe(2);
    expect(getShiftDurationMinutes({ startedAt: 'invalid' }, now)).toBeNull();
    expect(formatShiftDuration(45)).toBe('45 دقيقة');
    expect(formatShiftDuration(60)).toBe('ساعة');
    expect(formatShiftDuration(125)).toBe('ساعتان و5 دقائق');
    expect(formatShiftDuration(405)).toBe('6 ساعات و45 دقيقة');
    expect(getShiftBusinessDate('2026-11-09T21:59:00.000Z')).toBe('2026-11-09');
    expect(getShiftBusinessDate('2026-11-09T22:00:00.000Z')).toBe('2026-11-10');
    expect(shiftEndedToday({ endedAt: '2026-11-09T21:59:00.000Z' }, Date.parse('2026-11-09T18:00:00.000Z'))).toBe(true);
    const shifts = [
      { id: 'shift-a', employeeId: 'employee-a', username: 'Employee A', shiftType: 'DAY' as const, startedAt: '2026-11-09T08:00:00.000Z', endedAt: '2026-11-09T16:00:00.000Z' },
      { id: 'shift-b', employeeId: 'employee-b', username: 'Employee B', shiftType: 'DAY' as const, startedAt: '2026-11-09T12:00:00.000Z', endedAt: '2026-11-09T20:00:00.000Z' },
    ];
    expect(getShiftsCoveringTimestamp(shifts, '2026-11-09T10:00:00.000Z').map((shift) => shift.id)).toEqual(['shift-a']);
    expect(getShiftsCoveringTimestamp(shifts, '2026-11-09T14:00:00.000Z').map((shift) => shift.id)).toEqual(['shift-a', 'shift-b']);
    expect(getShiftsCoveringTimestamp([
      { id: 'active', employeeId: 'employee-c', username: 'Employee C', shiftType: 'NIGHT', startedAt: '2026-11-09T20:00:00.000Z' },
    ], '2026-11-09T21:00:00.000Z').map((shift) => shift.id)).toEqual(['active']);
    const report = getShiftReportOrders([
      { id: 'linked', status: 'COMPLETED' as const, shiftId: 'shift-a', updatedAt: '2026-11-09T10:00:00.000Z' },
      { id: 'legacy', status: 'COMPLETED' as const, updatedAt: '2026-11-09T10:00:00.000Z' },
      { id: 'known-employee-legacy', status: 'COMPLETED' as const, employeeId: 'employee-a', updatedAt: '2026-11-09T14:00:00.000Z' },
      { id: 'ambiguous', status: 'COMPLETED' as const, updatedAt: '2026-11-09T14:00:00.000Z' },
      { id: 'other-employee', status: 'COMPLETED' as const, employeeId: 'employee-b', updatedAt: '2026-11-09T10:00:00.000Z' },
      { id: 'open', status: 'NEW' as const, updatedAt: '2026-11-09T10:00:00.000Z' },
    ], shifts[0], shifts);
    expect(report.orders.map((order) => order.id)).toEqual(['linked', 'legacy', 'known-employee-legacy']);
    expect(report.unattributedOrderCount).toBe(1);
  });

  it('creates separate shift records and ends the active one with a duration', async () => {
    const store = (globalThis as { matchaMockShiftStore?: { shifts: Array<{ employeeId: string }> } }).matchaMockShiftStore ??= { shifts: [] };
    store.shifts = [];

    const first = await startShift(
      { employeeId: 'employee-a', username: 'Employee A', shiftType: 'DAY' },
      new Date('2026-11-09T08:00:00.000Z'),
    );
    const second = await startShift(
      { employeeId: 'employee-b', username: 'Employee B', shiftType: 'NIGHT' },
      new Date('2026-11-09T08:00:00.000Z'),
    );
    const list = await listShifts();

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(list.length).toBe(2);

    const ended = await endShift('employee-a', new Date('2026-11-09T14:45:00.000Z'));
    expect(ended).not.toBeNull();
    expect(ended?.endedAt).toBeDefined();
    expect(typeof ended?.totalMinutes).toBe('number');
    expect((await listShifts()).some((shift) => shift.employeeId === 'employee-a' && shift.endedAt)).toBe(true);

    const sameDayShift = await startShift(
      { employeeId: 'employee-a', username: 'Employee A', shiftType: 'DAY' },
      new Date('2026-11-09T16:00:00.000Z'),
    );
    expect(sameDayShift.created).toBe(false);
    expect(sameDayShift.shift).toBeNull();
    expect(sameDayShift.completedToday).toBe(true);

    const nextShift = await startShift(
      { employeeId: 'employee-a', username: 'Employee A', shiftType: 'DAY' },
      new Date('2026-11-10T08:00:00.000Z'),
    );
    expect(nextShift.created).toBe(true);
    if (!first.shift || !nextShift.shift) throw new Error('Expected shifts to be created');
    expect(nextShift.shift.id).not.toBe(first.shift.id);
    expect((await listShifts('employee-a')).map((shift) => shift.id)).toEqual([nextShift.shift.id, first.shift.id]);
  });

  it('lets an admin reactivate the same shift without counting the closed gap as work', async () => {
    const store = (globalThis as { matchaMockShiftStore?: { shifts: Array<{ employeeId: string }> } }).matchaMockShiftStore ??= { shifts: [] };
    store.shifts = [];

    const started = await startShift(
      { employeeId: 'employee-restore', username: 'Employee Restore', shiftType: 'NIGHT' },
      new Date('2026-11-09T08:00:00.000Z'),
    );
    if (!started.shift) throw new Error('Expected initial shift to start');

    const ended = await endShift('employee-restore', new Date('2026-11-09T14:45:00.000Z'));
    expect(ended?.totalMinutes).toBe(405);

    const restored = await reactivateShift(started.shift.id, new Date('2026-11-09T15:00:00.000Z'));
    expect(restored.shift).toMatchObject({
      id: started.shift.id,
      shiftType: 'NIGHT',
      startedAt: '2026-11-09T08:00:00.000Z',
      periods: [
        { startedAt: '2026-11-09T08:00:00.000Z', endedAt: '2026-11-09T14:45:00.000Z' },
        { startedAt: '2026-11-09T15:00:00.000Z' },
      ],
    });
    expect(restored.shift?.endedAt).toBeUndefined();
    expect(getShiftDurationMinutes(restored.shift!, Date.parse('2026-11-09T16:00:00.000Z'))).toBe(465);
    expect(getShiftsCoveringTimestamp([restored.shift!], '2026-11-09T14:50:00.000Z')).toHaveLength(0);
    expect(getShiftsCoveringTimestamp([restored.shift!], '2026-11-09T15:30:00.000Z')).toHaveLength(1);
    expect(await getActiveShift('employee-restore')).toMatchObject({ id: started.shift.id });
    expect((await listShifts('employee-restore')).map((shift) => shift.id)).toEqual([started.shift.id]);

    const conflict = await reactivateShift(started.shift.id, new Date('2026-11-10T08:00:00.000Z'));
    expect(conflict).toMatchObject({ shift: null, reason: 'already-active' });
    expect(await endShift('employee-restore', new Date('2026-11-09T17:00:00.000Z'))).toMatchObject({ totalMinutes: 525 });
    expect(await reactivateShift(started.shift.id, new Date('2026-11-10T08:00:00.000Z')))
      .toMatchObject({ shift: null, reason: 'not-ended-today' });
  });
});

describe('mock order repository', () => {
  it('creates, lists, de-duplicates, and updates local mock orders', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockOrders();
    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: 'mock-order-test',
      orderNumber: 'M-TEST',
      type: 'DINE_IN',
      status: 'NEW',
      tableNumber: '7',
      createdAt: now,
      updatedAt: now,
      items: [],
      subtotal: 100,
      serviceFee: 10,
      tax: 5.5,
      total: 115.5,
    };
    const repository = getOrderRepository();

    try {
      expect(await repository.create(order, 'test-idempotency')).toEqual({ order, created: true });
      expect(await repository.create({ ...order, id: 'duplicate' }, 'test-idempotency')).toEqual({ order, created: false });
      expect((await repository.list()).map((item) => item.id)).toEqual([order.id]);
      expect(await repository.updateStatus(order.id, 'NEW', 'PREPARING', now)).toMatchObject({ status: 'PREPARING' });
      expect(await repository.updateStatus(order.id, 'PREPARING', 'COMPLETED', now, {
        shiftId: 'shift-a',
        employeeId: 'employee-a',
        employeeName: 'Employee A',
      })).toMatchObject({ status: 'COMPLETED', shiftId: 'shift-a', employeeId: 'employee-a' });
      expect(await repository.getById(order.id)).toMatchObject({ status: 'COMPLETED', shiftId: 'shift-a' });
      expect(await repository.updateStatus(order.id, 'NEW', 'CANCELLED', now)).toBeNull();
    } finally {
      clearMockOrders();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });

  it('associates expenses with a single shift in mock mode', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockExpenses();
    try {
      const shiftExpense = await createExpense({
        amount: 25,
        category: 'SUPPLIES',
        description: 'مستلزمات الشيفت',
        expenseDate: '2026-11-09',
        shiftType: 'DAY',
        employeeId: 'employee-a',
        shiftId: 'shift-a',
        username: 'Employee A',
      });
      await createExpense({
        amount: 15,
        category: 'WATER',
        description: 'مياه الشيفت الثاني',
        expenseDate: '2026-11-09',
        shiftType: 'DAY',
        employeeId: 'employee-a',
        shiftId: 'shift-b',
        username: 'Employee A',
      });
      expect(await listExpenses({ shiftId: 'shift-a' })).toEqual([shiftExpense]);
    } finally {
      clearMockExpenses();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });

  it('deducts product and recipe stock once per order and restores it when cancelled', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockOrders();
    clearMockInventory();
    const product = menuSeed.products[0];
    const inventory = await getInventoryData([product]);
    const productStock = inventory.items.find((item) => item.productId === product.id)!;
    expect(productStock.trackStock).toBe(false);
    const ingredient = {
      id: 'ingredient:test-milk',
      type: 'ingredient' as const,
      name: 'لبن اختبار',
      unit: 'مل',
      quantity: 10,
      lowStockThreshold: 1,
      trackStock: true,
    };
    await saveInventorySettings([
      ...inventory.items,
      ingredient,
    ], [{ productId: product.id, ingredients: [{ itemId: ingredient.id, quantity: 2 }] }]);
    await adjustInventory(productStock.id, 3, 'رصيد افتتاحي');

    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: 'inventory-order-test',
      orderNumber: 'M-INVENTORY',
      type: 'TAKEAWAY',
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
      items: [{
        productId: product.id,
        quantity: 2,
        unitPrice: product.price,
        nameAr: product.ar,
        nameEn: product.en,
        selectedOptions: [],
      }],
      subtotal: product.price * 2,
      serviceFee: 0,
      tax: 0,
      total: product.price * 2,
    };
    const repository = getOrderRepository();

    try {
      let saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)).toMatchObject({ quantity: 3, trackStock: true });
      const created = await repository.createWithInventory(order, 'inventory-idempotency');
      expect(created.created).toBe(true);
      expect(created.order.inventoryConsumption).toEqual([
        { itemId: productStock.id, quantity: 2 },
        { itemId: ingredient.id, quantity: 4 },
      ]);
      expect(await repository.createWithInventory({ ...order, id: 'duplicate-inventory-order' }, 'inventory-idempotency')).toMatchObject({ created: false });
      saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)?.quantity).toBe(1);
      expect(saved.items.find((item) => item.id === ingredient.id)?.quantity).toBe(6);

      await repository.updateStatus(order.id, 'NEW', 'CANCELLED', now);
      saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)?.quantity).toBe(3);
      expect(saved.items.find((item) => item.id === ingredient.id)?.quantity).toBe(10);

      await saveInventorySettings(saved.items.map((item) => item.id === productStock.id ? { ...item, trackStock: false } : item), saved.recipes);
      saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)?.trackStock).toBe(true);

      await saveInventorySettings(saved.items.map((item) => item.id === ingredient.id ? { ...item, quantity: 3 } : item), saved.recipes);
      await expect(repository.createWithInventory({ ...order, id: 'insufficient-stock-order' }, 'insufficient-stock-key'))
        .rejects.toThrow('لا تكفي للطلب');
      saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)?.quantity).toBe(3);
      expect(saved.items.find((item) => item.id === ingredient.id)?.quantity).toBe(3);

      await saveInventorySettings(saved.items.map((item) => item.id === ingredient.id ? { ...item, quantity: 10 } : item), saved.recipes);
      const concurrentOrder = { ...order, id: 'concurrent-inventory-order' };
      const concurrentResults = await Promise.all([
        repository.createWithInventory(concurrentOrder, 'concurrent-inventory-key'),
        repository.createWithInventory(concurrentOrder, 'concurrent-inventory-key'),
      ]);
      expect(concurrentResults.map((result) => result.created).sort()).toEqual([false, true]);
      saved = await getInventoryData([product]);
      expect(saved.items.find((item) => item.id === productStock.id)?.quantity).toBe(1);
      expect(saved.items.find((item) => item.id === ingredient.id)?.quantity).toBe(6);
    } finally {
      clearMockOrders();
      clearMockInventory();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });
});

describe('pricing settings', () => {
  it('defaults to no additional fees and persists independent fee settings in mock mode', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockPricingSettings();

    try {
      expect(await getPricingSettings()).toEqual({
        serviceEnabled: false,
        serviceRate: 10,
        taxEnabled: false,
        taxRate: 5,
      });
      const configured = {
        serviceEnabled: true,
        serviceRate: 8.5,
        taxEnabled: false,
        taxRate: 5,
      };
      expect(await updatePricingSettings(configured)).toEqual(configured);
      expect(await getPricingSettings()).toEqual(configured);
    } finally {
      clearMockPricingSettings();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });
});

describe('catalog management', () => {
  it('validates the seeded menu and rejects products with missing categories', () => {
    const validCatalog = {
      categories: menuSeed.categories,
      products: menuSeed.products,
      groups: menuSeed.optionGroups,
    };
    expect(catalogSchema.safeParse(validCatalog).success).toBe(true);
    expect(catalogSchema.safeParse({
      ...validCatalog,
      products: [{ ...menuSeed.products[0], categoryId: 'missing-category' }],
    }).success).toBe(false);
  });

  it('saves catalog edits in the mock repository while keeping seed data isolated', async () => {
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.DATA_PROVIDER = 'mock';
    clearMockCatalog();

    try {
      const original = await getCatalog();
      const edited = {
        ...original,
        products: original.products.map((product, index) => index === 0 ? { ...product, price: product.price + 1 } : product),
      };
      await saveCatalog(edited);
      expect((await getCatalog()).products[0].price).toBe(edited.products[0].price);
      expect(menuSeed.products[0].price).not.toBe(edited.products[0].price);
    } finally {
      clearMockCatalog();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });
});

describe('staff sessions', () => {
  it('stores staff passwords as salted hashes and verifies them', async () => {
    const credentials = await createStaffPasswordHash('a-strong-password-123');
    expect(credentials.hash).not.toBe('a-strong-password-123');
    expect(await verifyStaffPassword('a-strong-password-123', credentials.salt, credentials.hash)).toBe(true);
    expect(await verifyStaffPassword('wrong-password', credentials.salt, credentials.hash)).toBe(false);
    expect(await verifyStaffPassword('a-strong-password-123', 'invalid', credentials.hash)).toBe(false);
  });

  describe('weekly order cleanup authorization', () => {
    it('requires a matching bearer secret of at least 32 characters', () => {
      const secret = 'a-cron-secret-that-is-at-least-thirty-two-characters';

      expect(isAuthorizedCronRequest(new Request('https://example.test/api/cron/clear-orders'), secret)).toBe(false);
      expect(isAuthorizedCronRequest(new Request('https://example.test/api/cron/clear-orders', {
        headers: { authorization: `Bearer ${secret}wrong` },
      }), secret)).toBe(false);
      expect(isAuthorizedCronRequest(new Request('https://example.test/api/cron/clear-orders', {
        headers: { authorization: `Bearer ${secret}` },
      }), secret)).toBe(true);
      expect(isAuthorizedCronRequest(new Request('https://example.test/api/cron/clear-orders', {
        headers: { authorization: `Bearer ${secret}` },
      }), 'short')).toBe(false);
    });
  });

  it('accepts signed sessions and rejects forged values', () => {
    const previousSecret = process.env.NEXTAUTH_SECRET;
    const previousProvider = process.env.DATA_PROVIDER;
    process.env.NEXTAUTH_SECRET = 'a-production-secret-with-at-least-32-characters';
    process.env.DATA_PROVIDER = 'mongodb';

    try {
      const token = createStaffSessionToken();
      expect(isValidStaffSessionToken(token)).toBe(true);
      expect(isValidStaffSessionToken('1')).toBe(false);
      expect(isValidStaffSessionToken(`${token}x`)).toBe(false);
    } finally {
      if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = previousSecret;
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });

  it('accepts the local demo cashier credentials without external configuration', () => {
    const previousProvider = process.env.DATA_PROVIDER;
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.DATA_PROVIDER;
    try {
      expect(verifyStaffCredentials('demo@local.test', 'demo1234')).toBe(true);
      expect(isValidStaffSessionToken(createStaffSessionToken())).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      if (previousProvider === undefined) delete process.env.DATA_PROVIDER;
      else process.env.DATA_PROVIDER = previousProvider;
    }
  });

  it('requires database-backed credential verification in MongoDB modes', () => {
    vi.stubEnv('DATA_PROVIDER', 'mongodb');
    vi.stubEnv('STAFF_EMAIL', 'cashier@example.com');
    vi.stubEnv('STAFF_PASSWORD', 'a-strong-password-123');
    vi.stubEnv('NEXTAUTH_SECRET', 'a-production-secret-with-at-least-32-characters');

    try {
      for (const nodeEnv of ['development', 'production']) {
        vi.stubEnv('NODE_ENV', nodeEnv);
        expect(hasStaffCredentials()).toBe(true);
        expect(verifyStaffCredentials('cashier@example.com', 'a-strong-password-123')).toBe(false);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
