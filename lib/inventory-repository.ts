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
  category: { type: String, trim: true, maxlength: 60 },
  unitCost: { type: Number, min: 0 },
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
  reason: { type: String, enum: ['adjustment', 'sale', 'cancellation', 'purchase'], required: true },
  referenceId: String,
  note: String,
  performedBy: String,
  previousBalance: Number,
  newBalance: Number,
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

export async function getRecipeMonitoringData() {
  if (getDataProvider() === 'mock') {
    return {
      items: structuredClone(mockStore.items),
      recipes: structuredClone(mockStore.recipes),
    };
  }

  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  const [items, recipes] = await Promise.all([
    InventoryItemModel.find().sort({ type: 1, name: 1 }).lean(),
    ProductRecipeModel.find().lean(),
  ]);
  return { items: items as InventoryItem[], recipes: recipes as ProductRecipe[] };
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

export async function saveInventoryConfiguration(items: InventoryItem[], recipes: ProductRecipe[]) {
  if (getDataProvider() === 'mock') {
    const existingItems = new Map(mockStore.items.map((item) => [item.id, item]));
    const updatedItems = items.map((item) => {
      const current = existingItems.get(item.id);
      return {
        ...item,
        quantity: current?.quantity ?? 0,
        trackStock: current
          ? current.trackStock || item.trackStock || current.quantity > 0 || item.lowStockThreshold > 0
          : item.trackStock,
      };
    });
    const submittedIds = new Set(items.map((item) => item.id));
    mockStore.items = [
      ...mockStore.items.filter((item) => !submittedIds.has(item.id)),
      ...updatedItems,
    ];
    mockStore.recipes = structuredClone(recipes);
    return;
  }

  const { connectToDatabase } = await import('./database');
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of items) {
        const current = await InventoryItemModel.findOne({ id: item.id }).session(session).lean() as InventoryItem | null;
        if (!current) {
          await InventoryItemModel.create([{ ...item, quantity: 0 }], { session });
          continue;
        }

        const set: Partial<InventoryItem> = {
          type: item.type,
          name: item.name,
          unit: item.unit,
          lowStockThreshold: item.lowStockThreshold,
          trackStock: current.trackStock || item.trackStock || current.quantity > 0 || item.lowStockThreshold > 0,
        };
        const unset: Record<string, 1> = {};
        if (item.productId === undefined) unset.productId = 1;
        else set.productId = item.productId;
        if (item.category === undefined) unset.category = 1;
        else set.category = item.category;
        if (item.unitCost === undefined) unset.unitCost = 1;
        else set.unitCost = item.unitCost;

        await InventoryItemModel.updateOne(
          { id: item.id },
          { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { session },
        );
      }
      await ProductRecipeModel.deleteMany({}, { session });
      if (recipes.length) await ProductRecipeModel.insertMany(recipes, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function deleteInventoryItem(itemId: string) {
  if (getDataProvider() === 'mock') {
    const exists = mockStore.items.some((item) => item.id === itemId);
    if (!exists) throw new InventoryItemNotFoundError();
    mockStore.items = mockStore.items.filter((item) => item.id !== itemId);
    mockStore.recipes = mockStore.recipes
      .map((recipe) => ({ ...recipe, ingredients: recipe.ingredients.filter((ingredient) => ingredient.itemId !== itemId) }))
      .filter((recipe) => recipe.ingredients.length > 0);
    return;
  }

  const { connectToDatabase } = await import('./database');
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      const removed = await InventoryItemModel.deleteOne({ id: itemId }, { session });
      if (!removed.deletedCount) throw new InventoryItemNotFoundError();
      await ProductRecipeModel.updateMany({}, { $pull: { ingredients: { itemId } } }, { session });
      await ProductRecipeModel.deleteMany({ ingredients: { $size: 0 } }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function adjustInventory(itemId: string, delta: number, note?: string, performedBy?: string) {
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const item = mockStore.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new InventoryItemNotFoundError();
    if (item.quantity + delta < 0) throw new InventoryStockError(`الكمية المتاحة من «${item.name}» لا تكفي للخصم`);
    const previousBalance = item.quantity;
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
      performedBy,
      previousBalance,
      newBalance: item.quantity,
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
      const current = await InventoryItemModel.findOne({ id: itemId }).session(session).lean() as InventoryItem | null;
      if (!current) throw new InventoryItemNotFoundError();
      if (current.quantity + delta < 0) {
        throw new InventoryStockError(`الكمية المتاحة من «${current.name}» لا تكفي للخصم`);
      }
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
        performedBy,
        previousBalance: current.quantity,
        newBalance: updated.quantity,
        createdAt: now,
      }], { session });
    });
    if (!updated) throw new Error('تعذر تحديث المخزون');
    return updated;
  } finally {
    await session.endSession();
  }
}

