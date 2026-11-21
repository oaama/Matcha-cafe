import mongoose, { Schema, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';

export type ActivityLogRecord = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
};

type MockActivityStore = { records: ActivityLogRecord[] };
declare global {
  var matchaMockActivityLog: MockActivityStore | undefined;
}

const mockStore = globalThis.matchaMockActivityLog
  ?? (globalThis.matchaMockActivityLog = { records: [] });

const activityLogSchema = new Schema<ActivityLogRecord>({
  id: { type: String, required: true, unique: true },
  actorId: { type: String, required: true, index: true },
  actorName: { type: String, required: true },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, required: true, index: true },
  details: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: String, required: true, index: true },
}, { versionKey: false, collection: 'cafe_activity_logs' });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const ActivityLogModel = (mongoose.models.CafeActivityLog as mongoose.Model<ActivityLogRecord> | undefined)
  ?? mongoose.model<ActivityLogRecord>('CafeActivityLog', activityLogSchema);

export async function recordActivity(
  input: Omit<ActivityLogRecord, 'id' | 'createdAt'>,
  session?: ClientSession,
) {
  const record: ActivityLogRecord = {
    ...input,
    id: `activity-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  if (getDataProvider() === 'mock') {
    mockStore.records.unshift(structuredClone(record));
    return record;
  }
  await connectToDatabase();
  await ActivityLogModel.create([record], { session });
  return record;
}

export async function listActivityLogs(filters: {
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 2000);
  if (getDataProvider() === 'mock') {
    const from = filters.from?.toISOString();
    const to = filters.to?.toISOString();
    return structuredClone(mockStore.records.filter((record) =>
      (!filters.entityType || record.entityType === filters.entityType)
      && (!filters.entityId || record.entityId === filters.entityId)
      && (!from || record.createdAt >= from)
      && (!to || record.createdAt <= to))
      .slice(0, limit));
  }
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.from || filters.to) {
    query.createdAt = {
      ...(filters.from ? { $gte: filters.from.toISOString() } : {}),
      ...(filters.to ? { $lte: filters.to.toISOString() } : {}),
    };
  }
  return ActivityLogModel.find(query).sort({ createdAt: -1 }).limit(limit).lean() as unknown as ActivityLogRecord[];
}

export function clearMockActivityLogs() {
  mockStore.records = [];
}
