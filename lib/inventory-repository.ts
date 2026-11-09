import mongoose, { Schema, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { getDataProvider } from './data-mode';
import type { InventoryItem, InventoryMovement, OrderRecord, Product, ProductRecipe } from './types';

type MockInventoryStore = {
  items: InventoryItem[];
  recipes: ProductRecipe[];
  movements: InventoryMovement[];
};

declare global {
  var matchaMockInventory: MockInventoryStore | undefined;
}

export async function getInventoryMovements(from: Date, to: Date) {
  const start = from.toISOString();
  const end = to.toISOString();
  if (getDataProvider() === 'mock') {
    return structuredClone(mockStore.movements.filter((movement) => movement.createdAt >= start && movement.createdAt <= end));
  }
  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  return await InventoryMovementModel.find({ createdAt: { $gte: start, $lte: end } })
    .sort({ createdAt: -1 })
    .lean() as InventoryMovement[];
}

const mockStore: MockInventoryStore = globalThis.matchaMockInventory
  ?? (globalThis.matchaMockInventory = { items: [], recipes: [], movements: [] });

const itemSchema = new Schema<InventoryItem>({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['product', 'ingredient'], required: true },
  productId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  lowStockThreshold: { type: Number, required: true, min: 0 },
  trackStock: { type: Boolean, required: true },
}, { versionKey: false, collection: 'inventory_items' });

const movementSchema = new Schema<InventoryMovement>({
  id: { type: String, required: true, unique: true },
  itemId: { type: String, required: true },
  itemName: { type: String, required: true },
  itemType: { type: String, enum: ['product', 'ingredient'], required: true },
  quantity: { type: Number, required: true },
  reason: { type: String, enum: ['adjustment', 'sale', 'cancellation'], required: true },
  referenceId: String,
  note: String,
  createdAt: { type: String, required: true },
}, { versionKey: false, collection: 'inventory_movements' });
movementSchema.index({ itemId: 1, createdAt: -1 });
movementSchema.index({ referenceId: 1, reason: 1 });

const recipeSchema = new Schema<ProductRecipe>({
  productId: { type: String, required: true, unique: true },
  ingredients: [{
    itemId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.000001 },
  }],
}, { versionKey: false, collection: 'product_recipes' });

const InventoryItemModel = (mongoose.models.InventoryItem as mongoose.Model<InventoryItem> | undefined)
  ?? mongoose.model<InventoryItem>('InventoryItem', itemSchema);
const InventoryMovementModel = (mongoose.models.InventoryMovement as mongoose.Model<InventoryMovement> | undefined)
  ?? mongoose.model<InventoryMovement>('InventoryMovement', movementSchema);
const ProductRecipeModel = (mongoose.models.ProductRecipe as mongoose.Model<ProductRecipe> | undefined)
  ?? mongoose.model<ProductRecipe>('ProductRecipe', recipeSchema);

export class InventoryStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryStockError';
  }
}

export class InventoryItemNotFoundError extends Error {
  constructor() {
    super('الصنف غير موجود في المخزون');
    this.name = 'InventoryItemNotFoundError';
  }
}

function newId() {
  return randomUUID();
}

