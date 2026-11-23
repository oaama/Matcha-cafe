import { recordActivity } from './activity-log-repository';
import { saveCatalog } from './catalog-repository';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import { updateOverheadConfig } from './overhead-settings';
import { updatePricingSettings } from './pricing-settings';

// Restoring a backup deliberately REPLACES all business data.
// Staff accounts (usernames/passwords) are never touched, so the acting
// admin can never lock themselves out by restoring an old file.

type CatalogDataInput = Parameters<typeof saveCatalog>[0];
type PricingInput = Parameters<typeof updatePricingSettings>[0];
type OverheadInput = Parameters<typeof updateOverheadConfig>[0];

export type BackupData = {
  catalog: CatalogDataInput;
  inventory: { items: unknown[]; recipes: unknown[]; movements: unknown[] };
  orders: unknown[];
  expenses: unknown[];
  manualRevenue: unknown[];
  purchaseInvoices: unknown[];
  debts: unknown[];
  payroll: unknown[];
  shifts: unknown[];
  customers: Array<Record<string, unknown>>;
  settings: { pricing: PricingInput; overhead: OverheadInput };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateBackupPayload(raw: unknown): { ok: true; data: BackupData } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'الملف ده مش نسخة احتياطية صالحة' };
  if (raw.version !== 1) return { ok: false, error: 'إصدار النسخة الاحتياطية غير مدعوم' };
  if (!isRecord(raw.catalog) || !Array.isArray(raw.catalog.categories) || !Array.isArray(raw.catalog.products)) {
    return { ok: false, error: 'النسخة ناقصة بيانات المنيو' };
  }
  if (!isRecord(raw.inventory) || !Array.isArray(raw.inventory.items) || !Array.isArray(raw.inventory.recipes) || !Array.isArray(raw.inventory.movements)) {
    return { ok: false, error: 'النسخة ناقصة بيانات المخزون' };
  }
  for (const key of ['orders', 'expenses', 'manualRevenue', 'purchaseInvoices', 'debts', 'payroll', 'shifts', 'customers'] as const) {
    if (!Array.isArray(raw[key])) return { ok: false, error: `النسخة ناقصة بيانات: ${key}` };
  }
  if (!isRecord(raw.settings) || !isRecord(raw.settings.pricing) || !isRecord(raw.settings.overhead)) {
    return { ok: false, error: 'النسخة ناقصة الإعدادات' };
  }
  const data: BackupData = {
    catalog: raw.catalog as unknown as CatalogDataInput,
    inventory: {
      items: raw.inventory.items as unknown[],
      recipes: raw.inventory.recipes as unknown[],
      movements: raw.inventory.movements as unknown[],
    },
    orders: raw.orders as unknown[],
    expenses: raw.expenses as unknown[],
    manualRevenue: raw.manualRevenue as unknown[],
    purchaseInvoices: raw.purchaseInvoices as unknown[],
    debts: raw.debts as unknown[],
    payroll: raw.payroll as unknown[],
    shifts: raw.shifts as unknown[],
    customers: raw.customers as Array<Record<string, unknown>>,
    settings: {
      pricing: raw.settings.pricing as unknown as PricingInput,
      overhead: raw.settings.overhead as unknown as OverheadInput,
    },
  };
  return { ok: true, data };
}

const purchaseKey = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('ar-EG');

