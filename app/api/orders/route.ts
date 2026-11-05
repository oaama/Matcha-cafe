import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { createOrderSchema } from '@/lib/validation';
import { calculateOrderTotal, validateProductSelections } from '@/lib/store';
import { getOrderRepository } from '@/lib/order-repository';
import { getPricingSettings } from '@/lib/pricing-settings';
import { getCatalog } from '@/lib/catalog-repository';
import { getProductPrice } from '@/lib/pricing';
import type { OrderRecord } from '@/lib/types';
import { calculateOrderInventoryConsumption, getInventoryData, InventoryStockError } from '@/lib/inventory-repository';

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 });
    }

    const {
      orderType,
      tableNumber,
      items,
      paymentMethod,
      notes,
      idempotencyKey,
      customerName,
      customerPhone,
      customerAddress,
      additionalAddressDetails,
      deliveryInstructions,
    } = parsed.data;
    const catalog = await getCatalog();
    const inventory = await getInventoryData(catalog.products);
    const productMap = new Map(catalog.products.map((product) => [product.id, product]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.available || !catalog.categories.some((category) => category.id === product.categoryId && category.active)) {
        return NextResponse.json({ error: `Unavailable product: ${item.productId}` }, { status: 400 });
      }

      const selectionResult = validateProductSelections(product, item.customizations, catalog.groups);
      if (!selectionResult.valid) {
        return NextResponse.json({ error: selectionResult.error }, { status: 400 });
      }
    }

    const totals = calculateOrderTotal(items, await getPricingSettings(), catalog.products, catalog.groups);
    const orderNumber = `M-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    const order: OrderRecord = {
      id: randomUUID(),
      orderNumber,
      type: orderType,
      status: 'NEW',
      tableNumber: orderType === 'DINE_IN' ? tableNumber?.trim() : undefined,
      customerName,
      customerPhone,
      customerAddress,
      additionalAddressDetails,
      deliveryInstructions,
      paymentMethod,
      createdAt: now,
      updatedAt: now,
      items: items.map((item) => {
        const product = productMap.get(item.productId)!;
        const selectedOptions = item.customizations.map((customization) => {
          const group = catalog.groups[customization.groupId];
          const option = group?.options?.[customization.optionIndex];
          return {
            groupId: customization.groupId,
            optionAr: option?.ar ?? '',
            optionEn: option?.en ?? '',
            price: option?.price ?? 0,
          };
        });
        return {
          productId: product.id,
          quantity: item.quantity,
          unitPrice: getProductPrice(product),
          nameAr: product.ar,
          nameEn: product.en,
          selectedOptions,
          notes: item.notes,
        };
      }),
      subtotal: totals.subtotal,
      serviceFee: totals.serviceFee,
      tax: totals.tax,
      total: totals.total,
      notes,
    };

    const repository = getOrderRepository();
    const result = calculateOrderInventoryConsumption(order, inventory.items, inventory.recipes).length
      ? await repository.createWithInventory(order, idempotencyKey)
      : await repository.create(order, idempotencyKey);
    return NextResponse.json({ ok: true, order: result.order }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof InventoryStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Unable to create order:', error);
    return NextResponse.json({ error: 'Unable to create order' }, { status: 500 });
  }
}