export async function getInventoryData(products: Product[]) {
  if (getDataProvider() === 'mock') {
    for (const product of products) {
      const id = `product:${product.id}`;
      const item = mockStore.items.find((candidate) => candidate.id === id);
      if (item) item.name = product.ar;
      else mockStore.items.push({
        id,
        type: 'product',
        productId: product.id,
        name: product.ar,
        unit: 'قطعة',
        quantity: 0,
        lowStockThreshold: 0,
        trackStock: false,
      });
    }
    for (const item of mockStore.items) {
      if (item.quantity > 0 || item.lowStockThreshold > 0) item.trackStock = true;
    }
    return {
      items: structuredClone(mockStore.items),
      recipes: structuredClone(mockStore.recipes),
      movements: structuredClone(mockStore.movements).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  await InventoryItemModel.updateMany(
    {
      $or: [{ quantity: { $gt: 0 } }, { lowStockThreshold: { $gt: 0 } }],
      trackStock: { $ne: true },
    },
    { $set: { trackStock: true } },
  );
  if (products.length) {
    await InventoryItemModel.bulkWrite(products.map((product) => ({
      updateOne: {
        filter: { productId: product.id },
        update: {
          $set: { name: product.ar },
          $setOnInsert: {
            id: `product:${product.id}`,
            type: 'product',
            productId: product.id,
            unit: 'قطعة',
            quantity: 0,
            lowStockThreshold: 0,
            trackStock: false,
          },
        },
        upsert: true,
      },
    })));
  }
  const [items, recipes, movements] = await Promise.all([
    InventoryItemModel.find().sort({ type: 1, name: 1 }).lean(),
    ProductRecipeModel.find().lean(),
    InventoryMovementModel.find().sort({ createdAt: -1 }).limit(2000).lean(),
  ]);
  return { items: items as InventoryItem[], recipes: recipes as ProductRecipe[], movements: movements as InventoryMovement[] };
}

export async function saveInventorySettings(items: InventoryItem[], recipes: ProductRecipe[]) {
  if (getDataProvider() === 'mock') {
    mockStore.items = structuredClone(items);
    mockStore.recipes = structuredClone(recipes);
    return;
  }

  const { connectToDatabase } = await import('./database');
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of items) {
        await InventoryItemModel.updateOne(
          { id: item.id },
          { $set: item },
          { upsert: true, session },
        );
      }
      await ProductRecipeModel.deleteMany({}, { session });
      if (recipes.length) await ProductRecipeModel.insertMany(recipes, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function adjustInventory(itemId: string, delta: number, note?: string) {
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const item = mockStore.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new InventoryItemNotFoundError();
    if (item.quantity + delta < 0) throw new InventoryStockError(`الكمية المتاحة من «${item.name}» لا تكفي للخصم`);
    item.quantity += delta;
    if (delta > 0) item.trackStock = true;
    mockStore.movements.unshift({
      id: newId(),
      itemId,
      itemName: item.name,
      itemType: item.type,
      quantity: delta,
      reason: 'adjustment',
      note,
      createdAt: now,
    });
    return structuredClone(item);
  }

  const { connectToDatabase } = await import('./database');
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let updated: InventoryItem | null = null;
    await session.withTransaction(async () => {
      updated = await InventoryItemModel.findOneAndUpdate(
        { id: itemId, ...(delta < 0 ? { quantity: { $gte: -delta } } : {}) },
        { $inc: { quantity: delta }, ...(delta > 0 ? { $set: { trackStock: true } } : {}) },
        { new: true, session },
      ).lean() as InventoryItem | null;
      if (!updated) {
        const item = await InventoryItemModel.findOne({ id: itemId }).session(session).lean();
        if (!item) throw new InventoryItemNotFoundError();
        throw new InventoryStockError(`الكمية المتاحة من «${item.name}» لا تكفي للخصم`);
      }
      await InventoryMovementModel.create([{
        id: newId(),
        itemId,
        itemName: updated.name,
        itemType: updated.type,
        quantity: delta,
        reason: 'adjustment',
        note,
        createdAt: now,
      }], { session });
    });
    if (!updated) throw new Error('تعذر تحديث المخزون');
    return updated;
  } finally {
    await session.endSession();
  }
}

export function calculateOrderInventoryConsumption(order: OrderRecord, items: InventoryItem[], recipes: ProductRecipe[]) {
  const quantities = new Map<string, number>();
  const add = (id: string, quantity: number) => quantities.set(id, (quantities.get(id) ?? 0) + quantity);
  const recipeMap = new Map(recipes.map((recipe) => [recipe.productId, recipe]));

  for (const orderItem of order.items) {
    const stock = items.find((item) => item.type === 'product' && item.productId === orderItem.productId);
    if (stock?.trackStock) add(stock.id, orderItem.quantity);
    for (const ingredient of recipeMap.get(orderItem.productId)?.ingredients ?? []) {
      const stockItem = items.find((item) => item.id === ingredient.itemId);
      if (stockItem?.trackStock) add(stockItem.id, ingredient.quantity * orderItem.quantity);
    }
  }

  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export async function consumeInventoryForOrder(order: OrderRecord, session?: ClientSession) {
  if (getDataProvider() === 'mock') {
    const consumption = calculateOrderInventoryConsumption(order, mockStore.items, mockStore.recipes);
    for (const entry of consumption) {
      const item = mockStore.items.find((candidate) => candidate.id === entry.itemId);
      if (!item || item.quantity < entry.quantity) {
        throw new InventoryStockError(`الكمية المتاحة من «${item?.name ?? 'أحد الأصناف'}» لا تكفي للطلب`);
      }
    }
    for (const entry of consumption) {
      const item = mockStore.items.find((candidate) => candidate.id === entry.itemId)!;
      item.quantity -= entry.quantity;
      mockStore.movements.unshift({
        id: newId(),
        itemId: item.id,
        itemName: item.name,
        itemType: item.type,
        quantity: -entry.quantity,
        reason: 'sale',
        referenceId: order.orderNumber,
        createdAt: order.createdAt,
      });
    }
    return consumption;
  }

  if (!session) throw new Error('A database session is required to consume inventory');
  const [items, recipes] = await Promise.all([
    InventoryItemModel.find().session(session).lean(),
    ProductRecipeModel.find().session(session).lean(),
  ]);
  const consumption = calculateOrderInventoryConsumption(order, items as InventoryItem[], recipes as ProductRecipe[]);
  for (const entry of consumption) {
    const updated = await InventoryItemModel.findOneAndUpdate(
      { id: entry.itemId, quantity: { $gte: entry.quantity } },
      { $inc: { quantity: -entry.quantity } },
      { new: true, session },
    ).lean();
    if (!updated) {
      const item = items.find((candidate) => candidate.id === entry.itemId);
      throw new InventoryStockError(`الكمية المتاحة من «${item?.name ?? 'أحد الأصناف'}» لا تكفي للطلب`);
    }
  }
  if (consumption.length) {
    const byId = new Map((items as InventoryItem[]).map((item) => [item.id, item]));
    await InventoryMovementModel.create(consumption.map((entry) => {
      const item = byId.get(entry.itemId)!;
      return {
        id: newId(),
        itemId: item.id,
        itemName: item.name,
        itemType: item.type,
        quantity: -entry.quantity,
        reason: 'sale',
        referenceId: order.orderNumber,
        createdAt: order.createdAt,
      };
    }), { session });
  }
  return consumption;
}

export async function restoreInventoryForOrder(order: OrderRecord, session?: ClientSession) {
  if (!order.inventoryConsumption?.length) return;
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    for (const entry of order.inventoryConsumption) {
      const item = mockStore.items.find((candidate) => candidate.id === entry.itemId);
      if (!item) continue;
      item.quantity += entry.quantity;
      mockStore.movements.unshift({
        id: newId(),
        itemId: item.id,
        itemName: item.name,
        itemType: item.type,
        quantity: entry.quantity,
        reason: 'cancellation',
        referenceId: order.orderNumber,
        createdAt: now,
      });
    }
    return;
  }

  if (!session) throw new Error('A database session is required to restore inventory');
  const items = await InventoryItemModel.find({
    id: { $in: order.inventoryConsumption.map((entry) => entry.itemId) },
  }).session(session).lean() as InventoryItem[];
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const entry of order.inventoryConsumption) {
    const item = byId.get(entry.itemId);
    if (!item) continue;
    await InventoryItemModel.updateOne({ id: item.id }, { $inc: { quantity: entry.quantity } }, { session });
    await InventoryMovementModel.create([{
      id: newId(),
      itemId: item.id,
      itemName: item.name,
      itemType: item.type,
      quantity: entry.quantity,
      reason: 'cancellation',
      referenceId: order.orderNumber,
      createdAt: now,
    }], { session });
  }
}

export function clearMockInventory() {
  mockStore.items = [];
  mockStore.recipes = [];
  mockStore.movements = [];
}
