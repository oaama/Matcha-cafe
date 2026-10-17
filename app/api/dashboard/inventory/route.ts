import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCatalog } from '@/lib/catalog-repository';
import { isValidStaffSessionToken, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';
import { adjustInventory, getInventoryData, InventoryItemNotFoundError, saveInventorySettings } from '@/lib/inventory-repository';
import { inventoryAdjustmentSchema, inventorySettingsSchema } from '@/lib/validation';

async function isStaff() {
  return isValidStaffSessionToken((await cookies()).get(STAFF_SESSION_COOKIE)?.value);
}

export async function GET() {
  if (!await isStaff()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const catalog = await getCatalog();
    const inventory = await getInventoryData(catalog.products);
    return NextResponse.json({ ...inventory, products: catalog.products });
  } catch (error) {
    console.error('Unable to load inventory:', error);
    return NextResponse.json({ error: 'تعذر تحميل المخزون' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!await isStaff()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات المخزون غير صالحة' }, { status: 400 });
  }
  const parsed = inventorySettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات المخزون غير صالحة' }, { status: 400 });
  }

  try {
    const catalog = await getCatalog();
    const productIds = new Set(catalog.products.map((product) => product.id));
    if (parsed.data.items.some((item) => item.type === 'product' && !productIds.has(item.productId!))
      || parsed.data.recipes.some((recipe) => !productIds.has(recipe.productId))) {
      return NextResponse.json({ error: 'يوجد صنف غير موجود في المنيو ضمن إعدادات المخزون' }, { status: 400 });
    }
    await saveInventorySettings(parsed.data.items, parsed.data.recipes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unable to save inventory settings:', error);
    return NextResponse.json({ error: 'تعذر حفظ إعدادات المخزون' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await isStaff()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات الحركة غير صالحة' }, { status: 400 });
  }
  const parsed = inventoryAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'أدخل كمية صحيحة وملاحظة لا تتجاوز 250 حرفًا' }, { status: 400 });
  }

  try {
    const item = await adjustInventory(parsed.data.itemId, parsed.data.delta, parsed.data.note);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof InventoryItemNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.name === 'InventoryStockError') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Unable to adjust inventory:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحديث المخزون' }, { status: 500 });
  }
}
