import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { restoreBackup, validateBackupPayload } from '@/lib/backup-restore';
import { getCatalog } from '@/lib/catalog-repository';
import { listCustomerFollowUps } from '@/lib/customer-repository';
import { listDebts } from '@/lib/debt-repository';
import { listExpenses } from '@/lib/expense-repository';
import { getInventoryData, getInventoryMovements } from '@/lib/inventory-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { listPayrollRecords } from '@/lib/payroll-repository';
import { getPricingSettings } from '@/lib/pricing-settings';
import { getOverheadConfig } from '@/lib/overhead-settings';
import { listPurchaseInvoices } from '@/lib/purchase-repository';
import { listManualRevenue } from '@/lib/revenue-repository';
import { listShifts } from '@/lib/shift-repository';
import { listStaffAccounts } from '@/lib/staff-user-repository';

const ALL_TIME = { from: '1970-01-01', to: '2100-01-01' };

// Full JSON backup of the café's data ("نسخة احتياطية"), admin only.
// Exports data only; restoring is a separate, deliberate operation.
export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [catalog, orders, expenses, revenues, purchases, debtData, shifts, staffAccounts, customers, pricing, overhead] = await Promise.all([
      getCatalog(),
      getOrderRepository().list(),
      listExpenses(ALL_TIME),
      listManualRevenue(ALL_TIME),
      listPurchaseInvoices(ALL_TIME),
      listDebts(),
      listShifts(),
      listStaffAccounts(),
      listCustomerFollowUps(),
      getPricingSettings(),
      getOverheadConfig(),
    ]);
    const inventory = await getInventoryData(catalog.products);
    const movements = await getInventoryMovements(new Date('1970-01-01T00:00:00Z'), new Date('2100-01-01T00:00:00Z'));
    const payrollRecords = await listPayrollRecords(staffAccounts.map((account) => account.id));

    return NextResponse.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      catalog,
      inventory: { items: inventory.items, recipes: inventory.recipes, movements },
      orders,
      expenses,
      manualRevenue: revenues,
      purchaseInvoices: purchases,
      debts: debtData.debts,
      payroll: payrollRecords,
      shifts,
      staffAccounts,
      customers,
      settings: { pricing, overhead },
    });
  } catch (error) {
    console.error('Unable to export backup:', error);
    return NextResponse.json({ error: 'تعذر تجهيز النسخة الاحتياطية' }, { status: 500 });
  }
}

// Restoring ("استرجاع") replaces ALL business data from a backup file.
// Staff accounts are deliberately excluded so no one locks themselves out.
export async function POST(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 30_000_000) {
    return NextResponse.json({ error: 'الملف أكبر من الحد المسموح (30 ميجا)' }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'الملف مش JSON صالح' }, { status: 400 });
  }

  const validation = validateBackupPayload(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const restored = await restoreBackup(validation.data, { id: staff.id, username: staff.username });
    return NextResponse.json({ ok: true, restored, staffAccountsSkipped: true });
  } catch (error) {
    console.error('Unable to restore backup:', error);
    return NextResponse.json({ error: 'تعذر استرجاع النسخة الاحتياطية؛ لم تكتمل العملية' }, { status: 500 });
  }
}
