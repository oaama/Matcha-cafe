import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import {
  approvePurchaseInvoice,
  cancelPurchaseInvoice,
  createPurchaseInvoice,
  DuplicatePurchaseInvoiceError,
  listPurchaseInvoices,
  PurchaseInvoiceNotFoundError,
  PurchaseInvoiceStateError,
  updatePurchaseInvoice,
  recordPurchasePayment,
} from '@/lib/purchase-repository';
import { getInventoryData, InventoryItemNotFoundError } from '@/lib/inventory-repository';
import { requireStaffRole } from '@/lib/staff-api';
import type { PurchaseInvoiceStatus } from '@/lib/purchase-types';
import { purchaseInvoiceActionSchema, purchaseInvoiceInputSchema } from '@/lib/validation';

const invoiceStatuses: PurchaseInvoiceStatus[] = ['DRAFT', 'APPROVED', 'CANCELLED'];

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const supplier = params.get('supplier')?.trim() || undefined;
  const invoiceNumber = params.get('invoiceNumber')?.trim() || undefined;
  const statusValue = params.get('status') || undefined;
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  if ((statusValue && !invoiceStatuses.includes(statusValue as PurchaseInvoiceStatus))
    || (from && !isIsoDate(from))
    || (to && !isIsoDate(to))
    || (from && to && from > to)
    || (supplier && supplier.length > 160)
    || (invoiceNumber && invoiceNumber.length > 120)) {
    return NextResponse.json({ error: 'معايير البحث غير صالحة' }, { status: 400 });
  }

  try {
    const [catalog, invoices] = await Promise.all([
      getCatalog(),
      listPurchaseInvoices({
        supplier,
        invoiceNumber,
        status: statusValue as PurchaseInvoiceStatus | undefined,
        from,
        to,
      }),
    ]);
    const inventory = await getInventoryData(catalog.products);
    return NextResponse.json({
      invoices,
      items: inventory.items,
      demoMode: process.env.DATA_PROVIDER === 'mock',
    });
  } catch (error) {
    console.error('Unable to load purchase invoices:', error);
    return NextResponse.json({ error: 'تعذر تحميل فواتير المشتريات' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات الفاتورة غير صالحة' }, { status: 400 });
  }
  const parsed = purchaseInvoiceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات الفاتورة غير صالحة' }, { status: 400 });
  }

  try {
    const catalog = await getCatalog();
    const inventory = await getInventoryData(catalog.products);
    const invoice = await createPurchaseInvoice(parsed.data, staff, inventory.items);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicatePurchaseInvoiceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InventoryItemNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Unable to create purchase invoice:', error);
    return NextResponse.json({ error: 'تعذر حفظ فاتورة المشتريات' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'الإجراء غير صالح' }, { status: 400 });
  }
  const parsed = purchaseInvoiceActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'الإجراء غير صالح' }, { status: 400 });
  }

  try {
    let invoice;
    if (parsed.data.action === 'UPDATE') {
      const catalog = await getCatalog();
      const inventory = await getInventoryData(catalog.products);
      invoice = await updatePurchaseInvoice(parsed.data.id, parsed.data.invoice, staff, inventory.items);
    } else if (parsed.data.action === 'APPROVE') {
      invoice = await approvePurchaseInvoice(parsed.data.id, staff);
    } else if (parsed.data.action === 'PAY') {
      invoice = await recordPurchasePayment(parsed.data.id, parsed.data.amount, staff);
    } else {
      invoice = await cancelPurchaseInvoice(parsed.data.id, staff);
    }
    return NextResponse.json({ invoice });
  } catch (error) {
    if (error instanceof PurchaseInvoiceNotFoundError || error instanceof InventoryItemNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicatePurchaseInvoiceError || error instanceof PurchaseInvoiceStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Unable to process purchase invoice:', error);
    return NextResponse.json({ error: 'تعذر تنفيذ إجراء فاتورة المشتريات' }, { status: 500 });
  }
}
