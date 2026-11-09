import mongoose, { Schema } from 'mongoose';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import type { ShiftRecord } from './staff-types';
import { getShiftDurationMinutes } from './shift-time';

type MockShiftStore = { shifts: ShiftRecord[] };
declare global {
  var matchaMockShiftStore: MockShiftStore | undefined;
}

const mockStore = globalThis.matchaMockShiftStore
  ?? (globalThis.matchaMockShiftStore = { shifts: [] });

const shiftSchema = new Schema<ShiftRecord>({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  username: { type: String, required: true },
  shiftType: { type: String, enum: ['DAY', 'NIGHT'], required: true },
  startedAt: { type: String, required: true },
  endedAt: String,
  totalMinutes: Number,
}, { versionKey: false, collection: 'staff_shifts' });
shiftSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { endedAt: { $exists: false } } });
const ShiftModel = (mongoose.models.StaffShift as mongoose.Model<ShiftRecord> | undefined)
  ?? mongoose.model<ShiftRecord>('StaffShift', shiftSchema);

function isMock() {
  return getDataProvider() === 'mock';
}

export async function getActiveShift(employeeId: string) {
  if (isMock()) return mockStore.shifts.find((shift) => shift.employeeId === employeeId && !shift.endedAt) ?? null;
  await connectToDatabase();
  return ShiftModel.findOne({ employeeId, endedAt: { $exists: false } }).lean() as unknown as ShiftRecord | null;
}

export async function startShift(input: Omit<ShiftRecord, 'id' | 'startedAt'>) {
  const active = await getActiveShift(input.employeeId);
  if (active) return { shift: active, created: false };
  const shift: ShiftRecord = { ...input, id: `shift-${crypto.randomUUID()}`, startedAt: new Date().toISOString() };
  if (isMock()) {
    mockStore.shifts.unshift(shift);
    return { shift, created: true };
  }
  await connectToDatabase();
  try {
    await ShiftModel.create(shift);
    return { shift, created: true };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const current = await getActiveShift(input.employeeId);
      if (current) return { shift: current, created: false };
    }
    throw error;
  }
}

export async function endShift(employeeId: string) {
  const shift = await getActiveShift(employeeId);
  if (!shift) return null;
  const endedAt = new Date();
  const totalMinutes = getShiftDurationMinutes({ startedAt: shift.startedAt, endedAt: endedAt.toISOString() });
  if (totalMinutes === null) throw new Error(`Invalid start time for shift ${shift.id}`);
  const update = { endedAt: endedAt.toISOString(), totalMinutes };
  if (isMock()) {
    Object.assign(shift, update);
    return { ...shift };
  }
  await connectToDatabase();
  return ShiftModel.findOneAndUpdate(
    { id: shift.id, endedAt: { $exists: false } },
    { $set: update },
    { new: true },
  ).lean() as unknown as ShiftRecord | null;
}

export async function listShifts(employeeId?: string) {
  if (isMock()) return mockStore.shifts
    .filter((shift) => !employeeId || shift.employeeId === employeeId)
    .map((shift) => ({ ...shift }));
  await connectToDatabase();
  return ShiftModel.find(employeeId ? { employeeId } : {}).sort({ startedAt: -1 }).lean() as unknown as ShiftRecord[];
}

export async function getShiftById(id: string) {
  if (isMock()) return mockStore.shifts.find((shift) => shift.id === id) ?? null;
  await connectToDatabase();
  return ShiftModel.findOne({ id }).lean() as unknown as ShiftRecord | null;
}