export async function receiveInventoryPurchase(
  lines: Array<{ itemId: string; quantity: number; unitCost: number }>,
  referenceId: string,
  performedBy: string,
  session?: ClientSession,
) {
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const updates = lines.map((line) => {
      const item = mockStore.items.find((candidate) => candidate.id === line.itemId);
      if (!item) throw new InventoryItemNotFoundError();
      return { item, line };
    });
    for (const { item, line } of updates) {
      const previousBalance = item.quantity;
      const newBalance = previousBalance + line.quantity;
      item.unitCost = item.unitCost === undefined || previousBalance <= 0
        ? line.unitCost
        : Number(((previousBalance * item.unitCost + line.quantity * line.unitCost) / newBalance).toFixed(6));
      item.quantity = newBalance;
      item.trackStock = true;
      mockStore.movements.unshift({
        id: newId(),
        itemId: item.id,
        itemName: item.name,
        itemType: item.type,
        quantity: line.quantity,
        reason: 'purchase',
        referenceId,
        performedBy,
        previousBalance,
        newBalance,
        createdAt: now,
      });
    }
    return updates.map(({ item }) => structuredClone(item));
  }

  if (!session) throw new Error('A database session is required to receive purchased inventory');
  const received: InventoryItem[] = [];
  for (const line of lines) {
    const current = await InventoryItemModel.findOne({ id: line.itemId }).session(session).lean() as InventoryItem | null;
    if (!current) throw new InventoryItemNotFoundError();
    const newBalance = current.quantity + line.quantity;
    const unitCost = current.unitCost === undefined || current.quantity <= 0
      ? line.unitCost
      : Number(((current.quantity * current.unitCost + line.quantity * line.unitCost) / newBalance).toFixed(6));
    const updated = await InventoryItemModel.findOneAndUpdate(
      { id: line.itemId },
      { $inc: { quantity: line.quantity }, $set: { unitCost, trackStock: true } },
      { new: true, session },
    ).lean() as InventoryItem | null;
    if (!updated) throw new InventoryItemNotFoundError();
    await InventoryMovementModel.create([{
      id: newId(),
      itemId: updated.id,
      itemName: updated.name,
      itemType: updated.type,
      quantity: line.quantity,
      reason: 'purchase',
      referenceId,
      performedBy,
      previousBalance: current.quantity,
      newBalance,
      createdAt: now,
    }], { session });
    received.push(updated);
  }
  return received;
}

export async function getInventoryCostSnapshot(
  consumption: Array<{ itemId: string; quantity: number }>,
  session?: ClientSession,
) {
  if (!consumption.length) return null;
  let items: InventoryItem[];
  if (getDataProvider() === 'mock') {
    items = consumption
      .map((entry) => mockStore.items.find((item) => item.id === entry.itemId))
      .filter((item): item is InventoryItem => Boolean(item));
  } else {
    if (!session) throw new Error('A database session is required to calculate order inventory cost');
    items = await InventoryItemModel.find({
      id: { $in: consumption.map((entry) => entry.itemId) },
    }).session(session).lean() as InventoryItem[];
  }
  if (items.length !== new Set(consumption.map((entry) => entry.itemId)).size
    || items.some((item) => item.unitCost === undefined)) return null;
  const costById = new Map<string, number>();
  for (const item of items) {
    if (item.unitCost === undefined) return null;
    costById.set(item.id, item.unitCost);
  }
  const amount = consumption.reduce((sum, entry) => {
    const unitCost = costById.get(entry.itemId);
    if (unitCost === undefined) throw new Error(`Missing unit cost for consumed inventory item ${entry.itemId}`);
    return sum + entry.quantity * unitCost;
  }, 0);
  return Number(amount.toFixed(2));
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
        performedBy: 'نظام الطلبات',
        previousBalance: item.quantity + entry.quantity,
        newBalance: item.quantity,
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
        performedBy: 'نظام الطلبات',
        previousBalance: item.quantity,
        newBalance: item.quantity - entry.quantity,
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
        performedBy: order.employeeName ?? 'نظام الطلبات',
        previousBalance: item.quantity - entry.quantity,
        newBalance: item.quantity,
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
      performedBy: order.employeeName ?? 'نظام الطلبات',
      previousBalance: item.quantity,
      newBalance: item.quantity + entry.quantity,
      createdAt: now,
    }], { session });
  }
}

export function clearMockInventory() {
  mockStore.items = [];
  mockStore.recipes = [];
  mockStore.movements = [];
}
