import mongoose, { Schema } from 'mongoose';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import type { ShiftPeriod, ShiftRecord } from './staff-types';
import { getShiftDurationMinutes, shiftEndedToday } from './shift-time';

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
  periods: [{
    _id: false,
    startedAt: { type: String, required: true },
    endedAt: String,
  }],
}, { versionKey: false, collection: 'staff_shifts' });
shiftSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { endedAt: { $exists: false } } });
shiftSchema.index({ employeeId: 1, endedAt: -1 });
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

async function getLatestShift(employeeId: string) {
  if (isMock()) return mockStore.shifts
    .filter((shift) => shift.employeeId === employeeId)
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0] ?? null;
  await connectToDatabase();
  return ShiftModel.findOne({ employeeId })
    .sort({ startedAt: -1 })
    .lean() as unknown as ShiftRecord | null;
}

export async function startShift(input: Omit<ShiftRecord, 'id' | 'startedAt'>, now = new Date()) {
  const active = await getActiveShift(input.employeeId);
  if (active) return { shift: active, created: false };
  const latestEnded = await getLatestShift(input.employeeId);
  if (latestEnded && shiftEndedToday(latestEnded, now)) {
    return { shift: null, created: false, completedToday: true };
  }
  const startedAt = now.toISOString();
  const shift: ShiftRecord = {
    ...input,
    id: `shift-${crypto.randomUUID()}`,
    startedAt,
    periods: [{ startedAt }],
  };
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

export async function endShift(employeeId: string, now = new Date()) {
  const shift = await getActiveShift(employeeId);
  if (!shift) return null;
  const endedAt = now.toISOString();
  const periods: ShiftPeriod[] = shift.periods?.length
    ? shift.periods.map((period) => ({ ...period }))
    : [{ startedAt: shift.startedAt }];
  const activePeriod = periods[periods.length - 1];
  if (activePeriod.endedAt) throw new Error(`Active shift ${shift.id} has no open work period`);
  activePeriod.endedAt = endedAt;
  const totalMinutes = getShiftDurationMinutes({ startedAt: shift.startedAt, periods }, now.getTime());
  if (totalMinutes === null) throw new Error(`Invalid start time for shift ${shift.id}`);
  const update = { endedAt, totalMinutes, periods };
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

export async function reactivateShift(id: string, now = new Date()) {
  const shift = await getShiftById(id);
  if (!shift) return { shift: null, reason: 'not-found' as const };
  if (!shift.endedAt) return { shift: null, reason: 'already-active' as const };
  if (await getActiveShift(shift.employeeId)) return { shift: null, reason: 'employee-has-active-shift' as const };
  const latestShift = await getLatestShift(shift.employeeId);
  if (latestShift?.id !== shift.id) return { shift: null, reason: 'not-latest' as const };

  const periods: ShiftPeriod[] = shift.periods?.length
    ? shift.periods.map((period) => ({ ...period }))
    : [{ startedAt: shift.startedAt, endedAt: shift.endedAt }];
  const lastPeriod = periods[periods.length - 1];
  if (!lastPeriod.endedAt) lastPeriod.endedAt = shift.endedAt;
  const startedAt = now.toISOString();
  periods.push({ startedAt });
  const totalMinutes = getShiftDurationMinutes({ startedAt: shift.startedAt, periods }, now.getTime());
  if (totalMinutes === null) throw new Error(`Invalid work periods for shift ${shift.id}`);

  if (isMock()) {
    const hasActiveShift = mockStore.shifts.some((item) => item.employeeId === shift.employeeId && !item.endedAt);
    if (hasActiveShift) return { shift: null, reason: 'employee-has-active-shift' as const };
    Object.assign(shift, { periods, totalMinutes });
    delete shift.endedAt;
    return { shift: { ...shift }, reason: null };
  }

  await connectToDatabase();
  try {
    const reactivated = await ShiftModel.findOneAndUpdate(
      { id, endedAt: { $exists: true } },
      { $set: { periods, totalMinutes }, $unset: { endedAt: 1 } },
      { new: true },
    ).lean() as unknown as ShiftRecord | null;
    return reactivated
      ? { shift: reactivated, reason: null }
      : { shift: null, reason: 'already-active' as const };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { shift: null, reason: 'employee-has-active-shift' as const };
    }
    throw error;
  }
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
