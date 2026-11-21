import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { recordActivity } from './activity-log-repository';
import { connectToDatabase } from './database';
import { getDataProvider } from './data-mode';
import type { ManualRevenueRecord } from './revenue-types';

type MockRevenueStore = { records: ManualRevenueRecord[] };
declare global {
  var matchaMockRevenueStore: MockRevenueStore | undefined;
}

const mockStore = globalThis.matchaMockRevenueStore
  ?? (globalThis.matchaMockRevenueStore = { records: [] });

const revenueSchema = new Schema<ManualRevenueRecord>({
  id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: String, required: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  shiftId: { type: String, required: true, index: true },
  shiftType: { type: String, enum: ['DAY', 'NIGHT'], required: true },
  employeeId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  createdById: String,
  createdBy: String,
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
}, { versionKey: false, collection: 'manual_revenues' });
revenueSchema.index({ date: -1, shiftId: 1 });

const RevenueModel = (mongoose.models.ManualRevenue as mongoose.Model<ManualRevenueRecord> | undefined)
  ?? mongoose.model<ManualRevenueRecord>('ManualRevenue', revenueSchema);

export async function listManualRevenue(filters: {
  from?: string;
  to?: string;
  shiftId?: string;
  employeeId?: string;
} = {}) {
  if (getDataProvider() === 'mock') {
    return structuredClone(mockStore.records.filter((record) =>
      (!filters.from || record.date >= filters.from)
      && (!filters.to || record.date <= filters.to)
      && (!filters.shiftId || record.shiftId === filters.shiftId)
      && (!filters.employeeId || record.employeeId === filters.employeeId))
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)));
  }
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.shiftId) query.shiftId = filters.shiftId;
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  return RevenueModel.find(query).sort({ date: -1, createdAt: -1 }).limit(5000).lean() as unknown as ManualRevenueRecord[];
}

export async function createManualRevenue(
  input: Omit<ManualRevenueRecord, 'id' | 'createdAt' | 'updatedAt'>,
  actor: { id: string; username: string },
) {
  const now = new Date().toISOString();
  const record: ManualRevenueRecord = {
    ...input,
    createdById: actor.id,
    createdBy: actor.username,
    amount: Math.round(input.amount * 100) / 100,
    id: `revenue-${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  if (getDataProvider() === 'mock') {
    mockStore.records.unshift(structuredClone(record));
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'REVENUE_CREATED',
      entityType: 'manual-revenue',
      entityId: record.id,
      details: { shiftId: record.shiftId, amount: record.amount, date: record.date },
    });
  } else {
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        await RevenueModel.create([record], { session });
        await recordActivity({
          actorId: actor.id,
          actorName: actor.username,
          action: 'REVENUE_CREATED',
          entityType: 'manual-revenue',
          entityId: record.id,
          details: { shiftId: record.shiftId, amount: record.amount, date: record.date },
        }, session);
      });
    } finally {
      await session.endSession();
    }
  }
  return record;
}

export async function updateManualRevenue(
  id: string,
  input: Partial<Pick<ManualRevenueRecord, 'amount' | 'date' | 'description'>>,
  actor: { id: string; username: string },
) {
  const patch = {
    ...input,
    ...(input.amount !== undefined ? { amount: Math.round(input.amount * 100) / 100 } : {}),
    updatedAt: new Date().toISOString(),
  };
  let updated: ManualRevenueRecord | null = null;
  if (getDataProvider() === 'mock') {
    const record = mockStore.records.find((item) => item.id === id);
    if (!record) return null;
    Object.assign(record, patch);
    updated = structuredClone(record);
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'REVENUE_UPDATED',
      entityType: 'manual-revenue',
      entityId: id,
      details: { shiftId: updated.shiftId, amount: updated.amount, date: updated.date },
    });
  } else {
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        updated = await RevenueModel.findOneAndUpdate(
          { id },
          { $set: patch },
          { new: true, runValidators: true, session },
        ).lean() as ManualRevenueRecord | null;
        if (updated) await recordActivity({
          actorId: actor.id,
          actorName: actor.username,
          action: 'REVENUE_UPDATED',
          entityType: 'manual-revenue',
          entityId: id,
          details: { shiftId: updated.shiftId, amount: updated.amount, date: updated.date },
        }, session);
      });
    } finally {
      await session.endSession();
    }
  }
  return updated;
}

export async function deleteManualRevenue(id: string, actor: { id: string; username: string }) {
  let deleted: ManualRevenueRecord | null = null;
  if (getDataProvider() === 'mock') {
    const index = mockStore.records.findIndex((record) => record.id === id);
    if (index < 0) return false;
    deleted = mockStore.records.splice(index, 1)[0];
    await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'REVENUE_DELETED',
      entityType: 'manual-revenue',
      entityId: id,
      details: { shiftId: deleted.shiftId, amount: deleted.amount, date: deleted.date },
    });
  } else {
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        deleted = await RevenueModel.findOneAndDelete({ id }).session(session).lean() as ManualRevenueRecord | null;
        if (deleted) await recordActivity({
          actorId: actor.id,
          actorName: actor.username,
          action: 'REVENUE_DELETED',
          entityType: 'manual-revenue',
          entityId: id,
          details: { shiftId: deleted.shiftId, amount: deleted.amount, date: deleted.date },
        }, session);
      });
    } finally {
      await session.endSession();
    }
    if (!deleted) return false;
  }
  return true;
}

export function clearMockManualRevenue() {
  mockStore.records = [];
}
