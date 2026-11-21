import mongoose, { Schema } from 'mongoose';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import { recordActivity } from './activity-log-repository';
import { listShifts } from './shift-repository';
import { calculatePayrollStatement } from './payroll-statement';
import { EMPTY_PAYROLL_PROFILE } from './payroll-types';
import type { PayrollAdvance, PayrollOvertimeEntry, PayrollProfile, PayrollRecord, PayrollStatement } from './payroll-types';

type MockPayrollStore = { records: PayrollRecord[] };
declare global {
  var matchaMockPayrollStore: MockPayrollStore | undefined;
}

const mockStore = globalThis.matchaMockPayrollStore
  ?? (globalThis.matchaMockPayrollStore = { records: [] });

const profileSchema = new Schema<PayrollProfile>({
  jobTitle: { type: String, required: true, trim: true, maxlength: 120 },
  hourlyRate: { type: Number, required: true, min: 0, max: 1_000_000 },
  hireDate: { type: String, required: true },
  additionalInfo: { type: String, required: true, maxlength: 2000 },
}, { _id: false });

const advanceSchema = new Schema<PayrollAdvance>({
  id: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01, max: 10_000_000 },
  date: { type: String, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: String, required: true },
}, { _id: false });

const overtimeSchema = new Schema<PayrollOvertimeEntry>({
  id: { type: String, required: true },
  date: { type: String, required: true },
  hours: { type: Number, required: true, min: 0.01, max: 1000 },
  hourlyRate: { type: Number, required: true, min: 0.01, max: 1_000_000 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: String, required: true },
}, { _id: false });

const payrollSchema = new Schema<PayrollRecord>({
  employeeId: { type: String, required: true, unique: true },
  profile: { type: profileSchema, required: true },
  advances: { type: [advanceSchema], default: [] },
  overtimeEntries: { type: [overtimeSchema], default: [] },
}, { versionKey: false, collection: 'staff_payroll' });

const PayrollModel = (mongoose.models.StaffPayroll as mongoose.Model<PayrollRecord> | undefined)
  ?? mongoose.model<PayrollRecord>('StaffPayroll', payrollSchema);

type ActivityActor = { id: string; username: string };

function copyRecord(record: PayrollRecord): PayrollRecord {
  return {
    employeeId: record.employeeId,
    profile: { ...record.profile },
    advances: record.advances.map((advance) => ({ ...advance })),
    overtimeEntries: record.overtimeEntries.map((entry) => ({ ...entry })),
  };
}

function emptyRecord(employeeId: string): PayrollRecord {
  return {
    employeeId,
    profile: { ...EMPTY_PAYROLL_PROFILE },
    advances: [],
    overtimeEntries: [],
  };
}

function getMockRecord(employeeId: string) {
  return mockStore.records.find((record) => record.employeeId === employeeId) ?? null;
}

async function getMongoRecord(employeeId: string) {
  await connectToDatabase();
  const record = await PayrollModel.findOne({ employeeId }).lean();
  return record as PayrollRecord | null;
}

export async function getPayrollRecord(employeeId: string): Promise<PayrollRecord> {
  const record = getDataProvider() === 'mock'
    ? getMockRecord(employeeId)
    : await getMongoRecord(employeeId);
  return record ? copyRecord(record) : emptyRecord(employeeId);
}

export async function listPayrollRecords(employeeIds: string[]) {
  if (getDataProvider() === 'mock') {
    return mockStore.records.filter((record) => employeeIds.includes(record.employeeId)).map(copyRecord);
  }
  await connectToDatabase();
  const records = await PayrollModel.find({ employeeId: { $in: employeeIds } }).lean();
  return (records as PayrollRecord[]).map(copyRecord);
}

export async function updatePayrollProfile(employeeId: string, profile: PayrollProfile, actor?: ActivityActor) {
  if (getDataProvider() === 'mock') {
    let record = getMockRecord(employeeId);
    if (!record) {
      record = emptyRecord(employeeId);
      mockStore.records.push(record);
    }
    record.profile = { ...profile };
    if (actor) await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PAYROLL_PROFILE_UPDATED',
      entityType: 'payroll',
      entityId: employeeId,
      details: { employeeId, jobTitle: profile.jobTitle, hourlyRate: profile.hourlyRate },
    });
    return copyRecord(record);
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let result: PayrollRecord | null = null;
    await session.withTransaction(async () => {
      const record = await PayrollModel.findOneAndUpdate(
        { employeeId },
        { $set: { profile }, $setOnInsert: { employeeId, advances: [], overtimeEntries: [] } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session },
      ).lean();
      if (!record) throw new Error('Unable to update payroll profile');
      result = copyRecord(record as PayrollRecord);
      if (actor) await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PAYROLL_PROFILE_UPDATED',
        entityType: 'payroll',
        entityId: employeeId,
        details: { employeeId, jobTitle: profile.jobTitle, hourlyRate: profile.hourlyRate },
      }, session);
    });
    if (!result) throw new Error('Unable to update payroll profile');
    return result;
  } finally {
    await session.endSession();
  }
}

