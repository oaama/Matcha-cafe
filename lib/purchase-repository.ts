import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { recordActivity } from './activity-log-repository';
import { connectToDatabase } from './database';
import { getDataProvider } from './data-mode';
import { InventoryItemNotFoundError, receiveInventoryPurchase } from './inventory-repository';
import type { PurchaseInvoice, PurchaseInvoiceHistoryEntry, PurchaseInvoiceItem } from './purchase-types';

type PurchaseInput = {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: Array<{ itemId: string; quantity: number; unitPrice: number }>;
  notes?: string;
};

type MockPurchaseStore = { invoices: PurchaseInvoice[] };
declare global {
  var matchaMockPurchaseStore: MockPurchaseStore | undefined;
}

const mockStore = globalThis.matchaMockPurchaseStore
  ?? (globalThis.matchaMockPurchaseStore = { invoices: [] });
const approvingMockInvoices = new Set<string>();

const invoiceItemSchema = new Schema<PurchaseInvoiceItem>({
  itemId: { type: String, required: true },
  itemName: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const historySchema = new Schema<PurchaseInvoiceHistoryEntry>({
  action: { type: String, enum: ['CREATED', 'UPDATED', 'APPROVED', 'CANCELLED'], required: true },
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  at: { type: String, required: true },
}, { _id: false });

const purchaseInvoiceSchema = new Schema<PurchaseInvoice & { supplierKey: string; invoiceNumberKey: string }>({
  id: { type: String, required: true, unique: true },
  supplier: { type: String, required: true, trim: true },
  supplierKey: { type: String, required: true },
  invoiceNumber: { type: String, required: true, trim: true },
  invoiceNumberKey: { type: String, required: true },
  invoiceDate: { type: String, required: true, index: true },
  items: { type: [invoiceItemSchema], required: true },
  total: { type: Number, required: true, min: 0 },
  notes: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['DRAFT', 'APPROVED', 'CANCELLED'], required: true, index: true },
  createdById: { type: String, required: true },
  createdBy: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  approvedById: String,
  approvedBy: String,
  approvedAt: String,
  cancelledById: String,
  cancelledBy: String,
  cancelledAt: String,
  history: { type: [historySchema], required: true },
}, { versionKey: false, collection: 'purchase_invoices' });
purchaseInvoiceSchema.index({ supplierKey: 1, invoiceNumberKey: 1 }, { unique: true });
purchaseInvoiceSchema.index({ invoiceDate: -1, status: 1 });

const PurchaseInvoiceModel = (mongoose.models.PurchaseInvoice as mongoose.Model<PurchaseInvoice & { supplierKey: string; invoiceNumberKey: string }> | undefined)
  ?? mongoose.model<PurchaseInvoice & { supplierKey: string; invoiceNumberKey: string }>('PurchaseInvoice', purchaseInvoiceSchema);

export class PurchaseInvoiceNotFoundError extends Error {
  constructor() {
    super('فاتورة الشراء غير موجودة');
    this.name = 'PurchaseInvoiceNotFoundError';
  }
}

export class PurchaseInvoiceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseInvoiceStateError';
  }
}

export class DuplicatePurchaseInvoiceError extends Error {
  constructor() {
    super('رقم الفاتورة مسجل بالفعل لهذا المورد');
    this.name = 'DuplicatePurchaseInvoiceError';
  }
}