function restoreMock(data: BackupData) {
  type MockStores = {
    matchaMockOrderStore?: { orders: unknown[]; idempotencyKeys?: Map<string, string>; pendingCreates?: Map<string, unknown> };
    matchaMockExpenseStore?: { expenses: unknown[] };
    matchaMockRevenueStore?: { records: unknown[] };
    matchaMockPurchaseStore?: { invoices: unknown[] };
    matchaMockDebtStore?: { debts: unknown[] };
    matchaMockShiftStore?: { shifts: unknown[] };
    matchaMockPayrollStore?: { records: unknown[] };
    matchaMockInventory?: { items: unknown[]; recipes: unknown[]; movements: unknown[] };
    matchaMockCustomerStore?: { followUps: Map<string, Record<string, unknown>> };
  };
  const g = globalThis as unknown as MockStores;
  if (g.matchaMockOrderStore) {
    g.matchaMockOrderStore.orders = structuredClone(data.orders);
    g.matchaMockOrderStore.idempotencyKeys?.clear?.();
    g.matchaMockOrderStore.pendingCreates?.clear?.();
  }
  if (g.matchaMockExpenseStore) g.matchaMockExpenseStore.expenses = structuredClone(data.expenses);
  if (g.matchaMockRevenueStore) g.matchaMockRevenueStore.records = structuredClone(data.manualRevenue);
  if (g.matchaMockPurchaseStore) g.matchaMockPurchaseStore.invoices = structuredClone(data.purchaseInvoices);
  if (g.matchaMockDebtStore) g.matchaMockDebtStore.debts = structuredClone(data.debts);
  if (g.matchaMockShiftStore) g.matchaMockShiftStore.shifts = structuredClone(data.shifts);
  if (g.matchaMockPayrollStore) g.matchaMockPayrollStore.records = structuredClone(data.payroll);
  if (g.matchaMockInventory) {
    g.matchaMockInventory.items = structuredClone(data.inventory.items);
    g.matchaMockInventory.recipes = structuredClone(data.inventory.recipes);
    g.matchaMockInventory.movements = structuredClone(data.inventory.movements);
  }
  if (g.matchaMockCustomerStore) {
    const followUps = g.matchaMockCustomerStore.followUps;
    followUps.clear();
    for (const customer of data.customers) {
      const key = String(customer.phoneKey ?? '');
      if (key) followUps.set(key, structuredClone(customer));
    }
  }
}

async function restoreMongo(data: BackupData) {
  const mongooseInstance = await connectToDatabase();
  const connection = mongooseInstance.connection;
  const db = connection.db!;
  const purchases = data.purchaseInvoices.map((invoice) => {
    const record = invoice as Record<string, unknown>;
    return { ...record, supplierKey: purchaseKey(record.supplier), invoiceNumberKey: purchaseKey(record.invoiceNumber) };
  });
  const asDocs = (rows: unknown[]) => rows as Array<Record<string, unknown>>;
  const collections: Array<{ name: string; docs: Array<Record<string, unknown>> }> = [
    { name: 'orders', docs: asDocs(data.orders) },
    { name: 'cafe_expenses', docs: asDocs(data.expenses) },
    { name: 'manual_revenues', docs: asDocs(data.manualRevenue) },
    { name: 'purchase_invoices', docs: purchases },
    { name: 'cafe_debts', docs: asDocs(data.debts) },
    { name: 'staff_shifts', docs: asDocs(data.shifts) },
    { name: 'staff_payroll', docs: asDocs(data.payroll) },
    { name: 'customer_follow_ups', docs: data.customers },
    { name: 'inventory_items', docs: asDocs(data.inventory.items) },
    { name: 'product_recipes', docs: asDocs(data.inventory.recipes) },
    { name: 'inventory_movements', docs: asDocs(data.inventory.movements) },
  ];
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      for (const { name, docs } of collections) {
        await db.collection(name).deleteMany({}, { session });
        if (docs.length) await db.collection(name).insertMany(docs, { session });
      }
    });
  } finally {
    await session.endSession();
  }
}

export async function restoreBackup(data: BackupData, actor: { id: string; username: string }) {
  // Settings and catalog go through their tested save paths in both modes.
  await saveCatalog(data.catalog);
  await updatePricingSettings(data.settings.pricing);
  await updateOverheadConfig(data.settings.overhead);
  if (getDataProvider() === 'mock') restoreMock(data);
  else await restoreMongo(data);
  await recordActivity({
    actorId: actor.id,
    actorName: actor.username,
    action: 'BACKUP_RESTORED',
    entityType: 'backup',
    entityId: 'restore',
    details: {
      orders: data.orders.length,
      purchases: data.purchaseInvoices.length,
      inventoryItems: data.inventory.items.length,
      staffAccountsSkipped: true,
    },
  });
  return {
    orders: data.orders.length,
    expenses: data.expenses.length,
    manualRevenue: data.manualRevenue.length,
    purchaseInvoices: data.purchaseInvoices.length,
    debts: data.debts.length,
    payroll: data.payroll.length,
    shifts: data.shifts.length,
    customers: data.customers.length,
    inventoryItems: data.inventory.items.length,
    recipes: data.inventory.recipes.length,
    movements: data.inventory.movements.length,
  };
}