export async function createPayrollAdvance(employeeId: string, input: Omit<PayrollAdvance, 'id' | 'createdAt'>, actor?: ActivityActor) {
  const advance: PayrollAdvance = { ...input, id: `advance-${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
  if (getDataProvider() === 'mock') {
    let record = getMockRecord(employeeId);
    if (!record) {
      record = emptyRecord(employeeId);
      mockStore.records.push(record);
    }
    record.advances.push(advance);
    if (actor) await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PAYROLL_ADVANCE_CREATED',
      entityType: 'payroll',
      entityId: employeeId,
      details: { employeeId, entryId: advance.id, amount: advance.amount, date: advance.date },
    });
    return { ...advance };
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await PayrollModel.findOneAndUpdate(
        { employeeId },
        { $setOnInsert: { employeeId, profile: EMPTY_PAYROLL_PROFILE }, $push: { advances: advance } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true, session },
      );
      if (actor) await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PAYROLL_ADVANCE_CREATED',
        entityType: 'payroll',
        entityId: employeeId,
        details: { employeeId, entryId: advance.id, amount: advance.amount, date: advance.date },
      }, session);
    });
  } finally {
    await session.endSession();
  }
  return { ...advance };
}

export async function deletePayrollAdvance(employeeId: string, id: string, actor?: ActivityActor) {
  if (getDataProvider() === 'mock') {
    const record = getMockRecord(employeeId);
    if (!record) return false;
    const index = record.advances.findIndex((advance) => advance.id === id);
    if (index < 0) return false;
    const [advance] = record.advances.splice(index, 1);
    if (actor) await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PAYROLL_ADVANCE_DELETED',
      entityType: 'payroll',
      entityId: employeeId,
      details: { employeeId, entryId: id, amount: advance.amount, date: advance.date },
    });
    return true;
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const record = await PayrollModel.findOne({ employeeId, 'advances.id': id }).session(session);
      const advance = record?.advances.find((entry) => entry.id === id);
      if (!advance) return;
      await PayrollModel.updateOne({ employeeId, 'advances.id': id }, { $pull: { advances: { id } } }, { session });
      if (actor) await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PAYROLL_ADVANCE_DELETED',
        entityType: 'payroll',
        entityId: employeeId,
        details: { employeeId, entryId: id, amount: advance.amount, date: advance.date },
      }, session);
      deleted = true;
    });
    return deleted;
  } finally {
    await session.endSession();
  }
}

export async function createPayrollOvertime(employeeId: string, input: Omit<PayrollOvertimeEntry, 'id' | 'createdAt'>, actor?: ActivityActor) {
  const overtime: PayrollOvertimeEntry = { ...input, id: `overtime-${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
  if (getDataProvider() === 'mock') {
    let record = getMockRecord(employeeId);
    if (!record) {
      record = emptyRecord(employeeId);
      mockStore.records.push(record);
    }
    record.overtimeEntries.push(overtime);
    if (actor) await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PAYROLL_OVERTIME_CREATED',
      entityType: 'payroll',
      entityId: employeeId,
      details: { employeeId, entryId: overtime.id, hours: overtime.hours, hourlyRate: overtime.hourlyRate, date: overtime.date },
    });
    return { ...overtime };
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await PayrollModel.findOneAndUpdate(
        { employeeId },
        { $setOnInsert: { employeeId, profile: EMPTY_PAYROLL_PROFILE }, $push: { overtimeEntries: overtime } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true, session },
      );
      if (actor) await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PAYROLL_OVERTIME_CREATED',
        entityType: 'payroll',
        entityId: employeeId,
        details: { employeeId, entryId: overtime.id, hours: overtime.hours, hourlyRate: overtime.hourlyRate, date: overtime.date },
      }, session);
    });
  } finally {
    await session.endSession();
  }
  return { ...overtime };
}

export async function deletePayrollOvertime(employeeId: string, id: string, actor?: ActivityActor) {
  if (getDataProvider() === 'mock') {
    const record = getMockRecord(employeeId);
    if (!record) return false;
    const index = record.overtimeEntries.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    const [overtime] = record.overtimeEntries.splice(index, 1);
    if (actor) await recordActivity({
      actorId: actor.id,
      actorName: actor.username,
      action: 'PAYROLL_OVERTIME_DELETED',
      entityType: 'payroll',
      entityId: employeeId,
      details: { employeeId, entryId: id, hours: overtime.hours, hourlyRate: overtime.hourlyRate, date: overtime.date },
    });
    return true;
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const record = await PayrollModel.findOne({ employeeId, 'overtimeEntries.id': id }).session(session);
      const overtime = record?.overtimeEntries.find((entry) => entry.id === id);
      if (!overtime) return;
      await PayrollModel.updateOne({ employeeId, 'overtimeEntries.id': id }, { $pull: { overtimeEntries: { id } } }, { session });
      if (actor) await recordActivity({
        actorId: actor.id,
        actorName: actor.username,
        action: 'PAYROLL_OVERTIME_DELETED',
        entityType: 'payroll',
        entityId: employeeId,
        details: { employeeId, entryId: id, hours: overtime.hours, hourlyRate: overtime.hourlyRate, date: overtime.date },
      }, session);
      deleted = true;
    });
    return deleted;
  } finally {
    await session.endSession();
  }
}

export async function getPayrollStatement(employeeId: string, startDate: string, endDate: string): Promise<PayrollStatement> {
  const [record, shifts] = await Promise.all([
    getPayrollRecord(employeeId),
    listShifts(employeeId),
  ]);
  return calculatePayrollStatement({
    employeeId,
    profile: record.profile,
    shifts,
    advances: record.advances,
    overtimeEntries: record.overtimeEntries,
    startDate,
    endDate,
  });
}

export function clearMockPayroll() {
  mockStore.records = [];
}
