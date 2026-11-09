import type { ShiftRecord } from './staff-types';

export function getShiftDurationMinutes(shift: Pick<ShiftRecord, 'startedAt' | 'endedAt'>, now = Date.now()) {
  const startedAt = Date.parse(shift.startedAt);
  const endedAt = shift.endedAt ? Date.parse(shift.endedAt) : now;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return Math.max(0, Math.floor((endedAt - startedAt) / 60_000));
}

export function formatShiftDuration(totalMinutes: number | null) {
  if (totalMinutes === null) return 'تعذر حساب المدة';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} س ${minutes} د` : `${minutes} د`;
}