function key(value: string) {
  return value.trim().toLocaleLowerCase('ar-EG');
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildItems(input: PurchaseInput, inventoryItems: Array<{ id: string; name: string; unit: string }>): PurchaseInvoiceItem[] {
  return input.items.map((entry) => {
    const inventoryItem = inventoryItems.find((item) => item.id === entry.itemId);
    if (!inventoryItem) throw new InventoryItemNotFoundError();
    const lineTotal = roundMoney(entry.quantity * entry.unitPrice);
    if (!Number.isFinite(lineTotal)) throw new Error('إجمالي أحد أصناف الفاتورة غير صالح');
    return {
      itemId: inventoryItem.id,
      itemName: inventoryItem.name,
      unit: inventoryItem.unit,
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      lineTotal,
    };
  });
}

async function prepareItems(input: PurchaseInput, inventoryItems: Array<{ id: string; name: string; unit: string }>) {
  return buildItems(input, inventoryItems);
}

function findDuplicate(supplier: string, invoiceNumber: string, exceptId?: string) {
  return mockStore.invoices.some((invoice) => invoice.id !== exceptId
    && key(invoice.supplier) === key(supplier)
    && key(invoice.invoiceNumber) === key(invoiceNumber));
}

function addHistory(invoice: PurchaseInvoice, action: PurchaseInvoiceHistoryEntry['action'], actorId: string, actorName: string, at: string) {
  invoice.history.push({ action, actorId, actorName, at });
  invoice.updatedAt = at;
}

export async function listPurchaseInvoices(filters: {
  supplier?: string;
  invoiceNumber?: string;
  status?: PurchaseInvoice['status'];
  from?: string;
  to?: string;
} = {}) {
  if (getDataProvider() === 'mock') {
    return structuredClone(mockStore.invoices.filter((invoice) =>
      (!filters.supplier || key(invoice.supplier).includes(key(filters.supplier)))
      && (!filters.invoiceNumber || key(invoice.invoiceNumber).includes(key(filters.invoiceNumber)))
      && (!filters.status || invoice.status === filters.status)
      && (!filters.from || invoice.invoiceDate >= filters.from)
      && (!filters.to || invoice.invoiceDate <= filters.to))
      .sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate)));
  }
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.supplier) query.supplierKey = { $regex: key(filters.supplier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
  if (filters.invoiceNumber) query.invoiceNumberKey = { $regex: key(filters.invoiceNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
  if (filters.status) query.status = filters.status;
  if (filters.from || filters.to) {
    query.invoiceDate = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  return PurchaseInvoiceModel.find(query).select('-supplierKey -invoiceNumberKey')
    .sort({ invoiceDate: -1, createdAt: -1 }).limit(1000).lean() as unknown as PurchaseInvoice[];
}

export async function createPurchaseInvoice(
  input: PurchaseInput,
  actor: { id: string; username: string },
  inventoryItems: Array<{ id: string; name: string; unit: string }>,
) {
  const items = await prepareItems(input, inventoryItems);
  const now = new Date().toISOString();
  const invoice: PurchaseInvoice = {
    id: `purchase-${randomUUID()}`,
    supplier: input.supplier.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceDate: input.invoiceDate,
    items,
    total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    notes: input.notes?.trim() || undefined,
    status: 'DRAFT',
    createdById: actor.id,
    createdBy: actor.username,
    createdAt: now,
    updatedAt: now,
    history: [{ action: 'CREATED', actorId: actor.id, actorName: actor.username, at: now }],
  };

  if (getDataProvider() === 'mock') {
    if (findDuplicate(invoice.supplier, invoice.invoiceNumber)) throw new DuplicatePurchaseInvoiceError();
    mockStore.invoices.unshift(structuredClone(invoice));
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PURCHASE_CREATED',
      entityType: 'purchase-invoice',
      entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
    });
  } else {
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        await PurchaseInvoiceModel.create([{
          ...invoice,
          supplierKey: key(invoice.supplier),
          invoiceNumberKey: key(invoice.invoiceNumber),
        }], { session });
        await recordActivity({
          actorId: actor.id,
          actorName: actor.username,
          action: 'PURCHASE_CREATED',
          entityType: 'purchase-invoice',
          entityId: invoice.id,
          details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
        }, session);
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new DuplicatePurchaseInvoiceError();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return structuredClone(invoice);
}

export async function updatePurchaseInvoice(
  id: string,
  input: PurchaseInput,
  actor: { id: string; username: string },
  inventoryItems: Array<{ id: string; name: string; unit: string }>,
) {
  const items = await prepareItems(input, inventoryItems);
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const invoice = mockStore.invoices.find((item) => item.id === id);
    if (!invoice) throw new PurchaseInvoiceNotFoundError();
    if (invoice.status !== 'DRAFT') throw new PurchaseInvoiceStateError('يمكن تعديل الفواتير المسودة فقط');
    if (findDuplicate(input.supplier, input.invoiceNumber, id)) throw new DuplicatePurchaseInvoiceError();
    Object.assign(invoice, {
      supplier: input.supplier.trim(),
      invoiceNumber: input.invoiceNumber.trim(),
      invoiceDate: input.invoiceDate,
      items,
      total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
      notes: input.notes?.trim() || undefined,
    });
    addHistory(invoice, 'UPDATED', actor.id, actor.username, now);
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PURCHASE_UPDATED',
      entityType: 'purchase-invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
    });
    return structuredClone(invoice);
  } else {
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    let updated: PurchaseInvoice | null = null;
    try {
      await session.withTransaction(async () => {
        updated = await PurchaseInvoiceModel.findOneAndUpdate(
          { id, status: 'DRAFT' },
          {
            $set: {
              supplier: input.supplier.trim(),
              supplierKey: key(input.supplier),
              invoiceNumber: input.invoiceNumber.trim(),
              invoiceNumberKey: key(input.invoiceNumber),
              invoiceDate: input.invoiceDate,
              items,
              total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
              notes: input.notes?.trim() || undefined,
              updatedAt: now,
            },
            $push: { history: { action: 'UPDATED', actorId: actor.id, actorName: actor.username, at: now } },
          },
          { new: true, runValidators: true, session },
        ).select('-supplierKey -invoiceNumberKey').lean() as unknown as PurchaseInvoice | null;
        if (!updated) {
          const current = await PurchaseInvoiceModel.findOne({ id }).session(session).lean() as unknown as PurchaseInvoice | null;
          if (!current) throw new PurchaseInvoiceNotFoundError();
          if (current.status !== 'DRAFT') throw new PurchaseInvoiceStateError('يمكن تعديل الفواتير المسودة فقط');
          if (await PurchaseInvoiceModel.exists({
            supplierKey: key(input.supplier),
            invoiceNumberKey: key(input.invoiceNumber),
            id: { $ne: id },
          }).session(session)) throw new DuplicatePurchaseInvoiceError();
          throw new PurchaseInvoiceStateError('تعذر تعديل الفاتورة؛ حدّث القائمة وحاول مرة أخرى');
        }
        await recordActivity({
          actorId: actor.id,
          actorName: actor.username,
          action: 'PURCHASE_UPDATED',
          entityType: 'purchase-invoice',
          entityId: id,
          details: { invoiceNumber: updated.invoiceNumber, supplier: updated.supplier, total: updated.total },
        }, session);
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new DuplicatePurchaseInvoiceError();
      throw error;
    } finally {
      await session.endSession();
    }
    if (!updated) {
      throw new PurchaseInvoiceStateError('تعذر تعديل الفاتورة');
    }
    return updated;
  }
}

export async function approvePurchaseInvoice(id: string, actor: { id: string; username: string }) {
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const invoice = mockStore.invoices.find((item) => item.id === id);
    if (!invoice) throw new PurchaseInvoiceNotFoundError();
    if (invoice.status !== 'DRAFT' || approvingMockInvoices.has(id)) {
      throw new PurchaseInvoiceStateError('تمت معالجة هذه الفاتورة بالفعل');
    }
    approvingMockInvoices.add(id);
    try {
      await receiveInventoryPurchase(invoice.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        unitCost: item.unitPrice,
      })), invoice.id, actor.username);
      invoice.status = 'APPROVED';
      invoice.approvedById = actor.id;
      invoice.approvedBy = actor.username;
      invoice.approvedAt = now;
      addHistory(invoice, 'APPROVED', actor.id, actor.username, now);
      await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PURCHASE_APPROVED',
        entityType: 'purchase-invoice',
        entityId: id,
        details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
      });
      return structuredClone(invoice);
    } finally {
      approvingMockInvoices.delete(id);
    }
  }

  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let result: PurchaseInvoice | null = null;
    await session.withTransaction(async () => {
      const invoice = await PurchaseInvoiceModel.findOne({ id }).select('-supplierKey -invoiceNumberKey').session(session).lean() as unknown as PurchaseInvoice | null;
      if (!invoice) throw new PurchaseInvoiceNotFoundError();
      if (invoice.status !== 'DRAFT') throw new PurchaseInvoiceStateError('تمت معالجة هذه الفاتورة بالفعل');
      await receiveInventoryPurchase(invoice.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        unitCost: item.unitPrice,
      })), invoice.id, actor.username, session);
      result = await PurchaseInvoiceModel.findOneAndUpdate(
        { id, status: 'DRAFT' },
        {
          $set: {
            status: 'APPROVED',
            approvedById: actor.id,
            approvedBy: actor.username,
            approvedAt: now,
            updatedAt: now,
          },
          $push: { history: { action: 'APPROVED', actorId: actor.id, actorName: actor.username, at: now } },
        },
        { new: true, session },
      ).select('-supplierKey -invoiceNumberKey').lean() as unknown as PurchaseInvoice | null;
      if (!result) throw new PurchaseInvoiceStateError('تمت معالجة هذه الفاتورة بالفعل');
      await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PURCHASE_APPROVED',
        entityType: 'purchase-invoice',
        entityId: id,
        details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
      }, session);
    });
    if (!result) throw new PurchaseInvoiceStateError('تعذر اعتماد الفاتورة');
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelPurchaseInvoice(id: string, actor: { id: string; username: string }) {
  const now = new Date().toISOString();
  if (getDataProvider() === 'mock') {
    const invoice = mockStore.invoices.find((item) => item.id === id);
    if (!invoice) throw new PurchaseInvoiceNotFoundError();
    if (invoice.status !== 'DRAFT') {
      throw new PurchaseInvoiceStateError('لا يمكن إلغاء فاتورة معتمدة؛ سجّل حركة مخزون تصحيحية بدلًا من ذلك');
    }
    invoice.status = 'CANCELLED';
    invoice.cancelledById = actor.id;
    invoice.cancelledBy = actor.username;
    invoice.cancelledAt = now;
    addHistory(invoice, 'CANCELLED', actor.id, actor.username, now);
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PURCHASE_CANCELLED',
      entityType: 'purchase-invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, total: invoice.total },
    });
    return structuredClone(invoice);
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let result: PurchaseInvoice | null = null;
    await session.withTransaction(async () => {
      result = await PurchaseInvoiceModel.findOneAndUpdate(
        { id, status: 'DRAFT' },
        {
          $set: { status: 'CANCELLED', cancelledById: actor.id, cancelledBy: actor.username, cancelledAt: now, updatedAt: now },
          $push: { history: { action: 'CANCELLED', actorId: actor.id, actorName: actor.username, at: now } },
        },
        { new: true, session },
      ).select('-supplierKey -invoiceNumberKey').lean() as unknown as PurchaseInvoice | null;
      if (!result) {
        const existing = await PurchaseInvoiceModel.findOne({ id }).select('-supplierKey -invoiceNumberKey').session(session).lean() as unknown as PurchaseInvoice | null;
        if (!existing) throw new PurchaseInvoiceNotFoundError();
        throw new PurchaseInvoiceStateError(existing.status === 'APPROVED'
          ? 'لا يمكن إلغاء فاتورة معتمدة؛ سجّل حركة مخزون تصحيحية بدلًا من ذلك'
          : 'تم إلغاء الفاتورة بالفعل');
      }
      await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PURCHASE_CANCELLED',
        entityType: 'purchase-invoice',
        entityId: id,
        details: { invoiceNumber: result.invoiceNumber, supplier: result.supplier, total: result.total },
      }, session);
    });
    if (!result) throw new PurchaseInvoiceStateError('تعذر إلغاء الفاتورة');
    return result;
  } finally {
    await session.endSession();
  }
}

export function clearMockPurchaseInvoices() {
  mockStore.invoices = [];
  approvingMockInvoices.clear();
}
